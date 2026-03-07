// web/app/api/exegesis/comment/edit/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import type { GatePayload } from "@/app/home/gating/gateTypes";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";
import { validateAndSanitizeTipTapDoc } from "@/lib/exegesis/richText";
import {
  correlationIdFromRequest,
  gateError,
  jsonOk,
  withCorrelationId,
} from "@/app/api/_gate";

export const runtime = "nodejs";

type CommentDTO = {
  id: string;
  recordingId: string;
  groupKey: string;
  lineKey: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyRich: unknown;
  bodyPlain: string;
  tMs: number | null;
  lineTextSnapshot: string;
  lyricsVersion: string | null;
  createdByMemberId: string;
  status: "live" | "hidden" | "deleted";
  createdAt: string;
  editedAt: string | null;
  editCount: number;
  voteCount: number;
  viewerHasVoted: boolean;
};

type ThreadMetaDTO = {
  recordingId: string;
  groupKey: string;
  pinnedCommentId: string | null;
  locked: boolean;
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

type ApiOk = { ok: true; comment: CommentDTO; meta: ThreadMetaDTO };
type ApiErr = {
  ok: false;
  error: string;
  gate?: GatePayload;
};

function jsonErr(correlationId: string, status: number, body: ApiErr) {
  return withCorrelationId(NextResponse.json(body, { status }), correlationId);
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function requireMemberId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = r.rows?.[0]?.id ?? "";
  return memberId || null;
}

async function requireCanPost(memberId: string): Promise<boolean> {
  return await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  const b =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;
  if (!b) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  const commentId = norm(b.commentId);
  if (!commentId || !isUuid(commentId)) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid commentId.",
    });
  }

  if (!("bodyRich" in b)) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Missing bodyRich.",
    });
  }
  const bodyRichInput: unknown = b.bodyRich ?? null;

  const v = validateAndSanitizeTipTapDoc(bodyRichInput);
  if (!v.ok) {
    return jsonErr(correlationId, 400, { ok: false, error: v.error });
  }

  const bodyPlain = v.plain;

  let bodyRichJson = "";
  try {
    bodyRichJson = JSON.stringify(v.doc);
  } catch {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid bodyRich.",
    });
  }

  if (bodyRichJson.length > 200_000) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "bodyRich too large.",
    });
  }

  const memberId = await requireMemberId();
  if (!memberId) {
    return gateError(req, {
      correlationId,
      status: 401,
      domain: "exegesis",
      code: "AUTH_REQUIRED",
      action: "login",
      message: "Sign in to edit a comment.",
    });
  }

  if (!isUuid(memberId)) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: "exegesis",
      code: "PROVISIONING",
      action: "wait",
      message: "Provisioning required.",
    });
  }

  const canPost = await requireCanPost(memberId);
  if (!canPost) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: "exegesis",
      code: "TIER_REQUIRED",
      action: "subscribe",
      message: "Editing requires Patron or Partner.",
    });
  }

  try {
    const q = await sql<{
      guard_err: string | null;
      id: string | null;
      track_id: string | null;
      group_key: string | null;
      line_key: string | null;
      parent_id: string | null;
      root_id: string | null;
      depth: number | null;
      body_rich: unknown | null;
      body_plain: string | null;
      t_ms: number | null;
      line_text_snapshot: string | null;
      lyrics_version: string | null;
      created_by_member_id: string | null;
      status: "live" | "hidden" | "deleted" | null;
      created_at: string | null;
      edited_at: string | null;
      edit_count: number | null;
      vote_count: number | null;
      meta_track_id: string | null;
      meta_group_key: string | null;
      meta_pinned_comment_id: string | null;
      meta_locked: boolean | null;
      meta_comment_count: number | null;
      meta_last_activity_at: string | null;
      meta_created_at: string | null;
      meta_updated_at: string | null;
    }>`
    with
one as (select 1 as one),
params as (
  select
    ${commentId}::uuid     as comment_id,
    ${memberId}::uuid      as member_id,
    ${bodyRichJson}::jsonb as body_rich,
    ${bodyPlain}::text     as body_plain
),
target as (
  select
    c.id,
    c.track_id,
    c.group_key,
    c.status,
    c.created_by_member_id
  from exegesis_comment c
  join params p on c.id = p.comment_id
  limit 1
),
meta_base as (
  insert into exegesis_thread_meta (track_id, group_key)
  select t.track_id, t.group_key
  from target t
  on conflict (track_id, group_key) do nothing
  returning track_id, group_key, pinned_comment_id, locked,
            comment_count, last_activity_at, created_at, updated_at
),
meta_existing as (
  select m.track_id, m.group_key, m.pinned_comment_id, m.locked,
         m.comment_count, m.last_activity_at, m.created_at, m.updated_at
  from exegesis_thread_meta m
  join target t on t.track_id = m.track_id and t.group_key = m.group_key
  limit 1
),
meta_pre as (
  select * from meta_base
  union all
  select * from meta_existing
  where not exists (select 1 from meta_base)
),
guard_row as (
  select
    case
      when t.id is null then 'NOT_FOUND'
      when mp.locked then 'LOCKED'
      when t.status = 'deleted' then 'DELETED'
      when t.status = 'hidden' then 'HIDDEN'
      when t.created_by_member_id <> p.member_id then 'FORBIDDEN'
      else null
    end as err
  from one
  left join target t on true
  left join meta_pre mp on true
  left join params p on true
),
upd as (
  update exegesis_comment c
  set
    body_rich = p.body_rich,
    body_plain = p.body_plain,
    edited_at = now(),
    edit_count = c.edit_count + 1
  from params p
  cross join guard_row g
  where c.id = p.comment_id
    and g.err is null
  returning
    c.id, c.track_id, c.group_key, c.line_key, c.parent_id, c.root_id, c.depth,
    c.body_rich, c.body_plain, c.t_ms, c.line_text_snapshot, c.lyrics_version,
    c.created_by_member_id, c.status::text as status,
    c.created_at, c.edited_at, c.edit_count, c.vote_count
),
meta_upd as (
  update exegesis_thread_meta m
  set
    last_activity_at = now(),
    updated_at = now()
  where m.track_id = (select track_id from target)
    and m.group_key = (select group_key from target)
    and exists (select 1 from upd)
  returning m.track_id, m.group_key, m.pinned_comment_id, m.locked,
            m.comment_count, m.last_activity_at, m.created_at, m.updated_at
),
meta_out as (
  select * from meta_upd
  union all
  select * from meta_pre
  where not exists (select 1 from meta_upd)
)
select
  g.err as guard_err,
  u.id,
  u.track_id,
  u.group_key,
  u.line_key,
  u.parent_id,
  u.root_id,
  u.depth,
  u.body_rich,
  u.body_plain,
  u.t_ms,
  u.line_text_snapshot,
  u.lyrics_version,
  u.created_by_member_id,
  u.status,
  u.created_at,
  u.edited_at,
  u.edit_count,
  u.vote_count,
  m.track_id as meta_track_id,
  m.group_key as meta_group_key,
  m.pinned_comment_id as meta_pinned_comment_id,
  m.locked as meta_locked,
  m.comment_count as meta_comment_count,
  m.last_activity_at as meta_last_activity_at,
  m.created_at as meta_created_at,
  m.updated_at as meta_updated_at
from one
left join guard_row g on true
left join upd u on true
left join meta_out m on true
limit 1
    `;

    const row = q.rows?.[0] ?? null;
    if (!row) {
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "No response row.",
      });
    }

    if (row.guard_err) {
      if (row.guard_err === "NOT_FOUND") {
        return jsonErr(correlationId, 404, {
          ok: false,
          error: "Comment not found.",
        });
      }
      if (row.guard_err === "LOCKED") {
        return gateError(req, {
          correlationId,
          status: 403,
          domain: "exegesis",
          code: "INVALID_REQUEST",
          action: "wait",
          message: "Thread is locked.",
        });
      }
      if (row.guard_err === "FORBIDDEN") {
        return gateError(req, {
          correlationId,
          status: 403,
          domain: "exegesis",
          code: "INVALID_REQUEST",
          action: "wait",
          message: "You can only edit your own comments.",
        });
      }
      if (row.guard_err === "DELETED") {
        return jsonErr(correlationId, 400, {
          ok: false,
          error: "Cannot edit a deleted comment.",
        });
      }
      if (row.guard_err === "HIDDEN") {
        return gateError(req, {
          correlationId,
          status: 403,
          domain: "exegesis",
          code: "INVALID_REQUEST",
          action: "wait",
          message: "Cannot edit a hidden comment.",
        });
      }
      return jsonErr(correlationId, 400, {
        ok: false,
        error: "Cannot edit comment.",
      });
    }

    if (!row.id || !row.track_id || !row.group_key) {
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "Edit failed.",
      });
    }

    const comment: CommentDTO = {
      id: row.id,
      recordingId: row.track_id,
      groupKey: row.group_key,
      lineKey: row.line_key ?? "",
      parentId: row.parent_id ?? null,
      rootId: row.root_id ?? row.id,
      depth: Number(row.depth ?? 0),
      bodyRich: row.body_rich ?? {},
      bodyPlain: row.body_plain ?? "",
      tMs: row.t_ms ?? null,
      lineTextSnapshot: row.line_text_snapshot ?? "",
      lyricsVersion: row.lyrics_version ?? null,
      createdByMemberId: row.created_by_member_id ?? "",
      status: (row.status ?? "live") as "live" | "hidden" | "deleted",
      createdAt: row.created_at ?? "",
      editedAt: row.edited_at ?? null,
      editCount: Number(row.edit_count ?? 0),
      voteCount: Number(row.vote_count ?? 0),
      viewerHasVoted: false,
    };

    const meta: ThreadMetaDTO = {
      recordingId: String(row.meta_track_id ?? row.track_id),
      groupKey: String(row.meta_group_key ?? row.group_key),
      pinnedCommentId: row.meta_pinned_comment_id ?? null,
      locked: Boolean(row.meta_locked),
      commentCount: Number(row.meta_comment_count ?? 0),
      lastActivityAt: String(row.meta_last_activity_at ?? ""),
      createdAt: String(row.meta_created_at ?? ""),
      updatedAt: String(row.meta_updated_at ?? ""),
    };

    return jsonOk<ApiOk>({ ok: true, comment, meta }, { correlationId });
  } catch (e: unknown) {
    console.error("[exegesis/comment/edit] POST failed", e);
    return jsonErr(correlationId, 500, {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error.",
    });
  }
}