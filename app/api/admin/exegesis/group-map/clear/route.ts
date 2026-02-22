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

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const trackId = norm(body?.trackId);
  const lineKeys = asStringArray(body?.lineKeys);

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (lineKeys.length === 0)
    return json(400, { ok: false, error: "Missing lineKeys." });

  let deleted = 0;
  for (const lk of lineKeys) {
    if (lk.length > 200) continue;

    const del = await sql<{ ok: number }>`
      delete from exegesis_group_map
      where track_id = ${trackId}
        and anchor_line_key = ${lk}
      returning 1 as ok
    `;
    deleted += (del.rows ?? []).length;
  }

  return json(200, { ok: true, deleted });
}
