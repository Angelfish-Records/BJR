// web/app/home/player/visualizer/offline/offlineTypes.ts

import type { AudioFeatures } from "../types";
import type { ThemeName } from "../core/themeRegistry";

export type OfflineRenderConfig = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  themeName: ThemeName;
  seed: number;
};

export type AudioFeatureFrame = Required<AudioFeatures> & {
  frameIndex: number;
  time: number;
};

export type OfflineFrame = {
  frameIndex: number;
  time: number;
  audio: AudioFeatureFrame;
};

export type VisualizerExportManifest = {
  version: 1;
  recordingId: string;
  themeName: ThemeName;
  seed: number;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  audioSource: string;
  outputDir: string;
  framePattern: string;
};