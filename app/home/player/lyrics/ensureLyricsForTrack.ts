// web/app/home/player/lyrics/ensureLyricsForTrack.ts
"use client";

import { lyricsSurface } from "./lyricsSurface";
import { fetchLyricsByrecordingId } from "./fetchLyricsByRecordingId";
import type { AlbumLyricsBundle } from "@/lib/types";

type CuesByRecordingId = AlbumLyricsBundle["cuesByRecordingId"];
type OffsetByRecordingId = AlbumLyricsBundle["offsetByRecordingId"];

// Module-scope in-flight map so *any* caller (any surface) dedupes fetches.
const inFlight = new Map<string, AbortController>();

function mergeMissingCues(
  current: CuesByRecordingId,
  incoming: CuesByRecordingId,
): CuesByRecordingId {
  let next = current;

  for (const [recordingIdRaw, cuesRaw] of Object.entries(incoming)) {
    const id = (recordingIdRaw ?? "").trim();
    if (!id || Object.hasOwn(next, id)) continue;

    const cues = Array.isArray(cuesRaw) ? cuesRaw : [];
    next = { ...next, [id]: cues };
  }

  return next;
}

function mergeMissingOffsets(
  current: OffsetByRecordingId,
  incoming: OffsetByRecordingId,
): OffsetByRecordingId {
  let next = current;

  for (const [recordingIdRaw, offRaw] of Object.entries(incoming)) {
    const id = (recordingIdRaw ?? "").trim();
    if (!id || Object.hasOwn(next, id)) continue;

    const n =
      typeof offRaw === "number" && Number.isFinite(offRaw)
        ? Math.floor(offRaw)
        : 0;

    next = { ...next, [id]: n };
  }

  return next;
}

function nextCuesMap(
  current: CuesByRecordingId,
  recordingId: string,
  cues: CuesByRecordingId[string],
): CuesByRecordingId {
  if (Array.isArray(cues) && cues.length > 0) {
    return { ...current, [recordingId]: cues };
  }

  if (Object.hasOwn(current, recordingId)) {
    return current;
  }

  return { ...current, [recordingId]: [] };
}

/**
 * Prime lyricsSurface from an album-provided bundle.
 * - Merges without clobbering existing per-track entries (unless missing).
 * - Ensures we still preserve "known no lyrics" as [] if already present.
 * - No network; safe to call repeatedly (idempotent-ish).
 */
export function primeLyricsFromAlbumBundle(
  bundle: AlbumLyricsBundle | null | undefined,
) {
  if (!bundle) return;

  const snap = lyricsSurface.getSnapshot();

  const cuesOut = mergeMissingCues(
    snap.cuesByRecordingId,
    bundle.cuesByRecordingId ?? {},
  );
  const offOut = mergeMissingOffsets(
    snap.offsetByRecordingId,
    bundle.offsetByRecordingId ?? {},
  );

  // Only write if something changed (cheap reference check).
  if (
    cuesOut === snap.cuesByRecordingId &&
    offOut === snap.offsetByRecordingId
  ) {
    return;
  }

  lyricsSurface.setMaps({
    cuesByrecordingId: cuesOut,
    offsetByrecordingId: offOut,
    globalOffsetMs: snap.globalOffsetMs,
  });
}

/**
 * Ensure lyrics (cues + offset) exist in lyricsSurface for recordingId.
 * - Dedupes concurrent calls (module-level inFlight).
 * - Caches "no lyrics" as [] to avoid refetch loops.
 * - Safe to call repeatedly from any surface.
 */
export async function ensureLyricsForTrack(
  recordingId: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const id = (recordingId ?? "").trim();
  if (!id) return;

  const snap = lyricsSurface.getSnapshot();
  const existing = snap.cuesByRecordingId[id];

  const knownKey = Object.hasOwn(snap.cuesByRecordingId, id);
  const hasCues = Array.isArray(existing) && existing.length > 0;
  const knownNoLyrics =
    knownKey && Array.isArray(existing) && existing.length === 0;

  if (hasCues || knownNoLyrics) return;

  // Already fetching?
  if (inFlight.has(id)) return;

  const ac = new AbortController();
  inFlight.set(id, ac);

  // Caller abort should NOT abort the shared in-flight request.
  // It only means "this caller no longer cares". The module-scope fetch may be
  // servicing other callers (PlayerState, StageInline, etc).
  const outerSignal = opts?.signal;
  if (outerSignal?.aborted) {
    inFlight.delete(id);
    return;
  }

  try {
    const r = await fetchLyricsByrecordingId(id, ac.signal);
    if (!r) return;
    if (r.recordingId !== id) return;

    const prev = lyricsSurface.getSnapshot();

    const nextCuesByrecordingId = nextCuesMap(
      prev.cuesByRecordingId,
      id,
      r.cues,
    );

    const nextOffsetByrecordingId =
      typeof r.offsetMs === "number" && Number.isFinite(r.offsetMs)
        ? { ...prev.offsetByRecordingId, [id]: r.offsetMs }
        : prev.offsetByRecordingId;

    lyricsSurface.setMaps({
      cuesByrecordingId: nextCuesByrecordingId,
      offsetByrecordingId: nextOffsetByrecordingId,
      // preserve whatever globalOffsetMs currently is (lyricsSurface handles defaulting)
      globalOffsetMs: prev.globalOffsetMs,
    });
  } finally {
    inFlight.delete(id);
  }
}
