// web/app/home/player/audioSurface.ts
"use client";

import type { AudioFeatures } from "./visualizer/types";

type AudioKey = keyof Required<AudioFeatures>;

const AUDIO_KEYS: AudioKey[] = [
  "energy",
  "rms",
  "bass",
  "mid",
  "treble",
  "centroid",
];

class AudioSurface {
  private features: Required<AudioFeatures> = {
    energy: 0,
    rms: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    centroid: 0,
  };

  set(next: Partial<AudioFeatures>) {
    for (const k of AUDIO_KEYS) {
      const v = next[k];
      if (typeof v === "number" && Number.isFinite(v)) {
        this.features[k] = v;
      }
    }
  }

  get(): Required<AudioFeatures> {
    return this.features;
  }
}

export const audioSurface = new AudioSurface();
