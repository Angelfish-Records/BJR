// web/app/home/player/visualizer/offline/postStyles.ts
export type PostPresetName =
  | "none"
  | "gold-devotional"
  | "red-pressure"
  | "monochrome-ghost"
  | "bleached-memory";

export type PostProcessStyle = {
  bloomStrength: number;
  bloomBlurPx: number;
  bloomThreshold: number;
  exposure: number;
  contrast: number;
  saturation: number;
  vignette: number;
  grain: number;
};

export const POST_PRESET_NAMES: PostPresetName[] = [
  "none",
  "gold-devotional",
  "red-pressure",
  "monochrome-ghost",
  "bleached-memory",
];

export const POST_STYLES: Record<PostPresetName, PostProcessStyle> = {
  none: {
    bloomStrength: 0,
    bloomBlurPx: 0,
    bloomThreshold: 1,
    exposure: 1,
    contrast: 1,
    saturation: 1,
    vignette: 0,
    grain: 0,
  },
  "gold-devotional": {
    bloomStrength: 0.34,
    bloomBlurPx: 18,
    bloomThreshold: 0.54,
    exposure: 1.05,
    contrast: 1.08,
    saturation: 1.08,
    vignette: 0.22,
    grain: 0.035,
  },
  "red-pressure": {
    bloomStrength: 0.28,
    bloomBlurPx: 14,
    bloomThreshold: 0.48,
    exposure: 1.03,
    contrast: 1.18,
    saturation: 1.2,
    vignette: 0.28,
    grain: 0.045,
  },
  "monochrome-ghost": {
    bloomStrength: 0.4,
    bloomBlurPx: 22,
    bloomThreshold: 0.42,
    exposure: 1.02,
    contrast: 1.12,
    saturation: 0,
    vignette: 0.34,
    grain: 0.055,
  },
  "bleached-memory": {
    bloomStrength: 0.22,
    bloomBlurPx: 20,
    bloomThreshold: 0.6,
    exposure: 1.12,
    contrast: 0.92,
    saturation: 0.72,
    vignette: 0.18,
    grain: 0.04,
  },
};

export function isPostPresetName(value: string): value is PostPresetName {
  return POST_PRESET_NAMES.includes(value as PostPresetName);
}