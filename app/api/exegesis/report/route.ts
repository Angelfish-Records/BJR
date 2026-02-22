// web/app/api/exegesis/report/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";

export const runtime = "nodejs";

type ApiOk = { ok: true; reportId: string };
type ApiErr = { ok: false; error: string; code?: "ALREADY_REPORTED" };

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

async function requireCanReport(memberId: string): Promise<boolean> {
  // Friend+ can report (Friend, Patron, Partner)
  return await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_FRIEND,
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
}

const CATEGORIES = new Set([
  "spam",
  "harassment",
  "hate",
  "sexual",
  "self_harm",
  "violence",
  "misinfo",
  "copyright",
  "other",
]);

function validateCategory(raw: string): string | null {
  const c = raw.trim().toLowerCase();
  return CATEGORIES.has(c) ? c : null;
}

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
  const categoryRaw = norm(b.category);
  const reason = norm(b.reason);

  if (!commentId) return json(400, { ok: false, error: "Missing commentId." });
  if (!isUuid(commentId))
    return json(400, { ok: false, error: "Invalid commentId." });

  const category = validateCategory(categoryRaw);
  if (!category) return json(400, { ok: false, error: "Invalid category." });

  // enforce your DB constraint + friendlier message
  if (reason.length < 20)
    return json(400, {
      ok: false,
      error: "Reason must be at least 20 characters.",
    });
  if (reason.length > 300)
    return json(400, {
      ok: false,
      error: "Reason must be 300 characters or less.",
    });

  const memberId = await requireMemberId();
  if (!memberId) return json(401, { ok: false, error: "Sign in required." });
  if (!isUuid(memberId))
    return json(403, { ok: false, error: "Provisioning required." });

  const canReport = await requireCanReport(memberId);
  if (!canReport) {
    return json(403, { ok: false, error: "Friend tier or higher required." });
  }

  try {
    // Atomic: validate comment existence + status, then insert if not already reported.
    const ins = await sql<{ id: string; comment_status: string | null }>`
      with c as (
        select id, status::text as status
        from exegesis_comment
        where id = ${commentId}::uuid
        limit 1
      ),
      inserted as (
        insert into exegesis_report (comment_id, reporter_member_id, category, reason)
        select
          c.id,
          ${memberId}::uuid,
          ${category},
          ${reason}
        from c
        where c.id is not null
          and c.status <> 'deleted'
          and not exists (
            select 1
            from exegesis_report r
            where r.comment_id = c.id
              and r.reporter_member_id = ${memberId}::uuid
          )
        returning id
      )
      select
        (select id from inserted limit 1) as id,
        (select status from c limit 1) as comment_status
    `;

    const reportId = ins.rows?.[0]?.id ?? "";
    const commentStatus = (ins.rows?.[0]?.comment_status ?? null) as
      | "live"
      | "hidden"
      | "deleted"
      | null;

    if (!commentStatus) {
      return json(404, { ok: false, error: "Comment not found." });
    }
    if (commentStatus === "deleted") {
      return json(400, {
        ok: false,
        error: "Cannot report a deleted comment.",
      });
    }

    if (!reportId) {
      // either already reported, or something prevented insert (we ruled out missing/deleted above)
      return json(409, {
        ok: false,
        code: "ALREADY_REPORTED",
        error: "You’ve already reported this comment.",
      });
    }

    return json(200, { ok: true, reportId });
  } catch (e: unknown) {
    return json(500, {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error.",
    });
  }
}
