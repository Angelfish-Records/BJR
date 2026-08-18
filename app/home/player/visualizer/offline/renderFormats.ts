// web/app/home/player/visualizer/offline/renderFormats.ts

import type { LyricTextStyle } from "./LyricTextRenderer";

export type RenderFormatName =
  | "landscape-16:9"
  | "vertical-9:16"
  | "square-1:1";

export type RenderFormatProfile = {
  label: string;
  width: number;
  height: number;
  typographyMultiplier: number;
  effectMultiplier: number;
  cameraMultiplier: number;
  lyricAnchorY01?: number;
  lyricMaxWidthMultiplier: number;
  lyricLineHeightMultiplier: number;
  lyricMaxLines: number;
};

export type RenderFormatGeometry = {
  lyricPixelScale: number;
  effectPixelScale: number;
  cameraPixelScale: number;
  lyricAnchorY01?: number;
  lyricMaxWidthMultiplier: number;
  lyricLineHeightMultiplier: number;
  lyricMaxLines: number;
};

export const RENDER_FORMAT_NAMES: RenderFormatName[] = [
  "landscape-16:9",
  "vertical-9:16",
  "square-1:1",
];

export const RENDER_FORMATS: Record<
  RenderFormatName,
  RenderFormatProfile
> = {
  "landscape-16:9": {
    label: "Landscape 16:9 · 1280×720",
    width: 1280,
    height: 720,
    typographyMultiplier: 1,
    effectMultiplier: 1,
    cameraMultiplier: 1,
    lyricMaxWidthMultiplier: 1,
    lyricLineHeightMultiplier: 1,
    lyricMaxLines: 3,
  },

  "vertical-9:16": {
    label: "Vertical 9:16 · 1080×1920",
    width: 1080,
    height: 1920,
    typographyMultiplier: 1.15,
    effectMultiplier: 1,
    cameraMultiplier: 1,
    lyricAnchorY01: 0.48,
    lyricMaxWidthMultiplier: 1.08,
    lyricLineHeightMultiplier: 0.96,
    lyricMaxLines: 4,
  },

  "square-1:1": {
    label: "Square 1:1 · 1080×1080",
    width: 1080,
    height: 1080,
    typographyMultiplier: 1.05,
    effectMultiplier: 1,
    cameraMultiplier: 1,
    lyricAnchorY01: 0.52,
    lyricMaxWidthMultiplier: 1.04,
    lyricLineHeightMultiplier: 0.98,
    lyricMaxLines: 3,
  },
};

const BASE_SHORT_EDGE_PX = 720;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function isRenderFormatName(
  value: string,
): value is RenderFormatName {
  return RENDER_FORMAT_NAMES.includes(value as RenderFormatName);
}

export function inferRenderFormatName(
  width: number,
  height: number,
): RenderFormatName {
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  const aspectRatio = safeWidth / safeHeight;

  if (aspectRatio >= 1.2) return "landscape-16:9";
  if (aspectRatio <= 0.84) return "vertical-9:16";

  return "square-1:1";
}

export function getRenderFormatGeometry(
  formatName: RenderFormatName,
  width: number,
  height: number,
): RenderFormatGeometry {
  const profile = RENDER_FORMATS[formatName];
  const shortEdgePx = Math.max(1, Math.min(width, height));
  const shortEdgeScale = clamp(
    shortEdgePx / BASE_SHORT_EDGE_PX,
    0.5,
    4,
  );

  return {
    lyricPixelScale:
      shortEdgeScale * profile.typographyMultiplier,
    effectPixelScale:
      shortEdgeScale * profile.effectMultiplier,
    cameraPixelScale:
      shortEdgeScale * profile.cameraMultiplier,
    lyricAnchorY01: profile.lyricAnchorY01,
    lyricMaxWidthMultiplier: profile.lyricMaxWidthMultiplier,
    lyricLineHeightMultiplier: profile.lyricLineHeightMultiplier,
    lyricMaxLines: profile.lyricMaxLines,
  };
}

export function applyRenderFormatToLyricStyle(
  style: Partial<LyricTextStyle> | undefined,
  geometry: RenderFormatGeometry,
): Partial<LyricTextStyle> | undefined {
  if (!style) return undefined;

  return {
    ...style,
    ...(geometry.lyricAnchorY01 !== undefined
      ? { anchorY01: geometry.lyricAnchorY01 }
      : {}),
    ...(style.maxWidth01 !== undefined
      ? {
          maxWidth01: Math.min(
            0.92,
            style.maxWidth01 * geometry.lyricMaxWidthMultiplier,
          ),
        }
      : {}),
    ...(style.lineHeight !== undefined
      ? {
          lineHeight:
            style.lineHeight * geometry.lyricLineHeightMultiplier,
        }
      : {}),
    maxLines: geometry.lyricMaxLines,
  };
}