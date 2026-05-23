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

export const LYRIC_STYLES: Record<LyricStyleName, Partial<LyricTextStyle>> = {
  "clean-center": {
    fontSizePx: 42,
    fontWeight: 700,
    anchorX01: 0.5,
    anchorY01: 0.74,
    maxWidth01: 0.76,
    fill: "rgba(255,255,255,0.94)",
    stroke: "rgba(0,0,0,0.48)",
    strokeWidthPx: 5,
    shadowBlurPx: 18,
    shadowColor: "rgba(255,255,255,0.22)",
    opacity: 1,
    previousGhostOpacity: 0.2,
    nextEchoOpacity: 0.06,
  },

  "ghost-lit-devotional": {
    fontSizePx: 44,
    fontWeight: 650,
    letterSpacingPx: 0.5,
    anchorX01: 0.5,
    anchorY01: 0.7,
    maxWidth01: 0.72,
    fill: "rgba(248,244,232,0.9)",
    stroke: "rgba(20,12,8,0.42)",
    strokeWidthPx: 6,
    shadowBlurPx: 34,
    shadowColor: "rgba(255,226,168,0.42)",
    opacity: 0.94,
    previousGhostOpacity: 0.2,
    nextEchoOpacity: 0.06,
  },

  "low-altar": {
    fontSizePx: 38,
    fontWeight: 700,
    letterSpacingPx: 0.2,
    anchorX01: 0.5,
    anchorY01: 0.82,
    maxWidth01: 0.8,
    fill: "rgba(255,246,220,0.92)",
    stroke: "rgba(0,0,0,0.62)",
    strokeWidthPx: 6,
    shadowBlurPx: 26,
    shadowColor: "rgba(255,212,120,0.34)",
    opacity: 0.96,
    previousGhostOpacity: 0.2,
    nextEchoOpacity: 0.06,
    trailDecay: 0.9,
    trailOpacity: 0.35,
    trailBlurPx: 1.4,
    lineStartScaleImpulse: 0.05,
    lineStartBlurPx: 2,
    lineStartShakePx: 2,
    revealMode: "line-wipe",
    backgroundVeilOpacity: 0.12,
    backgroundVeilRadiusPx: 18,
  },

  "documentary-white": {
    fontSizePx: 36,
    fontWeight: 600,
    letterSpacingPx: 0,
    anchorX01: 0.5,
    anchorY01: 0.78,
    maxWidth01: 0.68,
    fill: "rgba(255,255,255,0.88)",
    stroke: "rgba(0,0,0,0.72)",
    strokeWidthPx: 4,
    shadowBlurPx: 8,
    shadowColor: "rgba(0,0,0,0.48)",
    opacity: 0.92,
    previousGhostOpacity: 0.2,
    nextEchoOpacity: 0.06,
  },

  "red-pressure": {
    fontSizePx: 46,
    fontWeight: 800,
    letterSpacingPx: 0.8,
    anchorX01: 0.5,
    anchorY01: 0.72,
    maxWidth01: 0.74,
    fill: "rgba(255,232,222,0.94)",
    stroke: "rgba(70,0,0,0.62)",
    strokeWidthPx: 7,
    shadowBlurPx: 30,
    shadowColor: "rgba(255,64,36,0.44)",
    opacity: 0.96,
    previousGhostOpacity: 0.2,
    nextEchoOpacity: 0.06,
  },
};

export function isLyricStyleName(value: string): value is LyricStyleName {
  return LYRIC_STYLE_NAMES.includes(value as LyricStyleName);
}
