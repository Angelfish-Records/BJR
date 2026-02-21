// web/app/api/exegesis/vote/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  commentId: string;
  viewerHasVoted: boolean;
  voteCount: number;
};

type ApiErr = { ok: false; error: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
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
  // Friend+ can vote (Friend, Patron, Partner)
  return await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_FRIEND,
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
}

type DbCommentRow = {
  id: string;
  status: "live" | "hidden" | "deleted";
  vote_count: number;
};

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const b =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;
  if (!b) return json(400, { ok: false, error: "Invalid JSON body." });

  const commentId = norm(b.commentId);
  if (!commentId) return json(400, { ok: false, error: "Missing commentId." });
  if (!isUuid(commentId))
    return json(400, { ok: false, error: "Invalid commentId." });

  const memberId = await requireMemberId();
  if (!memberId) return json(401, { ok: false, error: "Sign in required." });
  if (!isUuid(memberId))
    return json(403, { ok: false, error: "Provisioning required." });

  const canVote = await requireCanVote(memberId);
  if (!canVote) {
    return json(403, { ok: false, error: "Friend tier or higher required." });
  }

  try {
    await sql`begin`;

    // Lock comment row so vote_count stays consistent.
    const cRes = await sql<DbCommentRow>`
      select id, status::text as status, vote_count
      from exegesis_comment
      where id = ${commentId}::uuid
      for update
    `;
    const c = cRes.rows?.[0] ?? null;
    if (!c) {
      await sql`rollback`;
      return json(404, { ok: false, error: "Comment not found." });
    }
    if (c.status === "deleted") {
      await sql`rollback`;
      return json(400, { ok: false, error: "Cannot vote on deleted comment." });
    }

    // Check existing vote (member,comment is unique)
    const existing = await sql<{ exists: boolean }>`
      select exists(
        select 1
        from exegesis_vote
        where member_id = ${memberId}::uuid
          and comment_id = ${commentId}::uuid
      ) as exists
    `;
    const has = Boolean(existing.rows?.[0]?.exists);

    let viewerHasVoted: boolean;
    let voteCount: number;

    if (has) {
      await sql`
        delete from exegesis_vote
        where member_id = ${memberId}::uuid
          and comment_id = ${commentId}::uuid
      `;

      const upd = await sql<{ vote_count: number }>`
        update exegesis_comment
        set vote_count = greatest(vote_count - 1, 0)
        where id = ${commentId}::uuid
        returning vote_count
      `;

      viewerHasVoted = false;
      voteCount = Number(
        upd.rows?.[0]?.vote_count ?? Math.max((c.vote_count ?? 0) - 1, 0),
      );
    } else {
      await sql`
        insert into exegesis_vote (member_id, comment_id)
        values (${memberId}::uuid, ${commentId}::uuid)
        on conflict (member_id, comment_id) do nothing
      `;

      const upd = await sql<{ vote_count: number }>`
        update exegesis_comment
        set vote_count = vote_count + 1
        where id = ${commentId}::uuid
        returning vote_count
      `;

      viewerHasVoted = true;
      voteCount = Number(upd.rows?.[0]?.vote_count ?? (c.vote_count ?? 0) + 1);
    }

    await sql`commit`;
    return json(200, { ok: true, commentId, viewerHasVoted, voteCount });
  } catch (e: unknown) {
    try {
      await sql`rollback`;
    } catch {
      // ignore
    }
    const msg =
      e instanceof Error
        ? norm(e.message)
        : norm(typeof e === "string" ? e : "");
    return json(500, { ok: false, error: msg || "Unknown error." });
  }
}
