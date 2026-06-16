// web/app/api/mux/album-session/route.ts
import "server-only";
import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { importPKCS8, SignJWT } from "jose";
import crypto from "crypto";

import { ACCESS_ACTIONS } from "@/lib/vocab";
import type {
  GateAction,
  GateCodeRaw,
  GateDomain,
} from "@/app/home/gating/gateTypes";
import { validateShareToken } from "@/lib/shareTokens";
import { decideAlbumPlaybackAccess } from "@/lib/accessOracle";
import { ensureAnonId } from "@/lib/anon";
import { getAlbumPlaybackAssetsForSession } from "@/lib/albums";
import { correlationIdFromRequest, gateError, jsonOk } from "@/app/api/_gate";

type AlbumSessionReq = {
  albumId?: string;
  st?: string;
};

type AlbumSessionTrackToken = {
  recordingId: string;
  displayId: string;
  playbackId: string;
  token: string;
  expiresAt: number;
};

type AlbumSessionOk = {
  ok: true;
  albumId: string;
  expiresAt: number;
  tracks: AlbumSessionTrackToken[];
  correlationId: string;
};

const AUD = "v";
const PLAYBACK_DOMAIN: GateDomain = "playback";

function mustEnv(...names: string[]): string {
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

async function signPlaybackToken(params: {
  playbackId: string;
  exp: number;
  keyId: string;
  pkcs8Pem: string;
  playbackRestrictionId?: string;
}): Promise<string> {
  const pk = await importPKCS8(params.pkcs8Pem, "RS256");

  return new SignJWT({
    sub: params.playbackId,
    aud: AUD,
    exp: params.exp,
    ...(params.playbackRestrictionId
      ? { playback_restriction_id: params.playbackRestrictionId }
      : {}),
  })
    .setProtectedHeader({ alg: "RS256", kid: params.keyId, typ: "JWT" })
    .sign(pk);
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);

  let body: AlbumSessionReq | null = null;
  try {
    body = (await req.json()) as AlbumSessionReq;
  } catch {
    body = null;
  }

  const rawAlbumId = typeof body?.albumId === "string" ? body.albumId : "";
  const requestedAlbumId = normalizeAlbumId(rawAlbumId);

  if (!requestedAlbumId) {
    return gateError(req, {
      correlationId,
      status: 400,
      domain: PLAYBACK_DOMAIN,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing albumId",
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  if (process.env.AUDIO_DEBUG_SERVER_LOGS === "1") {
    console.info("[audio-debug]", {
      event: "album-session-route-requested",
      albumId: requestedAlbumId,
      ua: req.headers.get("user-agent") ?? null,
    });
  }

  const sessionAssets = await getAlbumPlaybackAssetsForSession({
    albumId: requestedAlbumId,
  });

  if (
    !sessionAssets.ok ||
    !sessionAssets.albumId ||
    !sessionAssets.albumScopeId
  ) {
    return gateError(req, {
      correlationId,
      status: 404,
      domain: PLAYBACK_DOMAIN,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "No playable tracks were found for this album.",
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  const { userId } = await auth();
  const { anonId } = ensureAnonId(req);
  const memberId = userId ? await getMemberIdByClerkUserId(userId) : null;

  if (userId && !memberId) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: PLAYBACK_DOMAIN,
      code: "PROVISIONING",
      action: "wait",
      message:
        "Signed in, but your member profile is still being created. Refresh in a moment.",
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  const url = new URL(req.url);
  const st =
    (body?.st ?? "").trim() ||
    (url.searchParams.get("st") ?? "").trim() ||
    (url.searchParams.get("share") ?? "").trim();

  let tokenAllowsPlayback = false;

  if (st) {
    const v = await validateShareToken({
      token: st,
      expectedScopeId: sessionAssets.albumScopeId,
      anonId,
      resourceKind: "album",
      resourceId: sessionAssets.albumScopeId,
      action: "access",
    });

    tokenAllowsPlayback = v.ok;

    if (!v.ok) {
      if (v.code === "CAP_REACHED") {
        return gateError(req, {
          correlationId,
          status: 403,
          domain: PLAYBACK_DOMAIN,
          code: "CAP_REACHED",
          action: "login",
          message: "Share link cap reached.",
          onResponse: (res) => ensureAnonId(req, res),
        });
      }

      return gateError(req, {
        correlationId,
        status: 403,
        domain: PLAYBACK_DOMAIN,
        code: "ENTITLEMENT_REQUIRED",
        action: "login",
        message: "Invalid or expired share token.",
        onResponse: (res) => ensureAnonId(req, res),
      });
    }
  }

  if (!userId && !tokenAllowsPlayback) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: PLAYBACK_DOMAIN,
      code: "ENTITLEMENT_REQUIRED",
      action: "login",
      message: "Sign in to preload album playback.",
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  const d = await decideAlbumPlaybackAccess({
    memberId,
    albumId: sessionAssets.albumId,
    correlationId,
    action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
    shareTokenAllowsPlayback: tokenAllowsPlayback,
  });

  if (!d.allowed) {
    return gateError(req, {
      correlationId,
      status: 403,
      domain: PLAYBACK_DOMAIN,
      code: toTokenGateCode(d.code),
      action: (d.action ?? "wait") as GateAction,
      message: d.reason,
      onResponse: (res) => ensureAnonId(req, res),
    });
  }

  const keyId = mustEnv("MUX_SIGNING_KEY_ID", "MUX_PLAYBACK_SIGNING_KEY_ID");
  const raw = mustEnv(
    "MUX_SIGNING_KEY_SECRET",
    "MUX_SIGNING_PRIVATE_KEY",
    "MUX_PLAYBACK_SIGNING_PRIVATE_KEY",
  );

  const pkcs8Pem = toPkcs8Pem(normalizePemMaybe(raw));
  const now = Math.floor(Date.now() / 1000);
  const baseTtl = Number(
    process.env.MUX_ALBUM_SESSION_TOKEN_TTL_SECONDS ??
      process.env.MUX_TOKEN_TTL_SECONDS ??
      7200,
  );
  const ttl = Math.min(Math.max(baseTtl, 60), 60 * 60 * 2);
  const exp = now + ttl;

  const playbackRestrictionId =
    process.env.MUX_PLAYBACK_RESTRICTION_ID?.trim() || undefined;

  const tracks: AlbumSessionTrackToken[] = await Promise.all(
    sessionAssets.tracks.map(async (track) => ({
      recordingId: track.recordingId,
      displayId: track.displayId,
      playbackId: track.playbackId,
      token: await signPlaybackToken({
        playbackId: track.playbackId,
        exp,
        keyId,
        pkcs8Pem,
        playbackRestrictionId,
      }),
      expiresAt: exp,
    })),
  );

  if (process.env.AUDIO_DEBUG_SERVER_LOGS === "1") {
    console.info("[audio-debug]", {
      event: "album-session-route-issued",
      albumId: sessionAssets.albumId,
      tracks: tracks.length,
      expiresAt: exp,
      correlationId,
    });
  }

  const out: AlbumSessionOk = {
    ok: true,
    albumId: sessionAssets.albumId,
    expiresAt: exp,
    tracks,
    correlationId,
  };

  const res = jsonOk(out, { correlationId });
  ensureAnonId(req, res);
  return res;
}
