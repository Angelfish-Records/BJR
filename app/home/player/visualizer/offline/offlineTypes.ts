// web/app/home/player/visualizer/offline/offlineTypes.ts

import type { AudioFeatures } from "../types";
import type { ThemeName } from "../core/themeRegistry";
import type { CameraFrameState } from "./cinematicTypes";
import type { LyricFrameState } from "./lyricTypes";
import type { LyricStyleName } from "./lyricStyles";
import type { PostPresetName } from "./postStyles";
import type { RenderFormatName } from "./renderFormats";

export type OfflineRenderConfig = {
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  themeName: ThemeName;
  seed: number;
  lyricStyleName?: LyricStyleName;
  postPresetName?: PostPresetName;
  renderFormatName?: RenderFormatName;

  /**
   * Full composition dimensions used to resolve format-aware typography,
   * post-processing, and camera scale.
   *
   * Development previews render smaller buffers but retain the geometry of
   * their intended export dimensions.
   */
  compositionWidth?: number;
  compositionHeight?: number;

  /**
   * Multiplier between the full composition and the current render buffer.
   *
   * Full exports omit this and therefore render at 1:1. Reduced-resolution
   * previews use it to preserve preview/export composition parity.
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
  renderFormatName?: RenderFormatName;
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
