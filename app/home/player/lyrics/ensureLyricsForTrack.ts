// web/app/home/player/lyrics/ensureLyricsForTrack.ts
"use client";

import { lyricsSurface } from "./lyricsSurface";
import { fetchLyricsByTrackId } from "./fetchLyricsByTrackId";

// Module-scope in-flight map so *any* caller (any surface) dedupes fetches.
const inFlight = new Map<string, AbortController>();

function hasOwn(obj: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
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
  const knownNoLyrics = knownKey && Array.isArray(existing) && existing.length === 0;

  if (hasCues || knownNoLyrics) return;

  // Already fetching?
  if (inFlight.has(id)) return;

  const ac = new AbortController();
  inFlight.set(id, ac);

  // If caller aborts, abort our fetch too.
  const outerSignal = opts?.signal;
  let onAbort: (() => void) | null = null;

  if (outerSignal) {
    if (outerSignal.aborted) {
      inFlight.delete(id);
      ac.abort();
      return;
    }
    onAbort = () => ac.abort();
    outerSignal.addEventListener("abort", onAbort, { once: true });
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
    if (outerSignal && onAbort) outerSignal.removeEventListener("abort", onAbort);
  }
}