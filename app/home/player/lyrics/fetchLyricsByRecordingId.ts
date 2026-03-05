//web/app/home/player/lyrics/fetchLyricsByrecordingId.ts
"use client";

import { parseTrackLyricsApiOk } from "@/lib/types";
import type { LyricCue } from "@/lib/types";

export async function fetchLyricsByrecordingId(
  recordingId: string,
  signal?: AbortSignal,
): Promise<{ recordingId: string; cues: LyricCue[]; offsetMs: number } | null> {
  const res = await fetch(
    `/api/lyrics/by-track?recordingId=${encodeURIComponent(recordingId)}`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) return null;

  const raw: unknown = await res.json();
  const parsed = parseTrackLyricsApiOk(raw);
  if (!parsed) return null;

  return {
    recordingId: parsed.recordingId,
    cues: parsed.cues,
    offsetMs: parsed.offsetMs,
  };
}