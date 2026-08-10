// web/app/api/exegesis/report/route.ts
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

type ApiOk = { ok: true; reportId: string };
type ApiErr = {
  ok: false;
  error: string;
  code?: "ALREADY_REPORTED";
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

async function requireCanReport(memberId: string): Promise<boolean> {
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


type ReportCommand = {
  commentId: string;
  category: string;
  reason: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

type ReportingAuthorityResult =
  | { ok: true; memberId: string }
  | { ok: false; response: NextResponse };

type ReportInsertRow = {
  id: string | null;
  comment_status: "live" | "hidden" | "deleted" | null;
};

type ReportInsertResolution =
  | { ok: true; reportId: string }
  | { ok: false; response: NextResponse };

function validationError(
  status: number,
  error: string,
): ValidationResult<never> {
  return { ok: false, status, error };
}

async function readReportCommand(
  req: NextRequest,
): Promise<ValidationResult<ReportCommand>> {
  let raw: unknown;

  try {
    raw = await req.json();
  } catch {
    return validationError(400, "Invalid JSON body.");
  }

  const body =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  if (!body) return validationError(400, "Invalid JSON body.");

  const commentId = norm(body.commentId);
  if (!commentId) return validationError(400, "Missing commentId.");
  if (!isUuid(commentId)) return validationError(400, "Invalid commentId.");

  const category = validateCategory(norm(body.category));
  if (!category) return validationError(400, "Invalid category.");

  const reason = norm(body.reason);
  if (reason.length < 20) {
    return validationError(400, "Reason must be at least 20 characters.");
  }
  if (reason.length > 300) {
    return validationError(400, "Reason must be 300 characters or less.");
  }

  return {
    ok: true,
    value: { commentId, category, reason },
  };
}

async function resolveReportingAuthority(
  req: NextRequest,
  correlationId: string,
): Promise<ReportingAuthorityResult> {
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
        message: "Sign in to report a comment.",
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

  const canReport = await requireCanReport(memberId);
  if (!canReport) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "TIER_REQUIRED",
        action: "subscribe",
        message: "Reporting requires Friend tier or higher.",
      }),
    };
  }

  return { ok: true, memberId };
}

async function insertReport(
  command: ReportCommand,
  memberId: string,
): Promise<ReportInsertRow | null> {
  const { commentId, category, reason } = command;

  const result = await sql<ReportInsertRow>`
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

  return result.rows?.[0] ?? null;
}

function resolveReportInsert(
  row: ReportInsertRow | null,
  correlationId: string,
): ReportInsertResolution {
  const reportId = row?.id ?? "";
  const commentStatus = row?.comment_status ?? null;

  if (!commentStatus) {
    return {
      ok: false,
      response: jsonErr(correlationId, 404, {
        ok: false,
        error: "Comment not found.",
      }),
    };
  }

  if (commentStatus === "deleted") {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Cannot report a deleted comment.",
      }),
    };
  }

  if (!reportId) {
    return {
      ok: false,
      response: jsonErr(correlationId, 409, {
        ok: false,
        code: "ALREADY_REPORTED",
        error: "You’ve already reported this comment.",
      }),
    };
  }

  return { ok: true, reportId };
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const command = await readReportCommand(req);

  if (!command.ok) {
    return jsonErr(correlationId, command.status, {
      ok: false,
      error: command.error,
    });
  }

  const authority = await resolveReportingAuthority(req, correlationId);
  if (!authority.ok) return authority.response;

  try {
    const row = await insertReport(command.value, authority.memberId);
    const insert = resolveReportInsert(row, correlationId);
    if (!insert.ok) return insert.response;

    return jsonOk<ApiOk>(
      { ok: true, reportId: insert.reportId },
      { correlationId },
    );
  } catch (error: unknown) {
    return jsonErr(correlationId, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    });
  }
}
