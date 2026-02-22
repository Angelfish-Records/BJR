// web/app/api/admin/exegesis/group-map/upsert/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  map: {
    trackId: string;
    anchorLineKey: string;
    canonicalGroupKey: string;
    kind: string;
    updatedAt: string;
    createdAt: string;
  };
};

type ApiErr = { ok: false; error: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export async function POST(req: NextRequest) {
  const adminId = await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  const trackId = norm(body?.trackId);
  const anchorLineKey = norm(body?.anchorLineKey);
  const canonicalGroupKey = norm(body?.canonicalGroupKey);
  const kind = norm(body?.kind) || "rep";

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (!anchorLineKey)
    return json(400, { ok: false, error: "Missing anchorLineKey." });
  if (!canonicalGroupKey)
    return json(400, { ok: false, error: "Missing canonicalGroupKey." });
  if (canonicalGroupKey.length > 220)
    return json(400, { ok: false, error: "canonicalGroupKey too long." });

  const r = await sql<{
    track_id: string;
    anchor_line_key: string;
    canonical_group_key: string;
    kind: string;
    created_at: string;
    updated_at: string;
  }>`
    insert into exegesis_group_map (
      track_id,
      anchor_line_key,
      canonical_group_key,
      kind,
      created_by_member_id,
      updated_at
    )
    values (
      ${trackId},
      ${anchorLineKey},
      ${canonicalGroupKey},
      ${kind},
      ${adminId}::uuid,
      now()
    )
    on conflict (track_id, anchor_line_key) do update
    set
      canonical_group_key = excluded.canonical_group_key,
      kind = excluded.kind,
      created_by_member_id = excluded.created_by_member_id,
      updated_at = now()
    returning track_id, anchor_line_key, canonical_group_key, kind, created_at, updated_at
  `;

  const row = r.rows?.[0];
  if (!row) return json(500, { ok: false, error: "Upsert failed." });

  return json(200, {
    ok: true,
    map: {
      trackId: row.track_id,
      anchorLineKey: row.anchor_line_key,
      canonicalGroupKey: row.canonical_group_key,
      kind: row.kind,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  });
}