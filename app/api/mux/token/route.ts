// web/app/api/mux/token/route.ts
import "server-only";

import { NextRequest, NextResponse } from "next/server";

import { correlationIdFromRequest, jsonOk } from "@/app/api/_gate";
import {
  createMuxPlaybackSigner,
  muxPlaybackGateError,
  normalizeMuxAlbumId,
  persistMuxAnonIdentity,
  readMuxShareToken,
  resolveMuxPlaybackAccess,
  type MuxPlaybackAccessContext,
} from "@/app/api/mux/_playbackIssuance";
import { resolveAnonPlaybackSample } from "@/lib/anonPlaybackSample";
import {
  getAlbumPlaybackAssetsForSession,
  verifyAlbumPlaybackAsset,
} from "@/lib/albums";
import { muxSignedStaticAudioUrl } from "@/lib/mux";

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

type SingleTokenSampleResult =
  | { ok: true; sampleExpiresAtSeconds: number | null }
  | { ok: false; response: NextResponse };

async function readTokenRequest(req: NextRequest): Promise<TokenReq | null> {
  try {
    return (await req.json()) as TokenReq;
  } catch {
    return null;
  }
}

function minimumTtlSecondsForDuration(durationMs: unknown): number {
  if (
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs <= 0
  ) {
    return 0;
  }

  return Math.ceil(durationMs / 1000) + 120;
}

