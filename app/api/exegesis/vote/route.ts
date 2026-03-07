// web/app/api/exegesis/vote/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import type { GatePayload } from "@/app/home/gating/gateTypes";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";
import {
  correlationIdFromRequest,
  gateError,
  jsonOk,
  withCorrelationId,
} from "@/app/api/_gate";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  commentId: string;
  viewerHasVoted: boolean;
  voteCount: number;
};

type ApiErr = { ok: false; error: string; gate?: GatePayload };

function jsonErr(correlationId: string, status: number, body: ApiErr) {
  return withCorrelationId(NextResponse.json(body, { status }), correlationId);
}

function norm(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
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

async function requireCanVote(memberId: string): Promise<boolean> {
  return await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_FRIEND,
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
  if (!commentId) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Missing commentId.",
    });
  }
  if (!isUuid(commentId)) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid commentId.",
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
      message: "Sign in to vote.",
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

  const canVote = await requireCanVote(memberId);
  if (!canVote) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: "exegesis",
      code: "TIER_REQUIRED",
      action: "subscribe",
      message: "Voting requires Friend tier or higher.",
    });
  }

  try {
    const r = await sql<{
      ok: boolean;
      viewer_has_voted: boolean;
      vote_count: number;
      err: string | null;
    }>`
      with
      c as (
        select id, status::text as status, track_id, group_key, vote_count
        from exegesis_comment
        where id = ${commentId}::uuid
        limit 1
      ),
      m as (
        select locked
        from exegesis_thread_meta
        where track_id = (select track_id from c)
          and group_key = (select group_key from c)
        limit 1
      ),
      guard as (
        select
          case
            when (select id from c) is null then 'NOT_FOUND'
            when (select status from c) = 'deleted' then 'DELETED'
            when (select status from c) = 'hidden' then 'HIDDEN'
            when coalesce((select locked from m), false) = true then 'LOCKED'
            else null
          end as err
      ),
      del as (
        delete from exegesis_vote
        where member_id = ${memberId}::uuid
          and comment_id = ${commentId}::uuid
          and (select err from guard) is null
        returning 1 as deleted
      ),
      ins as (
        insert into exegesis_vote (member_id, comment_id)
        select ${memberId}::uuid, ${commentId}::uuid
        where (select err from guard) is null
          and not exists (select 1 from del)
        on conflict (member_id, comment_id) do nothing
        returning 1 as inserted
      ),
      upd as (
        update exegesis_comment
        set vote_count = greatest(
          vote_count + (case when exists (select 1 from ins) then 1 else 0 end)
                     - (case when exists (select 1 from del) then 1 else 0 end),
          0
        )
        where id = ${commentId}::uuid
          and (select err from guard) is null
        returning vote_count
      )
      select
        (select err from guard) is null as ok,
        case
          when (select err from guard) is not null then false
          when exists (select 1 from ins) then true
          else false
        end as viewer_has_voted,
        coalesce((select vote_count from upd), (select vote_count from c), 0)::int as vote_count,
        (select err from guard) as err
    `;

    const row = r.rows?.[0] ?? null;
    if (!row) {
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "Vote failed.",
      });
    }

    if (!row.ok) {
      if (row.err === "NOT_FOUND") {
        return jsonErr(correlationId, 404, {
          ok: false,
          error: "Comment not found.",
        });
      }
      if (row.err === "DELETED") {
        return gateError(req, {
          correlationId,
          status: 400,
          domain: "exegesis",
          code: "INVALID_REQUEST",
          action: "wait",
          message: "Cannot vote on deleted comment.",
        });
      }
      if (row.err === "HIDDEN") {
        return gateError(req, {
          correlationId,
          status: 403,
          domain: "exegesis",
          code: "INVALID_REQUEST",
          action: "wait",
          message: "Cannot vote on hidden comment.",
        });
      }
      if (row.err === "LOCKED") {
        return gateError(req, {
          correlationId,
          status: 403,
          domain: "exegesis",
          code: "INVALID_REQUEST",
          action: "wait",
          message: "Thread is locked.",
        });
      }

      return jsonErr(correlationId, 400, {
        ok: false,
        error: "Cannot vote on this comment.",
      });
    }

    return jsonOk<ApiOk>(
      {
        ok: true,
        commentId,
        viewerHasVoted: row.viewer_has_voted,
        voteCount: Number(row.vote_count ?? 0),
      },
      { correlationId },
    );
  } catch (e: unknown) {
    const msg =
      e instanceof Error
        ? norm(e.message)
        : norm(typeof e === "string" ? e : "");
    return jsonErr(correlationId, 500, {
      ok: false,
      error: msg || "Unknown error.",
    });
  }
}