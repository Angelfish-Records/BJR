// web/app/home/player/lyrics/ensureLyricsForTrack.ts
"use client";

import { lyricsSurface } from "./lyricsSurface";
import { fetchLyricsByrecordingId } from "./fetchLyricsByRecordingId";
import type { AlbumLyricsBundle } from "@/lib/types";

// Module-scope in-flight map so *any* caller (any surface) dedupes fetches.
const inFlight = new Map<string, AbortController>();

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
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

  const cuesIn = bundle.cuesByRecordingId ?? {};
  const offIn = bundle.offsetByRecordingId ?? {};

  // Build merged maps but only add keys that are currently unknown.
  let cuesOut = snap.cuesByRecordingId;
  let offOut = snap.offsetByRecordingId;

  for (const [recordingIdRaw, cuesRaw] of Object.entries(cuesIn)) {
    const id = (recordingIdRaw ?? "").trim();
    if (!id) continue;

    if (hasOwn(cuesOut, id)) continue; // don't overwrite existing (including [] known-no-lyrics)

    const cues = Array.isArray(cuesRaw) ? cuesRaw : [];
    cuesOut = { ...cuesOut, [id]: cues };
  }

  for (const [recordingIdRaw, offRaw] of Object.entries(offIn)) {
    const id = (recordingIdRaw ?? "").trim();
    if (!id) continue;

    if (hasOwn(offOut, id)) continue; // don't overwrite existing

    const n =
      typeof offRaw === "number" && Number.isFinite(offRaw)
        ? Math.floor(offRaw)
        : 0;

    offOut = { ...offOut, [id]: n };
  }

  // Only write if something changed (cheap reference check).
  if (cuesOut === snap.cuesByRecordingId && offOut === snap.offsetByRecordingId) return;

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

  const knownKey = hasOwn(snap.cuesByRecordingId, id);
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

    const nextCuesByrecordingId =
      Array.isArray(r.cues) && r.cues.length
        ? { ...prev.cuesByRecordingId, [id]: r.cues }
        : hasOwn(prev.cuesByRecordingId, id)
          ? prev.cuesByRecordingId
          : { ...prev.cuesByRecordingId, [id]: [] };

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
