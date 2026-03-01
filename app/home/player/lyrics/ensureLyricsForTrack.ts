// web/app/home/player/lyrics/ensureLyricsForTrack.ts
"use client";

import { lyricsSurface } from "./lyricsSurface";
import { fetchLyricsByTrackId } from "./fetchLyricsByTrackId";
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

  const cuesIn = bundle.cuesByTrackId ?? {};
  const offIn = bundle.offsetByTrackId ?? {};

  // Build merged maps but only add keys that are currently unknown.
  let cuesOut = snap.cuesByTrackId;
  let offOut = snap.offsetByTrackId;

  for (const [trackIdRaw, cuesRaw] of Object.entries(cuesIn)) {
    const id = (trackIdRaw ?? "").trim();
    if (!id) continue;

    if (hasOwn(cuesOut, id)) continue; // don't overwrite existing (including [] known-no-lyrics)

    const cues = Array.isArray(cuesRaw) ? cuesRaw : [];
    cuesOut = { ...cuesOut, [id]: cues };
  }

  for (const [trackIdRaw, offRaw] of Object.entries(offIn)) {
    const id = (trackIdRaw ?? "").trim();
    if (!id) continue;

    if (hasOwn(offOut, id)) continue; // don't overwrite existing

    const n =
      typeof offRaw === "number" && Number.isFinite(offRaw)
        ? Math.floor(offRaw)
        : 0;

    offOut = { ...offOut, [id]: n };
  }

  // Only write if something changed (cheap reference check).
  if (cuesOut === snap.cuesByTrackId && offOut === snap.offsetByTrackId) return;

  lyricsSurface.setMaps({
    cuesByTrackId: cuesOut,
    offsetByTrackId: offOut,
    globalOffsetMs: snap.globalOffsetMs,
  });
}

/**
 * Ensure lyrics (cues + offset) exist in lyricsSurface for trackId.
 * - Dedupes concurrent calls (module-level inFlight).
 * - Caches "no lyrics" as [] to avoid refetch loops.
 * - Safe to call repeatedly from any surface.
 */
export async function ensureLyricsForTrack(
  trackId: string,
  opts?: { signal?: AbortSignal },
): Promise<void> {
  const id = (trackId ?? "").trim();
  if (!id) return;

  const snap = lyricsSurface.getSnapshot();
  const existing = snap.cuesByTrackId[id];

  const knownKey = hasOwn(snap.cuesByTrackId, id);
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
    const r = await fetchLyricsByTrackId(id, ac.signal);
    if (!r) return;
    if (r.trackId !== id) return;

    const prev = lyricsSurface.getSnapshot();

    const nextCuesByTrackId =
      Array.isArray(r.cues) && r.cues.length
        ? { ...prev.cuesByTrackId, [id]: r.cues }
        : hasOwn(prev.cuesByTrackId, id)
          ? prev.cuesByTrackId
          : { ...prev.cuesByTrackId, [id]: [] };

    const nextOffsetByTrackId =
      typeof r.offsetMs === "number" && Number.isFinite(r.offsetMs)
        ? { ...prev.offsetByTrackId, [id]: r.offsetMs }
        : prev.offsetByTrackId;

    lyricsSurface.setMaps({
      cuesByTrackId: nextCuesByTrackId,
      offsetByTrackId: nextOffsetByTrackId,
      // preserve whatever globalOffsetMs currently is (lyricsSurface handles defaulting)
      globalOffsetMs: prev.globalOffsetMs,
    });
  } finally {
    inFlight.delete(id);
  }
}
