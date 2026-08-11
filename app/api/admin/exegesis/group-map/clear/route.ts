//web/app/api/admin/exegesis/group-map/clear/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = { ok: true; deleted: number };
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
  lineKeys: string[],
): Promise<boolean> {
  const lineKeysJson = JSON.stringify(lineKeys);
  const result = await sql<{ blocked: boolean }>`
    with selected_line_keys as (
      select jsonb_array_elements_text(${lineKeysJson}::jsonb) as line_key
    ),
    changing as (
      select selected.line_key, group_map.canonical_group_key as group_key
      from selected_line_keys selected
      join exegesis_group_map group_map
        on group_map.track_id = ${recordingId}
       and group_map.anchor_line_key = selected.line_key
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
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const recordingId = norm(body?.recordingId);
  const lineKeys = asStringArray(body?.lineKeys);

  if (!recordingId) return json(400, { ok: false, error: "Missing recordingId." });
  if (lineKeys.length === 0)
    return json(400, { ok: false, error: "Missing lineKeys." });

  if (await wouldDetachDiscussion(recordingId, lineKeys)) {
    return json(409, {
      ok: false,
      error:
        "This selection has existing discussion. Ungrouping it is blocked until discussion migration is supported.",
    });
  }

  let deleted = 0;
  for (const lk of lineKeys) {
    if (lk.length > 200) continue;

    const del = await sql<{ ok: number }>`
      delete from exegesis_group_map
      where track_id = ${recordingId}
        and anchor_line_key = ${lk}
      returning 1 as ok
    `;
    deleted += (del.rows ?? []).length;
  }

  return json(200, { ok: true, deleted });
}
