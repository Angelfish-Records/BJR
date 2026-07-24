// web/app/home/player/visualizer/offline/offlineTypes.ts

import type { AudioFeatures } from "../types";
import type { ThemeName } from "../core/themeRegistry";
import type { CameraFrameState } from "./cinematicTypes";
import type { LyricFrameState } from "./lyricTypes";
import type { LyricStyleName } from "./lyricStyles";
import type { PostPresetName } from "./postStyles";

export type OfflineRenderConfig = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  themeName: ThemeName;
  seed: number;
  lyricStyleName?: LyricStyleName;
  postPresetName?: PostPresetName;

  /**
   * Optional multiplier for pixel-sized composition values.
   *
   * Offline exports omit this and therefore render at 1:1. Lower-resolution
   * development previews use it to preserve the relative size of typography,
   * glow, blur, stroke, and camera shake.
   */
  pixelScale?: number;
};

export type AudioFeatureFrame = Required<AudioFeatures> & {
  frameIndex: number;
  time: number;
};

export type OfflineFrame = {
  frameIndex: number;
  time: number;
  audio: AudioFeatureFrame;
  lyric?: LyricFrameState;
  camera?: CameraFrameState;
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
  lrcSource?: string;
  lyricTimeline?: string;
  outputDir: string;
  framePattern: string;
};