async function resolveSingleTokenSample(params: {
  req: NextRequest;
  access: MuxPlaybackAccessContext;
  albumId: string;
  playbackId: string;
  correlationId: string;
}): Promise<SingleTokenSampleResult> {
  if (params.access.userId || params.access.tokenAllowsPlayback) {
    return { ok: true, sampleExpiresAtSeconds: null };
  }

  const sessionAssets = await getAlbumPlaybackAssetsForSession({
    albumId: params.albumId,
  });

  if (!sessionAssets.ok || !sessionAssets.albumId) {
    return {
      ok: false,
      response: muxPlaybackGateError(params.req, {
        correlationId: params.correlationId,
        status: 404,
        code: "INVALID_REQUEST",
        action: "wait",
        message: "No playable tracks were found for this album.",
        anonId: params.access.anonId,
        isNewAnonId: params.access.isNewAnonId,
      }),
    };
  }

  const sample = await resolveAnonPlaybackSample({
    anonId: params.access.anonId,
    albumId: sessionAssets.albumId,
    requestedPlaybackId: params.playbackId,
    tracks: sessionAssets.tracks.map((track) => ({
      recordingId: track.recordingId,
      playbackId: track.playbackId,
    })),
  });

  if (!sample.ok) {
    const invalidStart = sample.reason === "invalid_start";

    return {
      ok: false,
      response: muxPlaybackGateError(params.req, {
        correlationId: params.correlationId,
        status: invalidStart ? 400 : 403,
        code: invalidStart ? "INVALID_REQUEST" : "PLAYBACK_CAP_REACHED",
        action: invalidStart ? "wait" : "login",
        message: invalidStart
          ? "Missing or invalid anonymous sample starting track."
          : "Enter your email address to continue listening.",
        anonId: params.access.anonId,
        isNewAnonId: params.access.isNewAnonId,
      }),
    };
  }

  const includesPlayback = sample.sample.tracks.some(
    (track) => track.playbackId === params.playbackId,
  );

  if (!includesPlayback) {
    return {
      ok: false,
      response: muxPlaybackGateError(params.req, {
        correlationId: params.correlationId,
        status: 403,
        code: "PLAYBACK_CAP_REACHED",
        action: "login",
        message: "Enter your email address to continue listening.",
        anonId: params.access.anonId,
        isNewAnonId: params.access.isNewAnonId,
      }),
    };
  }

  return {
    ok: true,
    sampleExpiresAtSeconds: Math.floor(
      sample.sample.expiresAt.getTime() / 1000,
    ),
  };
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const body = await readTokenRequest(req);

  const playbackId =
    typeof body?.playbackId === "string" ? body.playbackId.trim() : "";

  if (!playbackId) {
    return muxPlaybackGateError(req, {
      correlationId,
      status: 400,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing playbackId",
    });
  }

  const albumId = normalizeMuxAlbumId(body?.albumId);

  if (!albumId) {
    return muxPlaybackGateError(req, {
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
    return muxPlaybackGateError(req, {
      correlationId,
      status: 403,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Playback asset does not belong to the requested album.",
    });
  }

  const accessResult = await resolveMuxPlaybackAccess(req, {
    albumId,
    albumScopeId: `alb:${albumId}`,
    shareToken: readMuxShareToken(req, body?.st),
    correlationId,
  });

  if (!accessResult.ok) {
    return accessResult.response;
  }

  const sampleResult = await resolveSingleTokenSample({
    req,
    access: accessResult.context,
    albumId,
    playbackId,
    correlationId,
  });

  if (!sampleResult.ok) {
    return sampleResult.response;
  }

  const signer = await createMuxPlaybackSigner({
    baseTtlSeconds: Number(process.env.MUX_TOKEN_TTL_SECONDS ?? 900),
    minimumTtlSeconds: minimumTtlSecondsForDuration(body?.durationMs),
    sampleExpiresAtSeconds: sampleResult.sampleExpiresAtSeconds,
  });

  const out: TokenOk = {
    ok: true,
    token: await signer.sign(playbackId),
    expiresAt: signer.expiresAt,
    correlationId,
  };

  const response = jsonOk(out, { correlationId });
  persistMuxAnonIdentity(response, accessResult.context);
  return response;
}

export async function GET(req: NextRequest) {
  const format = (req.nextUrl.searchParams.get("format") ?? "").trim();

  if (format !== "audio-m4a") {
    return muxPlaybackGateError(req, {
      correlationId: correlationIdFromRequest(req),
      status: 400,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Unsupported token response format.",
    });
  }

  const playbackId = (req.nextUrl.searchParams.get("playbackId") ?? "").trim();
  const albumId = (req.nextUrl.searchParams.get("albumId") ?? "").trim();
  const st = (req.nextUrl.searchParams.get("st") ?? "").trim();
  const durationValue = Number(
    req.nextUrl.searchParams.get("durationMs") ?? "",
  );

  const tokenRequest: TokenReq = {
    playbackId,
    albumId,
    ...(st ? { st } : {}),
    ...(Number.isFinite(durationValue) && durationValue > 0
      ? { durationMs: Math.round(durationValue) }
      : {}),
  };

  const headers = new Headers(req.headers);
  headers.set("content-type", "application/json");

  const syntheticPostRequest = new NextRequest(req.url, {
    method: "POST",
    headers,
    body: JSON.stringify(tokenRequest),
  });

  // Reuse the authoritative POST gate and signer. No media bytes pass through
  // this route; a successful response becomes a temporary redirect to Mux.
  const tokenResponse = await POST(syntheticPostRequest);

  if (!tokenResponse.ok) {
    return tokenResponse;
  }

  const tokenPayload = (await tokenResponse
    .clone()
    .json()
    .catch(() => null)) as TokenOk | null;

  if (tokenPayload?.ok !== true || !tokenPayload.token.trim()) {
    return muxPlaybackGateError(req, {
      correlationId: correlationIdFromRequest(req),
      status: 502,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Playback token response could not be resolved.",
    });
  }

  const muxUrl = muxSignedStaticAudioUrl(playbackId, tokenPayload.token);

  const redirect = NextResponse.redirect(muxUrl, 307);

  redirect.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate",
  );

  const correlationId = tokenResponse.headers.get("x-correlation-id");

  if (correlationId) {
    redirect.headers.set("x-correlation-id", correlationId);
  }

  // Preserve the stable anonymous-listener cookie created by the underlying
  // token route on a first-time sample request.
  const setCookie = tokenResponse.headers.get("set-cookie");

  if (setCookie) {
    redirect.headers.set("set-cookie", setCookie);
  }

  return redirect;
}


