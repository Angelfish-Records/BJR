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
import {
  runAutoBadgeAwardsForMember,
  type NewlyAwardedBadge,
} from "@/lib/badgeAutoAward";
import { markOverlayAnnouncedForAwardedBadges } from "@/lib/badgeAwardAnnouncementServer";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  commentId: string;
  viewerHasVoted: boolean;
  voteCount: number;
  newlyAwardedBadges: NewlyAwardedBadge[];
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

type VoteRow = {
  ok: boolean;
  viewer_has_voted: boolean;
  vote_count: number;
  err: string | null;
  author_member_id: string | null;
};

type VoteCommandResult =
  | { ok: true; commentId: string }
  | { ok: false; response: NextResponse };

type VotingAuthorityResult =
  | { ok: true; memberId: string }
  | { ok: false; response: NextResponse };

async function readVoteCommand(
  req: NextRequest,
  correlationId: string,
): Promise<VoteCommandResult> {
  let raw: unknown;

  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Invalid JSON body.",
      }),
    };
  }

  const body =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  if (!body) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Invalid JSON body.",
      }),
    };
  }

  const commentId = norm(body.commentId);
  if (!commentId) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Missing commentId.",
      }),
    };
  }

  if (!isUuid(commentId)) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Invalid commentId.",
      }),
    };
  }

  return { ok: true, commentId };
}

async function resolveVotingAuthority(
  req: NextRequest,
  correlationId: string,
): Promise<VotingAuthorityResult> {
  const memberId = await requireMemberId();

  if (!memberId) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 401,
        domain: "exegesis",
        code: "AUTH_REQUIRED",
        action: "login",
        message: "Sign in to vote.",
      }),
    };
  }

  if (!isUuid(memberId)) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "PROVISIONING",
        action: "wait",
        message: "Provisioning required.",
      }),
    };
  }

  const canVote = await requireCanVote(memberId);
  if (!canVote) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "TIER_REQUIRED",
        action: "subscribe",
        message: "Voting requires Friend tier or higher.",
      }),
    };
  }

  return { ok: true, memberId };
}

async function toggleVote(
  memberId: string,
  commentId: string,
): Promise<VoteRow | null> {
  const result = await sql<VoteRow>`
    with
    c as (
      select
        id,
        status::text as status,
        track_id,
        group_key,
        vote_count,
        created_by_member_id
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
      (select err from guard) as err,
      (select created_by_member_id::text from c) as author_member_id
  `;

  return result.rows?.[0] ?? null;
}

function voteGuardFailureResponse(
  req: NextRequest,
  correlationId: string,
  error: string | null,
): NextResponse {
  switch (error) {
    case "NOT_FOUND":
      return jsonErr(correlationId, 404, {
        ok: false,
        error: "Comment not found.",
      });
    case "DELETED":
      return gateError(req, {
        correlationId,
        status: 400,
        domain: "exegesis",
        code: "INVALID_REQUEST",
        action: "wait",
        message: "Cannot vote on deleted comment.",
      });
    case "HIDDEN":
      return gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "INVALID_REQUEST",
        action: "wait",
        message: "Cannot vote on hidden comment.",
      });
    case "LOCKED":
      return gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "INVALID_REQUEST",
        action: "wait",
        message: "Thread is locked.",
      });
    default:
      return jsonErr(correlationId, 400, {
        ok: false,
        error: "Cannot vote on this comment.",
      });
  }
}

async function runVoteBadgeEffects(
  authorMemberId: string | null,
  correlationId: string,
): Promise<NewlyAwardedBadge[]> {
  if (!authorMemberId || !isUuid(authorMemberId)) return [];

  const newlyAwardedBadges = await runAutoBadgeAwardsForMember({
    memberId: authorMemberId,
    trigger: "exegesis_vote_updated",
    grantedBy: "system",
    correlationId,
  });

  await markOverlayAnnouncedForAwardedBadges({
    memberId: authorMemberId,
    badges: newlyAwardedBadges,
  });

  return newlyAwardedBadges;
}

function describeVoteError(error: unknown): string {
  if (error instanceof Error) return norm(error.message);
  if (typeof error === "string") return norm(error);
  return "";
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const command = await readVoteCommand(req, correlationId);
  if (!command.ok) return command.response;

  const authority = await resolveVotingAuthority(req, correlationId);
  if (!authority.ok) return authority.response;

  try {
    const row = await toggleVote(authority.memberId, command.commentId);

    if (!row) {
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "Vote failed.",
      });
    }

    if (!row.ok) {
      return voteGuardFailureResponse(req, correlationId, row.err);
    }

    const newlyAwardedBadges = await runVoteBadgeEffects(
      row.author_member_id,
      correlationId,
    );

    return jsonOk<ApiOk>(
      {
        ok: true,
        commentId: command.commentId,
        viewerHasVoted: row.viewer_has_voted,
        voteCount: Number(row.vote_count ?? 0),
        newlyAwardedBadges,
      },
      { correlationId },
    );
  } catch (error: unknown) {
    const message = describeVoteError(error);

    return jsonErr(correlationId, 500, {
      ok: false,
      error: message || "Unknown error.",
    });
  }
}
