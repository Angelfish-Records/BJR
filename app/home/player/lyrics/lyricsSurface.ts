// web/app/home/player/lyrics/lyricsSurface.ts
"use client";

import type { LyricCue } from "@/lib/types";

export type CuesByrecordingId = Record<string, LyricCue[]>;
export type OffsetByrecordingId = Record<string, number>;

type Snapshot = {
  cuesByRecordingId: CuesByrecordingId;
  offsetByRecordingId: OffsetByrecordingId;
  globalOffsetMs: number;
};

type Listener = () => void;

let snap: Snapshot = {
  cuesByRecordingId: {},
  offsetByRecordingId: {},
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
    cuesByrecordingId?: CuesByrecordingId | null;
    offsetByrecordingId?: OffsetByrecordingId | null;
    globalOffsetMs?: number | null;
  }) {
    const cuesByRecordingId = next.cuesByrecordingId ?? {};
    const offsetByRecordingId = next.offsetByrecordingId ?? {};
    const globalOffsetMs =
      typeof next.globalOffsetMs === "number" && Number.isFinite(next.globalOffsetMs)
        ? next.globalOffsetMs
        : 0;

    // cheap identity guard: only emit if something actually changes by reference/value
    const changed =
      snap.cuesByRecordingId !== cuesByRecordingId ||
      snap.offsetByRecordingId !== offsetByRecordingId ||
      snap.globalOffsetMs !== globalOffsetMs;

    if (!changed) return;

    snap = { cuesByRecordingId, offsetByRecordingId, globalOffsetMs };
    emit();
  },
};