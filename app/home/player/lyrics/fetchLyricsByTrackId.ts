"use client";

import type { LyricCue } from "@/app/home/player/stage/LyricsOverlay";

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

  if (!raw || typeof raw !== "object") return null;
  if (!("ok" in raw) || (raw as { ok?: unknown }).ok !== true) return null;
  if (
    !("trackId" in raw) ||
    typeof (raw as { trackId?: unknown }).trackId !== "string"
  )
    return null;
  if (!("cues" in raw) || !Array.isArray((raw as { cues?: unknown }).cues))
    return null;
  if (
    !("offsetMs" in raw) ||
    typeof (raw as { offsetMs?: unknown }).offsetMs !== "number" ||
    !Number.isFinite((raw as { offsetMs?: unknown }).offsetMs as number)
  )
    return null;

  const obj = raw as {
    trackId: string;
    cues: unknown[];
    offsetMs: number;
  };

  const cues: LyricCue[] = obj.cues
    .map((c): LyricCue | null => {
      if (!c || typeof c !== "object") return null;

      const lineKey = (c as { lineKey?: unknown }).lineKey;
      const tMs = (c as { tMs?: unknown }).tMs;
      const text = (c as { text?: unknown }).text;
      const endMs = (c as { endMs?: unknown }).endMs;

      if (typeof lineKey !== "string" || lineKey.trim().length === 0)
        return null;
      if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0)
        return null;
      if (typeof text !== "string" || text.trim().length === 0) return null;

      const out: LyricCue = {
        lineKey: lineKey.trim(),
        tMs: Math.floor(tMs),
        text: text.trim(),
      };
      if (typeof endMs === "number" && Number.isFinite(endMs) && endMs >= 0) {
        out.endMs = Math.floor(endMs);
      }
      return out;
    })
    .filter((x): x is LyricCue => x !== null);

  return {
    trackId: obj.trackId,
    cues,
    offsetMs: Math.floor(obj.offsetMs),
  };
}