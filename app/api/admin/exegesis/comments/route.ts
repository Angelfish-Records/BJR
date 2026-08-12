import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";
import { buildExegesisIdentityDtoMap } from "@/lib/memberIdentityServer";
import { resolveAuthorDisplayIdentity } from "@/lib/memberIdentity";

export const runtime = "nodejs";

type CommentStatus = "live" | "hidden" | "deleted";
type TimeWindow = "24h" | "7d" | "all";
type StatusFilter = CommentStatus | "all";

type CommentRow = {
  id: string;
  recordingId: string;
  groupKey: string;
  lineKey: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyPlain: string;
  lineTextSnapshot: string;
  createdByMemberId: string;
  authorDisplayName: string;
  authorIsAdmin: boolean;
  status: CommentStatus;
  createdAt: string;
  editedAt: string | null;
  voteCount: number;
  reportCount: number;
  pinned: boolean;
  threadLocked: boolean;
};

type ApiOk = {
  ok: true;
  comments: CommentRow[];
};

type ApiErr = {
  ok: false;
  error: string;
};

type DbCommentRow = {
  id: string;
  track_id: string;
  group_key: string;
  line_key: string;
  parent_id: string | null;
  root_id: string;
  depth: number;
  body_plain: string;
  line_text_snapshot: string;
  created_by_member_id: string;
  status: CommentStatus;
  created_at: string;
  edited_at: string | null;
  vote_count: number;
  report_count: number;
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

function readWindow(value: string | null): TimeWindow {
  if (value === "7d" || value === "all") return value;
  return "24h";
}

function readStatus(value: string | null): StatusFilter {
  if (
    value === "live" ||
    value === "hidden" ||
    value === "deleted"
  ) {
    return value;
  }

  return "all";
}

function sinceIsoForWindow(windowValue: TimeWindow): string | null {
  if (windowValue === "all") return null;

  const hours = windowValue === "7d" ? 24 * 7 : 24;
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export async function GET(req: NextRequest) {
  await requireAdminMemberId();

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 100, 1, 250);
  const windowValue = readWindow(url.searchParams.get("window"));
  const status = readStatus(url.searchParams.get("status"));
  const sinceIso = sinceIsoForWindow(windowValue);

  const result = await sql<DbCommentRow>`
    select
      c.id::text as id,
      c.track_id,
      c.group_key,
      c.line_key,
      c.parent_id::text as parent_id,
      c.root_id::text as root_id,
      c.depth,
      c.body_plain,
      c.line_text_snapshot,
      c.created_by_member_id::text as created_by_member_id,
      c.status::text as status,
      c.created_at::text as created_at,
      c.edited_at::text as edited_at,
      c.vote_count,
      (
        select count(*)::int
        from exegesis_report report
        where report.comment_id = c.id
      ) as report_count,
      (meta.pinned_comment_id = c.id) as pinned,
      meta.locked as thread_locked
    from exegesis_comment c
    left join exegesis_thread_meta meta
      on meta.track_id = c.track_id
     and meta.group_key = c.group_key
    where
      (
        ${sinceIso}::timestamptz is null
        or c.created_at >= ${sinceIso}::timestamptz
      )
      and (
        ${status}::text = 'all'
        or c.status::text = ${status}::text
      )
    order by c.created_at desc
    limit ${limit}
  `;

  const memberIds = result.rows.map(
    (row) => row.created_by_member_id,
  );

  const identities = await buildExegesisIdentityDtoMap(memberIds);

  const comments: CommentRow[] = result.rows.map((row) => {
    const author = resolveAuthorDisplayIdentity(
      identities[row.created_by_member_id],
    );

    return {
      id: row.id,
      recordingId: row.track_id,
      groupKey: row.group_key,
      lineKey: row.line_key,
      parentId: row.parent_id,
      rootId: row.root_id,
      depth: Number(row.depth ?? 0),
      bodyPlain: row.body_plain,
      lineTextSnapshot: row.line_text_snapshot,
      createdByMemberId: row.created_by_member_id,
      authorDisplayName: author.displayName,
      authorIsAdmin: author.isAdmin,
      status: row.status,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      voteCount: Number(row.vote_count ?? 0),
      reportCount: Number(row.report_count ?? 0),
      pinned: Boolean(row.pinned),
      threadLocked: Boolean(row.thread_locked),
    };
  });

  return json(200, { ok: true, comments });
}
