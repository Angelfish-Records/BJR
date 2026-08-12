// web/app/api/identity/claim-name/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import {
  correlationIdFromRequest,
  gateError,
  jsonOk,
  withCorrelationId,
} from "@/app/api/_gate";
import type { IdentityDTO } from "@/lib/exegesisIdentityDto";
import {
  buildExegesisIdentityDto,
  buildMemberIdentityState,
} from "@/lib/memberIdentityServer";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  identity: IdentityDTO;
};

type ApiErr = {
  ok: false;
  error: string;
  code?: "TAKEN" | "NOT_UNLOCKED" | "ALREADY_CLAIMED";
};

function jsonErr(correlationId: string, status: number, body: ApiErr) {
  return withCorrelationId(NextResponse.json(body, { status }), correlationId);
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function validatePublicName(
  raw: string,
): { ok: true; value: string; lowered: string } | { ok: false; error: string } {
  const s = raw.replace(/\s+/g, " ").trim();

  if (s.length < 3) {
    return { ok: false, error: "Name must be at least 3 characters." };
  }
  if (s.length > 32) {
    return { ok: false, error: "Name must be 32 characters or less." };
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9 _.'-]*[A-Za-z0-9]$/.test(s)) {
    return { ok: false, error: "Name contains invalid characters." };
  }

  if (/[_.\-']{3,}/.test(s)) {
    return { ok: false, error: "Name contains too much punctuation." };
  }

  const lowered = s.toLowerCase();

  const reserved = new Set(
    [
      "admin",
      "administrator",
      "support",
      "moderator",
      "mod",
      "system",
      "anonymous",
      "null",
      "undefined",
      "bjr",
      "brendan john roch",
      "angelfish records",
      "angelfish records official",
      "brendan john roch official",
      "bjr official",
    ].map((x) => x.toLowerCase()),
  );

  if (reserved.has(lowered)) {
    return { ok: false, error: "That name is reserved." };
  }

  return { ok: true, value: s, lowered };
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

  return r.rows[0]?.id ?? null;
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

  const body =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  if (!body) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid JSON body.",
    });
  }

  const desiredRaw = norm(body.publicName);
  const v = validatePublicName(desiredRaw);

  if (!v.ok) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: v.error,
    });
  }

  const memberId = await requireMemberId();

  if (!memberId) {
    return gateError(req, {
      correlationId,
      status: 401,
      domain: "site",
      code: "AUTH_REQUIRED",
      action: "login",
      message: "Sign in required.",
    });
  }

  const state = await buildMemberIdentityState(memberId);

  if (!state.capability.canClaimName) {
    return jsonErr(correlationId, 403, {
      ok: false,
      code: "NOT_UNLOCKED",
      error: "Public name is not unlocked yet.",
    });
  }

  try {
    const claimResult = await sql<{ member_id: string }>`
      update member_identity
      set
        public_name = ${v.value}::citext,
        public_name_claimed_at = now(),
        updated_at = now()
      where member_id = ${memberId}::uuid
        and public_name is null
        and public_name_claimed_at is null
      returning member_id
    `;

    if (claimResult.rows.length === 0) {
      return jsonErr(correlationId, 409, {
        ok: false,
        code: "ALREADY_CLAIMED",
        error: "Public name has already been claimed.",
      });
    }
  } catch (error: unknown) {
    const err = error as { code?: string } | null;

    if (err?.code === "23505") {
      return jsonErr(correlationId, 409, {
        ok: false,
        code: "TAKEN",
        error: "That name is already taken.",
      });
    }

    return jsonErr(correlationId, 500, {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error.",
    });
  }

  const identity = await buildExegesisIdentityDto(memberId);

  return jsonOk<ApiOk>(
    {
      ok: true,
      identity,
    },
    { correlationId },
  );
}
