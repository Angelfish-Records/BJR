import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";
import { buildExegesisIdentityDtoMap } from "@/lib/memberIdentityServer";
import { resolveAuthorDisplayIdentity } from "@/lib/memberIdentity";

export const runtime = "nodejs";

type CommentStatus = "live" | "hidden" | "deleted";

type ReportRow = {
  reportId: string;
  createdAt: string;
  category: string;
  reason: string;

  commentId: string;
  commentStatus: CommentStatus;
  recordingId: string;
  groupKey: string;
  lineKey: string;
  lineTextSnapshot: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyPlain: string;
  commentCreatedAt: string;
  createdByMemberId: string;
  authorDisplayName: string;
  authorIsAdmin: boolean;
  pinned: boolean;
  threadLocked: boolean;
};

type ApiOk = {
  ok: true;
  reports: ReportRow[];
};

type ApiErr = {
  ok: false;
  error: string;
};

type DbReportRow = {
  report_id: string;
  report_created_at: string;
  category: string;
  reason: string;

  comment_id: string;
  comment_status: CommentStatus;
  track_id: string;
  group_key: string;
  line_key: string;
  line_text_snapshot: string;
  parent_id: string | null;
  root_id: string;
  depth: number;
  body_plain: string;
  comment_created_at: string;
  created_by_member_id: string;
  pinned: boolean | null;
  thread_locked: boolean | null;
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

  const result = await sql<DbReportRow>`
    select
      report.id::text as report_id,
      report.created_at::text as report_created_at,
      report.category,
      report.reason,

      comment.id::text as comment_id,
      comment.status::text as comment_status,
      comment.track_id,
      comment.group_key,
      comment.line_key,
      comment.line_text_snapshot,
      comment.parent_id::text as parent_id,
      comment.root_id::text as root_id,
      comment.depth,
      comment.body_plain,
      comment.created_at::text as comment_created_at,
      comment.created_by_member_id::text as created_by_member_id,

      (meta.pinned_comment_id = comment.id) as pinned,
      meta.locked as thread_locked
    from exegesis_report report
    join exegesis_comment comment
      on comment.id = report.comment_id
    left join exegesis_thread_meta meta
      on meta.track_id = comment.track_id
     and meta.group_key = comment.group_key
    order by report.created_at desc
    limit ${limit}
  `;

  const memberIds = result.rows.map(
    (row) => row.created_by_member_id,
  );

  const identities = await buildExegesisIdentityDtoMap(memberIds);

  const reports: ReportRow[] = result.rows.map((row) => {
    const author = resolveAuthorDisplayIdentity(
      identities[row.created_by_member_id],
    );

    return {
      reportId: row.report_id,
      createdAt: row.report_created_at,
      category: row.category,
      reason: row.reason,

      commentId: row.comment_id,
      commentStatus: row.comment_status,
      recordingId: row.track_id,
      groupKey: row.group_key,
      lineKey: row.line_key,
      lineTextSnapshot: row.line_text_snapshot,
      parentId: row.parent_id,
      rootId: row.root_id,
      depth: Number(row.depth ?? 0),
      bodyPlain: row.body_plain,
      commentCreatedAt: row.comment_created_at,
      createdByMemberId: row.created_by_member_id,
      authorDisplayName: author.displayName,
      authorIsAdmin: author.isAdmin,
      pinned: Boolean(row.pinned),
      threadLocked: Boolean(row.thread_locked),
    };
  });

  return json(200, { ok: true, reports });
}
