//web/app/api/admin/exegesis/group-map/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  trackId: string;
  // mapping keyed by anchorLineKey
  map: Record<string, { canonicalGroupKey: string; updatedAt: string }>;
  // list of canonical groups already used on this track
  groups: Array<{
    canonicalGroupKey: string;
    count: number;
    updatedAt: string;
  }>;
};

type ApiErr = { ok: false; error: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function GET(req: NextRequest) {
  await requireAdminMemberId();

  const url = new URL(req.url);
  const trackId = norm(url.searchParams.get("trackId"));
  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (trackId.length > 200)
    return json(400, { ok: false, error: "Invalid trackId." });

  const r = await sql<{
    track_id: string;
    anchor_line_key: string;
    canonical_group_key: string;
    updated_at: string;
  }>`
    select track_id, anchor_line_key, canonical_group_key, updated_at
    from exegesis_group_map
    where track_id = ${trackId}
    order by updated_at desc
  `;

  const map: ApiOk["map"] = {};
  for (const row of r.rows ?? []) {
    map[row.anchor_line_key] = {
      canonicalGroupKey: row.canonical_group_key,
      updatedAt: row.updated_at,
    };
  }

  const g = await sql<{
    canonical_group_key: string;
    n: number;
    updated_at: string;
  }>`
    select canonical_group_key, count(*)::int as n, max(updated_at) as updated_at
    from exegesis_group_map
    where track_id = ${trackId}
    group by canonical_group_key
    order by max(updated_at) desc
  `;

  return json(200, {
    ok: true,
    trackId,
    map,
    groups: (g.rows ?? []).map((x) => ({
      canonicalGroupKey: x.canonical_group_key,
      count: Number(x.n ?? 0),
      updatedAt: x.updated_at,
    })),
  });
}
