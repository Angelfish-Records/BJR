// web/app/api/admin/exegesis/thread/pin/route.ts
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
    pinnedCommentId: string | null;
    locked: boolean;
    commentCount: number;
    lastActivityAt: string;
    updatedAt: string;
  };
};

type ApiErr = { ok: false; error: string; code?: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  const trackId = norm(body?.trackId);
  const groupKey = norm(body?.groupKey);
  const pinnedCommentIdRaw = norm(body?.pinnedCommentId);
  const pinnedCommentId = pinnedCommentIdRaw ? pinnedCommentIdRaw : null;

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (!groupKey) return json(400, { ok: false, error: "Missing groupKey." });
  if (pinnedCommentId && !isUuid(pinnedCommentId))
    return json(400, { ok: false, error: "Invalid pinnedCommentId." });

  // If pinning, verify:
  // - comment exists
  // - belongs to same (track_id, group_key)
  // - is a root (parent_id is null)
  // - is not deleted
  if (pinnedCommentId) {
    const c = await sql<{
      id: string;
      track_id: string;
      group_key: string;
      parent_id: string | null;
      status: string;
    }>`
      select id, track_id, group_key, parent_id, status::text as status
      from exegesis_comment
      where id = ${pinnedCommentId}::uuid
      limit 1
    `;
    const row = c.rows?.[0];
    if (!row) return json(404, { ok: false, error: "Comment not found." });
    if (row.track_id !== trackId || row.group_key !== groupKey) {
      return json(400, { ok: false, error: "Comment is not in that thread." });
    }
    if (row.parent_id) {
      return json(400, {
        ok: false,
        error: "Only root comments can be pinned.",
      });
    }
    if (row.status === "deleted") {
      return json(400, {
        ok: false,
        error: "Cannot pin a deleted comment.",
      });
    }
  }

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
      set pinned_comment_id = ${pinnedCommentId}::uuid,
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
      pinnedCommentId: row.pinned_comment_id,
      locked: row.locked,
      commentCount: Number(row.comment_count ?? 0),
      lastActivityAt: row.last_activity_at,
      updatedAt: row.updated_at,
    },
  });
}