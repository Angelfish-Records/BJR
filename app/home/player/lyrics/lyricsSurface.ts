// web/app/home/player/lyrics/lyricsSurface.ts
"use client";

import type { LyricCue } from "@/lib/types";

export type CuesByTrackId = Record<string, LyricCue[]>;
export type OffsetByTrackId = Record<string, number>;

type Snapshot = {
  cuesByTrackId: CuesByTrackId;
  offsetByTrackId: OffsetByTrackId;
  globalOffsetMs: number;
};

type Listener = () => void;

let snap: Snapshot = {
  cuesByTrackId: {},
  offsetByTrackId: {},
  globalOffsetMs: 0,
};

const listeners = new Set<Listener>();

function emit() {
  for (const fn of listeners) fn();
}

export const lyricsSurface = {
  getSnapshot(): Snapshot {
    return snap;
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  setMaps(next: {
    cuesByTrackId?: CuesByTrackId | null;
    offsetByTrackId?: OffsetByTrackId | null;
    globalOffsetMs?: number | null;
  }) {
    const cuesByTrackId = next.cuesByTrackId ?? {};
    const offsetByTrackId = next.offsetByTrackId ?? {};
    const globalOffsetMs =
      typeof next.globalOffsetMs === "number" && Number.isFinite(next.globalOffsetMs)
        ? next.globalOffsetMs
        : 0;

    // cheap identity guard: only emit if something actually changes by reference/value
    const changed =
      snap.cuesByTrackId !== cuesByTrackId ||
      snap.offsetByTrackId !== offsetByTrackId ||
      snap.globalOffsetMs !== globalOffsetMs;

    if (!changed) return;

    snap = { cuesByTrackId, offsetByTrackId, globalOffsetMs };
    emit();
  },
};