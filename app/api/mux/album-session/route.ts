// web/app/api/mux/album-session/route.ts
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
  type MuxPlaybackSigner,
} from "@/app/api/mux/_playbackIssuance";
import {
  resolveAnonPlaybackSample,
  type AnonPlaybackSample,
} from "@/lib/anonPlaybackSample";
import {
  getAlbumPlaybackAssetsForSession,
  type AlbumPlaybackSessionAsset,
} from "@/lib/albums";

type AlbumSessionReq = {
  albumId?: string;
  st?: string;
  startPlaybackId?: string;
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
  mode: "full" | "sample";
  sampleSession?: {
    id: string;
    expiresAt: number;
    trackCount: number;
  };
  correlationId: string;
};

type AlbumSessionSampleSelection =
  | {
      ok: true;
      mode: AlbumSessionOk["mode"];
      sampleSession: AnonPlaybackSample | null;
      tracksToSign: AlbumPlaybackSessionAsset[];
    }
  | { ok: false; response: NextResponse };

async function readAlbumSessionRequest(
  req: NextRequest,
): Promise<AlbumSessionReq | null> {
  try {
    return (await req.json()) as AlbumSessionReq;
  } catch {
    return null;
  }
}

function logAlbumSessionRequested(
  req: NextRequest,
  albumId: string,
): void {
  if (process.env.AUDIO_DEBUG_SERVER_LOGS !== "1") {
    return;
  }

  console.info("[audio-debug]", {
    event: "album-session-route-requested",
    albumId,
    ua: req.headers.get("user-agent") ?? null,
  });
}

function logAlbumSessionIssued(params: {
  albumId: string;
  trackCount: number;
  expiresAt: number;
  correlationId: string;
}): void {
  if (process.env.AUDIO_DEBUG_SERVER_LOGS !== "1") {
    return;
  }

  console.info("[audio-debug]", {
    event: "album-session-route-issued",
    albumId: params.albumId,
    tracks: params.trackCount,
    expiresAt: params.expiresAt,
    correlationId: params.correlationId,
  });
}

async function resolveAlbumSessionSample(params: {
  req: NextRequest;
  access: MuxPlaybackAccessContext;
  albumId: string;
  requestedPlaybackId: string;
  tracks: AlbumPlaybackSessionAsset[];
  correlationId: string;
}): Promise<AlbumSessionSampleSelection> {
  if (params.access.userId || params.access.tokenAllowsPlayback) {
    return {
      ok: true,
      mode: "full",
      sampleSession: null,
      tracksToSign: params.tracks,
    };
  }

  const sample = await resolveAnonPlaybackSample({
    anonId: params.access.anonId,
    albumId: params.albumId,
    requestedPlaybackId: params.requestedPlaybackId,
    tracks: params.tracks.map((track) => ({
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

  const assetsByPlaybackId = new Map(
    params.tracks.map((track) => [track.playbackId, track]),
  );

  const boundedTracks = sample.sample.tracks
    .map((track) => assetsByPlaybackId.get(track.playbackId) ?? null)
    .filter(
      (track): track is AlbumPlaybackSessionAsset => track !== null,
    );

  if (boundedTracks.length !== sample.sample.tracks.length) {
    return {
      ok: false,
      response: muxPlaybackGateError(params.req, {
        correlationId: params.correlationId,
        status: 500,
        code: "INVALID_REQUEST",
        action: "wait",
        message: "Anonymous sample session could not be resolved.",
        anonId: params.access.anonId,
        isNewAnonId: params.access.isNewAnonId,
      }),
    };
  }

  return {
    ok: true,
    mode: "sample",
    sampleSession: sample.sample,
    tracksToSign: boundedTracks,
  };
}

async function signAlbumSessionTracks(
  tracks: readonly AlbumPlaybackSessionAsset[],
  signer: MuxPlaybackSigner,
): Promise<AlbumSessionTrackToken[]> {
  return Promise.all(
    tracks.map(async (track) => ({
      recordingId: track.recordingId,
      displayId: track.displayId,
      playbackId: track.playbackId,
      token: await signer.sign(track.playbackId),
      expiresAt: signer.expiresAt,
    })),
  );
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const body = await readAlbumSessionRequest(req);
  const requestedAlbumId = normalizeMuxAlbumId(body?.albumId);

  if (!requestedAlbumId) {
    return muxPlaybackGateError(req, {
      correlationId,
      status: 400,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "Missing albumId",
    });
  }

  logAlbumSessionRequested(req, requestedAlbumId);

  const sessionAssets = await getAlbumPlaybackAssetsForSession({
    albumId: requestedAlbumId,
  });

  if (
    !sessionAssets.ok ||
    !sessionAssets.albumId ||
    !sessionAssets.albumScopeId
  ) {
    return muxPlaybackGateError(req, {
      correlationId,
      status: 404,
      code: "INVALID_REQUEST",
      action: "wait",
      message: "No playable tracks were found for this album.",
    });
  }

  const accessResult = await resolveMuxPlaybackAccess(req, {
    albumId: sessionAssets.albumId,
    albumScopeId: sessionAssets.albumScopeId,
    shareToken: readMuxShareToken(req, body?.st),
    correlationId,
  });

  if (!accessResult.ok) {
    return accessResult.response;
  }

  const sampleSelection = await resolveAlbumSessionSample({
    req,
    access: accessResult.context,
    albumId: sessionAssets.albumId,
    requestedPlaybackId:
      typeof body?.startPlaybackId === "string"
        ? body.startPlaybackId.trim()
        : "",
    tracks: sessionAssets.tracks,
    correlationId,
  });

  if (!sampleSelection.ok) {
    return sampleSelection.response;
  }

  const sampleExpiresAtSeconds = sampleSelection.sampleSession
    ? Math.floor(sampleSelection.sampleSession.expiresAt.getTime() / 1000)
    : null;

  const signer = await createMuxPlaybackSigner({
    baseTtlSeconds: Number(
      process.env.MUX_ALBUM_SESSION_TOKEN_TTL_SECONDS ??
        process.env.MUX_TOKEN_TTL_SECONDS ??
        7200,
    ),
    sampleExpiresAtSeconds,
  });

  const tracks = await signAlbumSessionTracks(
    sampleSelection.tracksToSign,
    signer,
  );

  logAlbumSessionIssued({
    albumId: sessionAssets.albumId,
    trackCount: tracks.length,
    expiresAt: signer.expiresAt,
    correlationId,
  });

  const out: AlbumSessionOk = {
    ok: true,
    albumId: sessionAssets.albumId,
    expiresAt: signer.expiresAt,
    tracks,
    mode: sampleSelection.mode,
    ...(sampleSelection.sampleSession
      ? {
          sampleSession: {
            id: sampleSelection.sampleSession.id,
            expiresAt: signer.expiresAt,
            trackCount: tracks.length,
          },
        }
      : {}),
    correlationId,
  };

  const response = jsonOk(out, { correlationId });
  persistMuxAnonIdentity(response, accessResult.context);
  return response;
}
