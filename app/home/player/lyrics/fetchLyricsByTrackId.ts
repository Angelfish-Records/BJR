"use client";

import { parseTrackLyricsApiOk } from "@/lib/types";
import type { LyricCue } from "@/lib/types";

export async function fetchLyricsByTrackId(
  trackId: string,
  signal?: AbortSignal,
): Promise<{ trackId: string; cues: LyricCue[]; offsetMs: number } | null> {
  const res = await fetch(
    `/api/lyrics/by-track?trackId=${encodeURIComponent(trackId)}`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) return null;

  const raw: unknown = await res.json();
  const parsed = parseTrackLyricsApiOk(raw);
  if (!parsed) return null;

  return {
    trackId: parsed.trackId,
    cues: parsed.cues,
    offsetMs: parsed.offsetMs,
  };
}