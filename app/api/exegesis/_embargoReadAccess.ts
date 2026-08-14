import "server-only";

import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { NextRequest, NextResponse } from "next/server";

import { gateError } from "@/app/api/_gate";
import type { GateAction, GateCodeRaw } from "@/app/home/gating/gateTypes";
import { decideAlbumPlaybackAccess } from "@/lib/accessOracle";
import { getAlbumPolicyByAlbumId, isEmbargoed } from "@/lib/albumPolicy";
import { ensureAnonId, persistAnonId } from "@/lib/anon";
import { validateShareToken } from "@/lib/shareTokens";
import { ACCESS_ACTIONS, SCOPE_CATALOGUE } from "@/lib/vocab";
import { client } from "@/sanity/lib/client";

type EmbargoReadContext = Readonly<{
  memberId: string | null;
  anonId: string;
  isNewAnonId: boolean;
}>;

export type ExegesisEmbargoReadAccess =
  | {
      ok: true;
      embargoed: false;
      context: null;
    }
  | {
      ok: true;
      embargoed: true;
      context: EmbargoReadContext;
    }
  | {
      ok: false;
      response: NextResponse;
    };

type AlbumIdentity = Readonly<{
  albumId: string;
  albumScopeId: string;
}>;

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveAlbumIdentity(
  recordingId: string,
): Promise<AlbumIdentity | null> {
  const query = `
    *[_type == "album" && $recordingId in tracks[].recordingId][0]{
      _id,
      catalogueId
    }
  `;

  const doc = await client.fetch<{
    _id?: string | null;
    catalogueId?: string | null;
  } | null>(query, { recordingId });

  const albumId = norm(doc?.catalogueId) || norm(doc?._id);
  if (!albumId) return null;

  return {
    albumId,
    albumScopeId:
      albumId === SCOPE_CATALOGUE ? SCOPE_CATALOGUE : `alb:${albumId}`,
  };
}

async function getMemberIdByClerkUserId(
  userId: string,
): Promise<string | null> {
  const result = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;

  return result.rows[0]?.id ?? null;
}

function persistAnonOnResponse(
  response: NextResponse,
  context: EmbargoReadContext,
): void {
  if (context.isNewAnonId) {
    persistAnonId(response, context.anonId);
  }
}

function blockedResponse(params: {
  req: NextRequest;
  correlationId: string;
  context: EmbargoReadContext;
  code: GateCodeRaw;
  action: GateAction;
  message: string;
}): NextResponse {
  return gateError(params.req, {
    correlationId: params.correlationId,
    status: 403,
    domain: "exegesis",
    code: params.code,
    action: params.action,
    message: params.message,
    onResponse: (response) => persistAnonOnResponse(response, params.context),
  });
}

export function persistExegesisEmbargoReadIdentity(
  response: NextResponse,
  access: ExegesisEmbargoReadAccess,
): void {
  if (access.ok && access.embargoed) {
    persistAnonOnResponse(response, access.context);
  }
}

export async function resolveExegesisEmbargoReadAccess(params: {
  req: NextRequest;
  recordingId: string;
  correlationId: string;
}): Promise<ExegesisEmbargoReadAccess> {
  const recordingId = norm(params.recordingId);
  if (!recordingId) {
    return {
      ok: false,
      response: gateError(params.req, {
        correlationId: params.correlationId,
        status: 400,
        domain: "exegesis",
        code: "INVALID_REQUEST",
        action: "wait",
        message: "Missing recordingId.",
      }),
    };
  }

  const album = await resolveAlbumIdentity(recordingId);
  if (!album) {
    // Preserve the historical public behaviour for orphaned/non-album lyric docs.
    return { ok: true, embargoed: false, context: null };
  }

  const policy = await getAlbumPolicyByAlbumId(album.albumId);
  if (!isEmbargoed(policy)) {
    // The hardening requested here is embargo-specific. Released lyrics remain public.
    return { ok: true, embargoed: false, context: null };
  }

  const { anonId, isNew } = ensureAnonId(params.req);
  const { userId } = await auth();
  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null;
  const context: EmbargoReadContext = {
    memberId,
    anonId,
    isNewAnonId: isNew,
  };

  if (userId && !memberId) {
    return {
      ok: false,
      response: blockedResponse({
        req: params.req,
        correlationId: params.correlationId,
        context,
        code: "PROVISIONING",
        action: "wait",
        message:
          "Signed in, but your member profile is still being created. Refresh in a moment.",
      }),
    };
  }

  const requestUrl = new URL(params.req.url);
  const shareToken = norm(
    requestUrl.searchParams.get("st") ?? requestUrl.searchParams.get("share"),
  );
  let shareTokenAllowsPlayback = false;

  if (shareToken) {
    const validation = await validateShareToken({
      token: shareToken,
      expectedScopeId: album.albumScopeId,
      anonId,
      resourceKind: "album",
      resourceId: album.albumScopeId,
      action: "access",
    });

    if (!validation.ok) {
      const message =
        validation.code === "CAP_REACHED"
          ? "Share link cap reached."
          : "Invalid or expired share token.";

      return {
        ok: false,
        response: blockedResponse({
          req: params.req,
          correlationId: params.correlationId,
          context,
          code: "EMBARGO",
          action: "login",
          message,
        }),
      };
    }

    shareTokenAllowsPlayback = true;
  }

  const decision = await decideAlbumPlaybackAccess({
    memberId,
    albumId: album.albumId,
    correlationId: params.correlationId,
    action: ACCESS_ACTIONS.ACCESS_CHECK,
    shareTokenAllowsPlayback,
  });

  if (!decision.allowed) {
    return {
      ok: false,
      response: blockedResponse({
        req: params.req,
        correlationId: params.correlationId,
        context,
        code: decision.code,
        action: decision.action ?? "wait",
        message: decision.reason,
      }),
    };
  }

  return {
    ok: true,
    embargoed: true,
    context,
  };
}
