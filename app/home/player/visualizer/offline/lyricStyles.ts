// web/app/home/player/visualizer/offline/lyricStyles.ts
import type { LyricTextStyle } from "./LyricTextRenderer";

export type LyricStyleName =
  | "clean-center"
  | "ghost-lit-devotional"
  | "low-altar"
  | "documentary-white"
  | "red-pressure";

export const LYRIC_STYLE_NAMES: LyricStyleName[] = [
  "clean-center",
  "ghost-lit-devotional",
  "low-altar",
  "documentary-white",
  "red-pressure",
];

const CENTERED_COMPOSITION = {
  align: "center",
  anchorX01: 0.5,
  anchorY01: 0.54,
  backgroundVeilOpacity: 0,
  backgroundVeilMode: "none",
} satisfies Partial<LyricTextStyle>;

export const LYRIC_STYLES: Record<LyricStyleName, Partial<LyricTextStyle>> = {
  "clean-center": {
    ...CENTERED_COMPOSITION,
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 56,
    fontWeight: 600,
    letterSpacingPx: -0.4,
    lineHeight: 1.08,
    maxWidth01: 0.8,

    fill: "rgba(255,255,255,0.96)",
    stroke: "rgba(2,4,8,0.28)",
    strokeWidthPx: 2,

    contrastStroke: "rgba(2,4,8,0.44)",
    contrastStrokeWidthPx: 6,
    contrastShadowBlurPx: 14,
    contrastShadowColor: "rgba(0,0,0,0.78)",

    shadowBlurPx: 16,
    shadowColor: "rgba(255,255,255,0.16)",
    opacity: 0.98,

    previousGhostOpacity: 0.13,
    previousGhostYOffsetEm: -1.18,
    nextEchoOpacity: 0.035,
    nextEchoYOffsetEm: 1.18,

    trailDecay: 0.84,
    trailOpacity: 0.18,
    trailBlurPx: 1.8,

    lineStartScaleImpulse: 0.018,
    lineStartBlurPx: 0.8,
    lineStartShakePx: 0.35,
    revealMode: "line-wipe",
  },

  "ghost-lit-devotional": {
    ...CENTERED_COMPOSITION,
    fontFamily: "Cormorant Garamond, Fraunces, Georgia, Times New Roman, serif",
    fontSizePx: 68,
    fontWeight: 600,
    letterSpacingPx: 0.2,
    lineHeight: 1.04,
    maxWidth01: 0.82,

    fill: "rgba(248,244,232,0.95)",
    stroke: "rgba(28,17,22,0.2)",
    strokeWidthPx: 2,

    contrastStroke: "rgba(18,9,20,0.7)",
    contrastStrokeWidthPx: 9,
    contrastShadowBlurPx: 18,
    contrastShadowColor: "rgba(5,2,10,0.88)",

    shadowBlurPx: 30,
    shadowColor: "rgba(255,226,168,0.38)",
    opacity: 0.97,

    previousGhostOpacity: 0.14,
    previousGhostYOffsetEm: -1.2,
    nextEchoOpacity: 0.04,
    nextEchoYOffsetEm: 1.2,

    trailDecay: 0.86,
    trailOpacity: 0.24,
    trailBlurPx: 2.4,

    lineStartScaleImpulse: 0.02,
    lineStartBlurPx: 1.1,
    lineStartShakePx: 0.35,
    revealMode: "line-wipe",
  },

  "low-altar": {
    ...CENTERED_COMPOSITION,
    fontFamily: "Fraunces, Cormorant Garamond, Georgia, Times New Roman, serif",
    fontSizePx: 62,
    fontWeight: 600,
    letterSpacingPx: 0,
    lineHeight: 1.05,
    maxWidth01: 0.84,

    fill: "rgba(255,244,214,0.95)",
    stroke: "rgba(43,25,10,0.22)",
    strokeWidthPx: 2.5,

    contrastStroke: "rgba(25,13,4,0.7)",
    contrastStrokeWidthPx: 10,
    contrastShadowBlurPx: 17,
    contrastShadowColor: "rgba(8,4,1,0.86)",

    shadowBlurPx: 28,
    shadowColor: "rgba(255,201,100,0.34)",
    opacity: 0.97,

    previousGhostOpacity: 0.15,
    previousGhostYOffsetEm: -1.16,
    nextEchoOpacity: 0.04,
    nextEchoYOffsetEm: 1.16,

    trailDecay: 0.88,
    trailOpacity: 0.26,
    trailBlurPx: 2,

    lineStartScaleImpulse: 0.028,
    lineStartBlurPx: 1,
    lineStartShakePx: 0.45,
    revealMode: "line-wipe",
  },

  "documentary-white": {
    ...CENTERED_COMPOSITION,
    fontFamily: "Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 52,
    fontWeight: 600,
    letterSpacingPx: -0.25,
    lineHeight: 1.08,
    maxWidth01: 0.78,

    fill: "rgba(255,255,255,0.95)",
    stroke: "rgba(0,0,0,0.34)",
    strokeWidthPx: 1.75,

    contrastStroke: "rgba(0,0,0,0.72)",
    contrastStrokeWidthPx: 7,
    contrastShadowBlurPx: 10,
    contrastShadowColor: "rgba(0,0,0,0.82)",

    shadowBlurPx: 4,
    shadowColor: "rgba(0,0,0,0.38)",
    opacity: 0.97,

    previousGhostOpacity: 0.08,
    previousGhostYOffsetEm: -1.12,
    nextEchoOpacity: 0.025,
    nextEchoYOffsetEm: 1.12,

    trailDecay: 0.8,
    trailOpacity: 0.1,
    trailBlurPx: 1,

    lineStartScaleImpulse: 0.008,
    lineStartBlurPx: 0.25,
    lineStartShakePx: 0,
    revealMode: "none",
  },

  "red-pressure": {
    ...CENTERED_COMPOSITION,
    fontFamily:
      "Archivo Black, Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 58,
    fontWeight: 400,
    letterSpacingPx: 0.2,
    lineHeight: 1.02,
    maxWidth01: 0.78,

    fill: "rgba(255,226,216,0.97)",
    stroke: "rgba(92,4,2,0.48)",
    strokeWidthPx: 2.5,

    contrastStroke: "rgba(48,0,3,0.8)",
    contrastStrokeWidthPx: 11,
    contrastShadowBlurPx: 16,
    contrastShadowColor: "rgba(22,0,3,0.9)",

    shadowBlurPx: 24,
    shadowColor: "rgba(255,50,28,0.4)",
    opacity: 0.98,

    previousGhostOpacity: 0.12,
    previousGhostYOffsetEm: -1.1,
    nextEchoOpacity: 0.03,
    nextEchoYOffsetEm: 1.1,

    trailDecay: 0.84,
    trailOpacity: 0.22,
    trailBlurPx: 1.8,

    lineStartScaleImpulse: 0.03,
    lineStartBlurPx: 0.8,
    lineStartShakePx: 0.65,
    revealMode: "line-wipe",
  },
};

export function isLyricStyleName(value: string): value is LyricStyleName {
  return LYRIC_STYLE_NAMES.includes(value as LyricStyleName);
}
