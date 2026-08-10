// web/app/api/mux/_playbackIssuance.ts
import "server-only";

import crypto from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { importPKCS8, SignJWT } from "jose";
import type { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

import { gateError } from "@/app/api/_gate";
import type {
  GateAction,
  GateCodeRaw,
  GateDomain,
} from "@/app/home/gating/gateTypes";
import { decideAlbumPlaybackAccess } from "@/lib/accessOracle";
import { ensureAnonId, persistAnonId } from "@/lib/anon";
import { validateShareToken } from "@/lib/shareTokens";
import { ACCESS_ACTIONS } from "@/lib/vocab";

const AUD = "v";
const PLAYBACK_DOMAIN: GateDomain = "playback";
const MAX_TOKEN_TTL_SECONDS = 60 * 60 * 2;

export type MuxPlaybackGateErrorInput = {
  correlationId: string;
  status: number;
  code: GateCodeRaw;
  action: GateAction;
  message: string;
  anonId?: string;
  isNewAnonId?: boolean;
};

export type MuxPlaybackAccessContext = {
  userId: string | null;
  memberId: string | null;
  anonId: string;
  isNewAnonId: boolean;
  tokenAllowsPlayback: boolean;
};

export type MuxPlaybackAccessResult =
  | { ok: true; context: MuxPlaybackAccessContext }
  | { ok: false; response: NextResponse };

export type MuxPlaybackSigner = {
  expiresAt: number;
  sign: (playbackId: string) => Promise<string>;
};

type MuxSigningKey = Awaited<ReturnType<typeof importPKCS8>>;

function mustEnv(...names: string[]): string {
  for (const name of names) {
    const value = process.env[name];

    if (value?.trim()) {
      return value.trim();
    }
  }

  throw new Error(`Missing env var: one of [${names.join(", ")}]`);
}

function normalizePemMaybe(input: string): string {
  const raw = input.trim();
  const looksLikePem = raw.includes("-----BEGIN ") && raw.includes("-----END ");

  if (looksLikePem) {
    return raw.replaceAll("\\n", "\n");
  }

  return Buffer.from(raw, "base64")
    .toString("utf8")
    .trim()
    .replaceAll("\\n", "\n");
}

function toPkcs8Pem(pem: string): string {
  if (pem.includes("-----BEGIN PRIVATE KEY-----")) {
    return pem;
  }

  const keyObject = crypto.createPrivateKey(pem);
  return keyObject.export({ format: "pem", type: "pkcs8" }) as string;
}

function toTokenGateCode(code: string | null | undefined): GateCodeRaw {
  if (code === "INVALID_REQUEST") return "INVALID_REQUEST";
  if (code === "EMBARGO") return "EMBARGO";
  if (code === "TIER_REQUIRED") return "TIER_REQUIRED";
  if (code === "PROVISIONING") return "PROVISIONING";
  if (code === "CAP_REACHED") return "CAP_REACHED";
  if (code === "ANON_CAP_REACHED") return "PLAYBACK_CAP_REACHED";

  return "ENTITLEMENT_REQUIRED";
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

function shareTokenFailure(code: string): {
  code: GateCodeRaw;
  message: string;
} {
  if (code === "CAP_REACHED") {
    return {
      code: "CAP_REACHED",
      message: "Share link cap reached.",
    };
  }

  return {
    code: "ENTITLEMENT_REQUIRED",
    message: "Invalid or expired share token.",
  };
}

async function signPlaybackToken(params: {
  playbackId: string;
  expiresAt: number;
  keyId: string;
  signingKey: MuxSigningKey;
  playbackRestrictionId?: string;
}): Promise<string> {
  return new SignJWT({
    sub: params.playbackId,
    aud: AUD,
    exp: params.expiresAt,
    ...(params.playbackRestrictionId
      ? { playback_restriction_id: params.playbackRestrictionId }
      : {}),
  })
    .setProtectedHeader({ alg: "RS256", kid: params.keyId, typ: "JWT" })
    .sign(params.signingKey);
}


export function normalizeMuxAlbumId(
  raw: string | null | undefined,
): string {
  let albumId = (raw ?? "").trim();

  while (albumId.startsWith("alb:")) {
    albumId = albumId.slice(4);
  }

  return albumId.trim();
}

export function readMuxShareToken(
  req: NextRequest,
  bodyToken: string | null | undefined,
): string {
  const url = new URL(req.url);

  return (
    (bodyToken ?? "").trim() ||
    (url.searchParams.get("st") ?? "").trim() ||
    (url.searchParams.get("share") ?? "").trim()
  );
}

export function muxPlaybackGateError(
  req: NextRequest,
  input: MuxPlaybackGateErrorInput,
): NextResponse {
  return gateError(req, {
    correlationId: input.correlationId,
    status: input.status,
    domain: PLAYBACK_DOMAIN,
    code: input.code,
    action: input.action,
    message: input.message,
    onResponse: (response) => {
      if (input.anonId !== undefined) {
        if (input.isNewAnonId) {
          persistAnonId(response, input.anonId);
        }
        return;
      }

      ensureAnonId(req, response);
    },
  });
}

export function persistMuxAnonIdentity(
  response: NextResponse,
  context: MuxPlaybackAccessContext,
): void {
  if (context.isNewAnonId) {
    persistAnonId(response, context.anonId);
  }
}

export async function resolveMuxPlaybackAccess(
  req: NextRequest,
  params: {
    albumId: string;
    albumScopeId: string;
    shareToken: string;
    correlationId: string;
  },
): Promise<MuxPlaybackAccessResult> {
  const { userId } = await auth();
  const { anonId, isNew } = ensureAnonId(req);
  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null;

  if (userId && !memberId) {
    return {
      ok: false,
      response: muxPlaybackGateError(req, {
        correlationId: params.correlationId,
        status: 403,
        code: "PROVISIONING",
        action: "wait",
        message:
          "Signed in, but your member profile is still being created. Refresh in a moment.",
        anonId,
        isNewAnonId: isNew,
      }),
    };
  }

  let tokenAllowsPlayback = false;

  if (params.shareToken) {
    const validation = await validateShareToken({
      token: params.shareToken,
      expectedScopeId: params.albumScopeId,
      anonId,
      resourceKind: "album",
      resourceId: params.albumScopeId,
      action: "access",
    });

    if (!validation.ok) {
      const failure = shareTokenFailure(validation.code);

      return {
        ok: false,
        response: muxPlaybackGateError(req, {
          correlationId: params.correlationId,
          status: 403,
          code: failure.code,
          action: "login",
          message: failure.message,
          anonId,
          isNewAnonId: isNew,
        }),
      };
    }

    tokenAllowsPlayback = true;
  }

  const decision = await decideAlbumPlaybackAccess({
    memberId,
    albumId: params.albumId,
    correlationId: params.correlationId,
    action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
    shareTokenAllowsPlayback: tokenAllowsPlayback,
  });

  if (!decision.allowed) {
    return {
      ok: false,
      response: muxPlaybackGateError(req, {
        correlationId: params.correlationId,
        status: 403,
        code: toTokenGateCode(decision.code),
        action: decision.action ?? "wait",
        message: decision.reason,
        anonId,
        isNewAnonId: isNew,
      }),
    };
  }

  return {
    ok: true,
    context: {
      userId,
      memberId,
      anonId,
      isNewAnonId: isNew,
      tokenAllowsPlayback,
    },
  };
}

export async function createMuxPlaybackSigner(params: {
  baseTtlSeconds: number;
  minimumTtlSeconds?: number;
  sampleExpiresAtSeconds?: number | null;
}): Promise<MuxPlaybackSigner> {
  const keyId = mustEnv(
    "MUX_SIGNING_KEY_ID",
    "MUX_PLAYBACK_SIGNING_KEY_ID",
  );
  const rawKey = mustEnv(
    "MUX_SIGNING_KEY_SECRET",
    "MUX_SIGNING_PRIVATE_KEY",
    "MUX_PLAYBACK_SIGNING_PRIVATE_KEY",
  );

  const signingKey = await importPKCS8(
    toPkcs8Pem(normalizePemMaybe(rawKey)),
    "RS256",
  );

  const minimumTtlSeconds = params.minimumTtlSeconds ?? 0;
  const ttl = Math.min(
    Math.max(params.baseTtlSeconds, minimumTtlSeconds, 60),
    MAX_TOKEN_TTL_SECONDS,
  );
  const ordinaryExpiry = Math.floor(Date.now() / 1000) + ttl;

  const expiresAt =
    params.sampleExpiresAtSeconds == null
      ? ordinaryExpiry
      : Math.min(ordinaryExpiry, params.sampleExpiresAtSeconds);

  const playbackRestrictionId =
    process.env.MUX_PLAYBACK_RESTRICTION_ID?.trim() || undefined;

  return {
    expiresAt,
    sign: (playbackId) =>
      signPlaybackToken({
        playbackId,
        expiresAt,
        keyId,
        signingKey,
        playbackRestrictionId,
      }),
  };
}
