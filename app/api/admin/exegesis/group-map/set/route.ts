//web/app/api/admin/exegesis/group-map/set/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = { ok: true; updated: number };
type ApiErr = { ok: false; error: string };
function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}
function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}
function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => norm(x)).filter(Boolean) : [];
}

async function wouldDetachDiscussion(
  recordingId: string,
  canonicalGroupKey: string,
  lineKeys: string[],
): Promise<boolean> {
  const lineKeysJson = JSON.stringify(lineKeys);
  const result = await sql<{ blocked: boolean }>`
    with selected_line_keys as (
      select jsonb_array_elements_text(${lineKeysJson}::jsonb) as line_key
    ),
    current_groups as (
      select
        selected.line_key,
        coalesce(group_map.canonical_group_key, 'lk:' || selected.line_key) as group_key
      from selected_line_keys selected
      left join exegesis_group_map group_map
        on group_map.track_id = ${recordingId}
       and group_map.anchor_line_key = selected.line_key
    ),
    changing as (
      select line_key, group_key
      from current_groups
      where group_key <> ${canonicalGroupKey}
    )
    select exists(
      select 1
      from exegesis_comment comment_row
      join changing
        on changing.line_key = comment_row.line_key
       and changing.group_key = comment_row.group_key
      where comment_row.track_id = ${recordingId}

      union all

      select 1
      from exegesis_thread_meta thread_meta
      join changing on changing.group_key = thread_meta.group_key
      where thread_meta.track_id = ${recordingId}
    ) as blocked
  `;

  return Boolean(result.rows?.[0]?.blocked);
}

export async function POST(req: NextRequest) {
  const adminMemberId = await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const recordingId = norm(body?.recordingId);
  const canonicalGroupKey = norm(body?.canonicalGroupKey);
  const lineKeys0 = asStringArray(body?.lineKeys);
  const kind0 = norm(body?.kind) || "rep";

  const lineKeys = Array.from(new Set(lineKeys0)).slice(0, 500); // admin safety cap

  if (!recordingId) return json(400, { ok: false, error: "Missing recordingId." });
  if (!canonicalGroupKey)
    return json(400, { ok: false, error: "Missing canonicalGroupKey." });
  if (/\s/.test(canonicalGroupKey) || canonicalGroupKey.length > 200) {
    return json(400, { ok: false, error: "Invalid canonicalGroupKey." });
  }

  // Minimal kind validation: keep it simple and extensible.
  const kind = kind0.toLowerCase();
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(kind)) {
    return json(400, { ok: false, error: "Invalid kind." });
  }

  if (lineKeys.length === 0)
    return json(400, { ok: false, error: "Missing lineKeys." });

  if (await wouldDetachDiscussion(recordingId, canonicalGroupKey, lineKeys)) {
    return json(409, {
      ok: false,
      error:
        "This selection has existing discussion. Regrouping it is blocked until discussion migration is supported.",
    });
  }

  let updated = 0;

  for (const lk of lineKeys) {
    if (lk.length > 200) continue; // lineKey sanity guard

    await sql`
      insert into exegesis_group_map (
        track_id,
        anchor_line_key,
        canonical_group_key,
        scheme_version,
        kind,
        created_by_member_id
      )
      values (
        ${recordingId},
        ${lk},
        ${canonicalGroupKey},
        2,
        ${kind},
        ${adminMemberId}::uuid
      )
      on conflict (track_id, anchor_line_key)
      do update set
        canonical_group_key = excluded.canonical_group_key,
        scheme_version = excluded.scheme_version,
        kind = excluded.kind,
        updated_at = now()
    `;
    updated += 1;
  }

  return json(200, { ok: true, updated });
}
