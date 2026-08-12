import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ThreadRow = {
  recordingId: string;
  groupKey: string;
  locked: boolean;
  pinnedCommentId: string | null;
  commentCount: number;
  lastActivityAt: string;
  updatedAt: string;
  lineKey: string | null;
  lineTextSnapshot: string | null;
  latestCommentPreview: string | null;
};

type ApiOk = {
  ok: true;
  threads: ThreadRow[];
};

type ApiErr = {
  ok: false;
  error: string;
};

type DbThreadRow = {
  track_id: string;
  group_key: string;
  locked: boolean;
  pinned_comment_id: string | null;
  comment_count: number;
  last_activity_at: string;
  updated_at: string;
  line_key: string | null;
  line_text_snapshot: string | null;
  body_plain: string | null;
};

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function clampInt(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = value ? Number(value) : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;

  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export async function GET(req: NextRequest) {
  await requireAdminMemberId();

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);

  const result = await sql<DbThreadRow>`
    select
      meta.track_id,
      meta.group_key,
      meta.locked,
      meta.pinned_comment_id::text as pinned_comment_id,
      meta.comment_count,
      meta.last_activity_at::text as last_activity_at,
      meta.updated_at::text as updated_at,
      latest.line_key,
      latest.line_text_snapshot,
      latest.body_plain
    from exegesis_thread_meta meta
    left join lateral (
      select
        comment.line_key,
        comment.line_text_snapshot,
        comment.body_plain
      from exegesis_comment comment
      where comment.track_id = meta.track_id
        and comment.group_key = meta.group_key
        and comment.status <> 'deleted'
      order by comment.created_at desc
      limit 1
    ) latest on true
    order by meta.last_activity_at desc
    limit ${limit}
  `;

  const threads: ThreadRow[] = result.rows.map((row) => ({
    recordingId: row.track_id,
    groupKey: row.group_key,
    locked: Boolean(row.locked),
    pinnedCommentId: row.pinned_comment_id,
    commentCount: Number(row.comment_count ?? 0),
    lastActivityAt: row.last_activity_at,
    updatedAt: row.updated_at,
    lineKey: row.line_key,
    lineTextSnapshot: row.line_text_snapshot,
    latestCommentPreview: row.body_plain,
  }));

  return json(200, { ok: true, threads });
}
