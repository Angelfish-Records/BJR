// web/app/api/admin/exegesis/thread/lock/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  meta: {
    trackId: string;
    groupKey: string;
    locked: boolean;
    pinnedCommentId: string | null;
    commentCount: number;
    lastActivityAt: string;
    updatedAt: string;
  };
};

type ApiErr = { ok: false; error: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "1" || s === "true" || s === "yes";
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  const trackId = norm(body?.trackId);
  const groupKey = norm(body?.groupKey);
  const locked = asBool(body?.locked);

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (!groupKey) return json(400, { ok: false, error: "Missing groupKey." });

  const r = await sql<{
    track_id: string;
    group_key: string;
    pinned_comment_id: string | null;
    locked: boolean;
    comment_count: number;
    last_activity_at: string;
    updated_at: string;
  }>`
    with ins as (
      insert into exegesis_thread_meta (track_id, group_key)
      values (${trackId}, ${groupKey})
      on conflict (track_id, group_key) do nothing
      returning 1
    ),
    upd as (
      update exegesis_thread_meta
      set locked = ${locked}::boolean,
          updated_at = now()
      where track_id = ${trackId}
        and group_key = ${groupKey}
      returning track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, updated_at
    )
    select * from upd
  `;

  const row = r.rows?.[0];
  if (!row) return json(500, { ok: false, error: "Update failed." });

  return json(200, {
    ok: true,
    meta: {
      trackId: row.track_id,
      groupKey: row.group_key,
      locked: row.locked,
      pinnedCommentId: row.pinned_comment_id,
      commentCount: Number(row.comment_count ?? 0),
      lastActivityAt: row.last_activity_at,
      updatedAt: row.updated_at,
    },
  });
}