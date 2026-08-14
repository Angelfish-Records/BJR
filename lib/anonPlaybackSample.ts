import "server-only";

import crypto from "node:crypto";
import { sql } from "@vercel/postgres";

import { countAnonDistinctCompletedTracks } from "@/lib/events";
import { ANON_PLAYBACK_POLICY } from "@/lib/anonPlaybackPolicy";

export type AnonPlaybackSampleTrack = {
  recordingId: string;
  playbackId: string;
};

export type AnonPlaybackSample = {
  id: string;
  albumId: string;
  tracks: AnonPlaybackSampleTrack[];
  expiresAt: Date;
};

export type AnonPlaybackSampleResolution =
  | {
      ok: true;
      sample: AnonPlaybackSample;
    }
  | {
      ok: false;
      reason: "cap_reached" | "sample_reserved" | "invalid_start";
    };

type SampleStateRow = {
  sample_id: string;
  album_id: string;
  tracks: unknown;
  expires_at: string | Date;
};

function parseTracks(value: unknown): AnonPlaybackSampleTrack[] | null {
  let raw: unknown = value;

  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  if (!Array.isArray(raw) || raw.length === 0) return null;

  const out: AnonPlaybackSampleTrack[] = [];
  const seenPlaybackIds = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") return null;

    const record = item as Record<string, unknown>;
    const recordingId =
      typeof record.recordingId === "string" ? record.recordingId.trim() : "";
    const playbackId =
      typeof record.playbackId === "string" ? record.playbackId.trim() : "";

    if (!recordingId || !playbackId || seenPlaybackIds.has(playbackId)) {
      return null;
    }

    seenPlaybackIds.add(playbackId);
    out.push({ recordingId, playbackId });
  }

  return out;
}

function rowToSample(row: SampleStateRow): AnonPlaybackSample | null {
  const id = row.sample_id.trim();
  const albumId = row.album_id.trim();
  const tracks = parseTracks(row.tracks);
  const expiresAt = new Date(row.expires_at);

  if (
    !id ||
    !albumId ||
    !tracks ||
    !Number.isFinite(expiresAt.getTime())
  ) {
    return null;
  }

  return {
    id,
    albumId,
    tracks,
    expiresAt,
  };
}

function isLive(sample: AnonPlaybackSample): boolean {
  return sample.expiresAt.getTime() > Date.now();
}

function includesPlaybackId(
  sample: AnonPlaybackSample,
  playbackId: string,
): boolean {
  return sample.tracks.some((track) => track.playbackId === playbackId);
}

async function readSampleState(
  anonId: string,
): Promise<AnonPlaybackSample | null> {
  const result = await sql<SampleStateRow>`
    select
      sample_id,
      album_id,
      tracks,
      expires_at
    from anon_playback_sample_state
    where anon_id = ${anonId}
    limit 1
  `;

  const row = result.rows[0];
  return row ? rowToSample(row) : null;
}

async function claimRequestedSample(params: {
  anonId: string;
  albumId: string;
  tracks: AnonPlaybackSampleTrack[];
  expiresAt: Date;
}): Promise<AnonPlaybackSample | null> {
  const sampleId = crypto.randomUUID();

  const result = await sql<SampleStateRow>`
    insert into anon_playback_sample_state (
      anon_id,
      sample_id,
      album_id,
      tracks,
      expires_at,
      updated_at
    )
    values (
      ${params.anonId},
      ${sampleId},
      ${params.albumId},
      ${JSON.stringify(params.tracks)}::jsonb,
      ${params.expiresAt.toISOString()}::timestamptz,
      now()
    )
    on conflict (anon_id) do update
    set
      sample_id = excluded.sample_id,
      album_id = excluded.album_id,
      tracks = excluded.tracks,
      expires_at = excluded.expires_at,
      updated_at = now()
    returning
      sample_id,
      album_id,
      tracks,
      expires_at
  `;

  const claimed = result.rows[0];
  if (claimed) return rowToSample(claimed);

  return readSampleState(params.anonId);
}

function findRequestedSampleTrack(params: {
  tracks: AnonPlaybackSampleTrack[];
  requestedPlaybackId: string;
}): AnonPlaybackSampleTrack | null {
  return (
    params.tracks.find(
      (track) => track.playbackId === params.requestedPlaybackId,
    ) ?? null
  );
}

export async function resolveAnonPlaybackSample(params: {
  anonId: string;
  albumId: string;
  requestedPlaybackId: string;
  tracks: AnonPlaybackSampleTrack[];
}): Promise<AnonPlaybackSampleResolution> {
  const anonId = params.anonId.trim();
  const albumId = params.albumId.trim();
  const requestedPlaybackId = params.requestedPlaybackId.trim();

  if (!anonId || !albumId || !requestedPlaybackId) {
    return { ok: false, reason: "invalid_start" };
  }

  // Completion, not selection, consumes anonymous playback capacity.
  // Check the authoritative distinct-completion ledger on every issuance.
  const distinctCompleted = await countAnonDistinctCompletedTracks({
    anonId,
    sinceDays: ANON_PLAYBACK_POLICY.windowDays,
  });

  if (distinctCompleted >= ANON_PLAYBACK_POLICY.distinctTrackCap) {
    return { ok: false, reason: "cap_reached" };
  }

  const requestedTrack = findRequestedSampleTrack({
    tracks: params.tracks,
    requestedPlaybackId,
  });

  if (!requestedTrack) {
    return { ok: false, reason: "invalid_start" };
  }

  // Only the track actually requested is signed into this anonymous sample.
  // Skipping it does not consume a cap slot; qualification happens separately
  // through the >=90% completion ledger.
  const candidateTracks = [requestedTrack];

  const expiresAt = new Date(
    Date.now() + ANON_PLAYBACK_POLICY.sampleSessionTtlSeconds * 1000,
  );

  const claimed = await claimRequestedSample({
    anonId,
    albumId,
    tracks: candidateTracks,
    expiresAt,
  });

  if (!claimed || !isLive(claimed)) {
    return { ok: false, reason: "sample_reserved" };
  }

  if (
    claimed.albumId !== albumId ||
    !includesPlaybackId(claimed, requestedPlaybackId)
  ) {
    return { ok: false, reason: "sample_reserved" };
  }

  return { ok: true, sample: claimed };
}
