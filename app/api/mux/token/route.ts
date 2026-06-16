// web/app/api/mux/token/route.ts
import "server-only";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { importPKCS8, SignJWT } from "jose";
import crypto from "crypto";

import { countAnonDistinctCompletedTracks } from "@/lib/events";
import {
  ANON_PLAYBACK_POLICY,
  hasReachedAnonPlaybackCap,
} from "@/lib/anonPlaybackPolicy";
import { ACCESS_ACTIONS } from "@/lib/vocab";
import type {
  GateDomain,
  GateAction,
  GateCodeRaw,
} from "@/app/home/gating/gateTypes";
import { validateShareToken } from "@/lib/shareTokens";
import { decideAlbumPlaybackAccess } from "@/lib/accessOracle";
import { ensureAnonId } from "@/lib/anon";
import { verifyAlbumPlaybackAsset } from "@/lib/albums";

import { correlationIdFromRequest, gateError, jsonOk } from "@/app/api/_gate";

type TokenReq = {
  playbackId: string;
  trackId?: string;
  albumId?: string;
  durationMs?: number;
  st?: string;
};

type TokenOk = {
  ok: true;
  token: string;
  expiresAt: number;
  correlationId: string;
};

type MuxGateErrorInput = {
  correlationId: string;
  status: number;
  code: GateCodeRaw;
  action: GateAction;
  message: string;
};

const AUD = "v";
const PLAYBACK_DOMAIN: GateDomain = "playback";

function muxGateError(req: NextRequest, input: MuxGateErrorInput) {
  return gateError(req, {
    correlationId: input.correlationId,
    status: input.status,
    domain: PLAYBACK_DOMAIN,
    code: input.code,
    action: input.action,
    message: input.message,
    onResponse: (res) => ensureAnonId(req, res),
  });
}

function mustEnv(...names: string[]) {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v.trim();
  }
  throw new Error(`Missing env var: one of [${names.join(", ")}]`);
}

function normalizeAlbumId(raw: string): string {
  let s = (raw ?? "").trim();
  if (!s) return "";
  while (s.startsWith("alb:")) s = s.slice(4);
  return s.trim();
}

function normalizePemMaybe(input: string): string {
  const raw = (input ?? "").trim();
  const looksLikePem = raw.includes("-----BEGIN ") && raw.includes("-----END ");
  if (looksLikePem) return raw.replace(/\\n/g, "\n");
  return Buffer.from(raw, "base64")
    .toString("utf8")
    .trim()
    .replace(/\\n/g, "\n");
}

