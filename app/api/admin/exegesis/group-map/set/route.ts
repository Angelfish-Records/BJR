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

export async function POST(req: NextRequest) {
  const adminMemberId = await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const trackId = norm(body?.trackId);
  const canonicalGroupKey = norm(body?.canonicalGroupKey);
  const lineKeys0 = asStringArray(body?.lineKeys);
  const kind0 = norm(body?.kind) || "rep";

  const lineKeys = Array.from(new Set(lineKeys0)).slice(0, 500); // admin safety cap

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
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
        ${trackId},
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
