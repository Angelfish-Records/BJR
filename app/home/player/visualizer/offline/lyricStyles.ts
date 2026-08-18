// web/app/home/player/visualizer/offline/lyricStyles.ts
import type { LyricTextStyle } from "./LyricTextRenderer";

export type LyricStyleName =
  | "clean-center"
  | "ghost-lit-devotional"
  | "low-altar"
  | "documentary-white"
  | "red-pressure"
  | "glass-house"
  | "nocturne-editorial";

export const LYRIC_STYLE_NAMES: LyricStyleName[] = [
  "clean-center",
  "ghost-lit-devotional",
  "low-altar",
  "documentary-white",
  "red-pressure",
  "glass-house",
  "nocturne-editorial",
];

const CENTERED_COMPOSITION = {
  align: "center",
  anchorX01: 0.5,
  anchorY01: 0.54,
  backgroundVeilOpacity: 0,
  backgroundVeilMode: "none",
} satisfies Partial<LyricTextStyle>;

const EDITORIAL_LEFT_COMPOSITION = {
  align: "left",
  anchorX01: 0.12,
  anchorY01: 0.62,
  backgroundVeilOpacity: 0,
  backgroundVeilMode: "none",
} satisfies Partial<LyricTextStyle>;

export const LYRIC_STYLES: Record<LyricStyleName, Partial<LyricTextStyle>> = {
  "clean-center": {
    ...CENTERED_COMPOSITION,
    fontFamily: "Satoshi, Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 56,
    fontWeight: 500,
    letterSpacingPx: -0.65,
    lineHeight: 1.02,
    maxWidth01: 0.72,

    fill: "rgba(255,255,255,0.992)",
    stroke: "rgba(0,0,0,0.32)",
    strokeWidthPx: 1,

    contrastStroke: "rgba(0,0,0,0.56)",
    contrastStrokeWidthPx: 4,
    contrastShadowBlurPx: 5,
    contrastShadowColor: "rgba(0,0,0,0.68)",

    shadowBlurPx: 2.5,
    shadowColor: "rgba(0,0,0,0.26)",
    opacity: 0.995,

    previousGhostOpacity: 0.11,
    previousGhostYOffsetEm: -1.3,
    nextEchoOpacity: 0.012,
    nextEchoYOffsetEm: 1.3,

    trailDecay: 0.68,
    trailOpacity: 0.012,
    trailBlurPx: 0.45,

    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  },

  "ghost-lit-devotional": {
    ...CENTERED_COMPOSITION,
    anchorY01: 0.5,
    fontFamily: "Newsreader, Cormorant Garamond, Georgia, Times New Roman, serif",
    fontSizePx: 72,
    fontWeight: 400,
    letterSpacingPx: 0.12,
    lineHeight: 0.98,
    maxWidth01: 0.7,

    fill: "rgba(251,248,239,0.992)",
    stroke: "rgba(18,13,16,0.28)",
    strokeWidthPx: 0.9,

    contrastStroke: "rgba(8,5,9,0.58)",
    contrastStrokeWidthPx: 4.8,
    contrastShadowBlurPx: 6,
    contrastShadowColor: "rgba(0,0,0,0.72)",

    shadowBlurPx: 4,
    shadowColor: "rgba(232,207,164,0.09)",
    opacity: 0.995,

    previousGhostOpacity: 0.09,
    previousGhostYOffsetEm: -1.27,
    nextEchoOpacity: 0.01,
    nextEchoYOffsetEm: 1.27,

    trailDecay: 0.72,
    trailOpacity: 0.022,
    trailBlurPx: 0.65,

    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  },

  "low-altar": {
    ...CENTERED_COMPOSITION,
    anchorY01: 0.65,
    fontFamily: "Instrument Serif, Newsreader, Georgia, Times New Roman, serif",
    fontSizePx: 74,
    fontWeight: 400,
    letterSpacingPx: -0.05,
    lineHeight: 0.94,
    maxWidth01: 0.68,

    fill: "rgba(255,248,229,0.994)",
    stroke: "rgba(34,23,12,0.26)",
    strokeWidthPx: 0.9,

    contrastStroke: "rgba(17,11,5,0.58)",
    contrastStrokeWidthPx: 4.8,
    contrastShadowBlurPx: 6,
    contrastShadowColor: "rgba(3,2,0,0.72)",

    shadowBlurPx: 3.5,
    shadowColor: "rgba(222,181,102,0.08)",
    opacity: 0.995,

    previousGhostOpacity: 0.08,
    previousGhostYOffsetEm: -1.24,
    nextEchoOpacity: 0.008,
    nextEchoYOffsetEm: 1.24,

    trailDecay: 0.7,
    trailOpacity: 0.014,
    trailBlurPx: 0.55,

    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  },

  "documentary-white": {
    ...CENTERED_COMPOSITION,
    fontFamily: "Space Grotesk, Satoshi, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 52,
    fontWeight: 600,
    letterSpacingPx: -0.2,
    lineHeight: 1.06,
    maxWidth01: 0.74,

    fill: "rgba(255,255,255,0.985)",
    stroke: "rgba(0,0,0,0.42)",
    strokeWidthPx: 1,

    contrastStroke: "rgba(0,0,0,0.68)",
    contrastStrokeWidthPx: 4.5,
    contrastShadowBlurPx: 6,
    contrastShadowColor: "rgba(0,0,0,0.78)",

    shadowBlurPx: 2.5,
    shadowColor: "rgba(0,0,0,0.42)",
    opacity: 0.99,

    previousGhostOpacity: 0.1,
    previousGhostYOffsetEm: -1.24,
    nextEchoOpacity: 0.012,
    nextEchoYOffsetEm: 1.24,

    trailDecay: 0.7,
    trailOpacity: 0.018,
    trailBlurPx: 0.6,

    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  },

  "red-pressure": {
    ...CENTERED_COMPOSITION,
    anchorY01: 0.5,
    fontFamily:
      "Barlow Condensed, Satoshi, Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 66,
    fontWeight: 600,
    letterSpacingPx: 0.42,
    lineHeight: 0.9,
    maxWidth01: 0.66,

    fill: "rgba(255,248,246,0.995)",
    stroke: "rgba(83,1,6,0.42)",
    strokeWidthPx: 1,

    contrastStroke: "rgba(35,0,3,0.7)",
    contrastStrokeWidthPx: 5.5,
    contrastShadowBlurPx: 5,
    contrastShadowColor: "rgba(12,0,2,0.8)",

    shadowBlurPx: 4,
    shadowColor: "rgba(220,22,28,0.11)",
    opacity: 0.995,

    previousGhostOpacity: 0.08,
    previousGhostYOffsetEm: -1.18,
    nextEchoOpacity: 0.008,
    nextEchoYOffsetEm: 1.18,

    trailDecay: 0.68,
    trailOpacity: 0.016,
    trailBlurPx: 0.5,

    lineStartScaleImpulse: 0.002,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "line-wipe",
  },

  "glass-house": {
    ...CENTERED_COMPOSITION,
    anchorY01: 0.46,
    fontFamily: "Clash Grotesk, Satoshi, Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizePx: 60,
    fontWeight: 500,
    letterSpacingPx: -0.82,
    lineHeight: 0.98,
    maxWidth01: 0.68,

    fill: "rgba(252,253,255,0.995)",
    stroke: "rgba(0,0,0,0.24)",
    strokeWidthPx: 0.75,

    contrastStroke: "rgba(0,0,0,0.5)",
    contrastStrokeWidthPx: 3.6,
    contrastShadowBlurPx: 4,
    contrastShadowColor: "rgba(0,0,0,0.62)",

    shadowBlurPx: 1.5,
    shadowColor: "rgba(190,210,225,0.08)",
    opacity: 0.995,

    previousGhostOpacity: 0.075,
    previousGhostYOffsetEm: -1.32,
    nextEchoOpacity: 0.006,
    nextEchoYOffsetEm: 1.32,

    trailDecay: 0.64,
    trailOpacity: 0.008,
    trailBlurPx: 0.35,

    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  },

  "nocturne-editorial": {
    ...EDITORIAL_LEFT_COMPOSITION,
    fontFamily: "Gambetta, Newsreader, Georgia, Times New Roman, serif",
    fontSizePx: 60,
    fontWeight: 500,
    letterSpacingPx: 0.08,
    lineHeight: 1.02,
    maxWidth01: 0.58,
    minimumFontScale: 0.76,

    fill: "rgba(250,245,234,0.992)",
    stroke: "rgba(11,8,7,0.3)",
    strokeWidthPx: 0.9,

    contrastStroke: "rgba(5,4,4,0.6)",
    contrastStrokeWidthPx: 4.6,
    contrastShadowBlurPx: 5,
    contrastShadowColor: "rgba(0,0,0,0.72)",

    shadowBlurPx: 2,
    shadowColor: "rgba(0,0,0,0.24)",
    opacity: 0.995,

    previousGhostOpacity: 0.085,
    previousGhostYOffsetEm: -1.2,
    nextEchoOpacity: 0.005,
    nextEchoYOffsetEm: 1.2,

    trailDecay: 0.66,
    trailOpacity: 0.01,
    trailBlurPx: 0.4,

    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  },
};

export function isLyricStyleName(value: string): value is LyricStyleName {
  return LYRIC_STYLE_NAMES.includes(value as LyricStyleName);
}