function toPkcs8Pem(pem: string): string {
  if (pem.includes("-----BEGIN PRIVATE KEY-----")) return pem;
  const keyObj = crypto.createPrivateKey(pem);
  return keyObj.export({ format: "pem", type: "pkcs8" }) as string;
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
  const { sql } = await import("@vercel/postgres");
  if (!userId) return null;
  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  return (r.rows?.[0]?.id as string | undefined) ?? null;
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);

  let body: TokenReq | null = null;
  try {
    body = (await req.json()) as TokenReq;
  } catch {
    body = null;
  }

  const playbackId =
    typeof body?.playbackId === "string" ? body.playbackId.trim() : "";

  if (!playbackId) {
    return muxGateError(req, {
      correlationId,
      status: 400,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing playbackId",
    });
  }

  const rawAlbumId = (body?.albumId ?? "").trim();
  if (!rawAlbumId) {
    return muxGateError(req, {
      correlationId,
      status: 400,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing albumId (canonical album context)",
    });
  }

  const albumId = normalizeAlbumId(rawAlbumId);
  if (!albumId) {
    return muxGateError(req, {
      correlationId,
      status: 400,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing albumId (canonical album context)",
    });
  }

  const playbackAsset = await verifyAlbumPlaybackAsset({
    albumId,
    playbackId,
    trackId: body?.trackId ?? null,
  });

  if (!playbackAsset.ok) {
    return muxGateError(req, {
      correlationId,
      status: 403,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Playback asset does not belong to the requested album.",
    });
  }

  const albumScopeId = `alb:${albumId}`;

  const { userId } = await auth();

  // Stable anon id, cookie-backed on the response path.
  const { anonId } = ensureAnonId(req);

  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null;

  if (userId && !memberId) {
    return muxGateError(req, {
      correlationId,
      status: 403,
      code: "PROVISIONING",
      action: "wait",
      message:
        "Signed in, but your member profile is still being created. Refresh in a moment.",
    });
  }

  const url = new URL(req.url);
  const st =
    (body?.st ?? "").trim() ||
    (url.searchParams.get("st") ?? "").trim() ||
    (url.searchParams.get("share") ?? "").trim();

  // Share tokens grant album access. Playback is a consequence of access.
  let tokenAllowsPlayback = false;

  if (st) {
    const v = await validateShareToken({
      token: st,
      expectedScopeId: albumScopeId,
      anonId,
      resourceKind: "album",
      resourceId: albumScopeId,
      action: "access",
    });

    tokenAllowsPlayback = v.ok;

    if (!v.ok) {
      if (v.code === "CAP_REACHED") {
        return muxGateError(req, {
          correlationId,
          status: 403,
          code: "CAP_REACHED",
          action: "login",
          message: "Share link cap reached.",
        });
      }

      return muxGateError(req, {
        correlationId,
        status: 403,
        code: "ENTITLEMENT_REQUIRED",
        action: "login",
        message: "Invalid or expired share token.",
      });
    }
  }

  // ---- Anonymous cap ----
  if (!userId && !tokenAllowsPlayback) {
    const distinctCompleted = await countAnonDistinctCompletedTracks({
      anonId,
      sinceDays: ANON_PLAYBACK_POLICY.windowDays,
    });

    if (
      hasReachedAnonPlaybackCap({
        distinctCompletedTracks: distinctCompleted,
      })
    ) {
      return muxGateError(req, {
        correlationId,
        status: 403,
        code: "PLAYBACK_CAP_REACHED",
        action: "login",
        message:
          "Please enter an email address to continue listening for free.",
      });
    }
  }

  // ---- Canonical album access via oracle ----
  // This is the real server-side playback lock. Share tokens may satisfy
  // entitlement, but they must not bypass embargo or album policy.
  const d = await decideAlbumPlaybackAccess({
    memberId,
    albumId,
    correlationId,
    action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
    shareTokenAllowsPlayback: tokenAllowsPlayback,
  });

  if (!d.allowed) {
    return muxGateError(req, {
      correlationId,
      status: 403,
      code: toTokenGateCode(d.code),
      action: (d.action ?? "wait") as GateAction,
      message: d.reason,
    });
  }

  // ---- Mux Secure Playback signing ----
  const keyId = mustEnv("MUX_SIGNING_KEY_ID", "MUX_PLAYBACK_SIGNING_KEY_ID");
  const raw = mustEnv(
    "MUX_SIGNING_KEY_SECRET",
    "MUX_SIGNING_PRIVATE_KEY",
    "MUX_PLAYBACK_SIGNING_PRIVATE_KEY",
  );

  const pkcs8Pem = toPkcs8Pem(normalizePemMaybe(raw));
  const pk = await importPKCS8(pkcs8Pem, "RS256");

  const now = Math.floor(Date.now() / 1000);
  const baseTtl = Number(process.env.MUX_TOKEN_TTL_SECONDS ?? 900);

  const durSecHint =
    typeof body?.durationMs === "number" &&
    Number.isFinite(body.durationMs) &&
    body.durationMs > 0
      ? Math.ceil(body.durationMs / 1000)
      : 0;

  const minForDuration = durSecHint > 0 ? durSecHint + 120 : 0;
  const ttl = Math.min(Math.max(baseTtl, minForDuration, 60), 60 * 60 * 2);
  const exp = now + ttl;

  const playbackRestrictionId =
    process.env.MUX_PLAYBACK_RESTRICTION_ID?.trim() || undefined;

  const jwt = await new SignJWT({
    sub: playbackId,
    aud: AUD,
    exp,
    ...(playbackRestrictionId
      ? { playback_restriction_id: playbackRestrictionId }
      : {}),
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId, typ: "JWT" })
    .sign(pk);

  const out: TokenOk = { ok: true, token: jwt, expiresAt: exp, correlationId };

  const res = jsonOk(out, { correlationId });
  ensureAnonId(req, res);
  return res;
}
