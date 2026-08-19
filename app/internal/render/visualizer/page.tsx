// web/app/internal/render/visualizer/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import VisualizerLivePreview from "./VisualizerLivePreview";
import { FramePostProcessor } from "../../../home/player/visualizer/offline/FramePostProcessor";
import { PromoImageRenderer } from "../../../home/player/visualizer/offline/PromoImageRenderer";
import {
  LyricTextRenderer,
  type LyricTextStyle,
} from "../../../home/player/visualizer/offline/LyricTextRenderer";
import {
  applyRenderFormatToLyricStyle,
  getRenderFormatGeometry,
  inferRenderFormatName,
  RENDER_FORMAT_NAMES,
  RENDER_FORMATS,
  type RenderFormatGeometry,
  type RenderFormatName,
} from "../../../home/player/visualizer/offline/renderFormats";
import {
  LYRIC_STYLE_NAMES,
  LYRIC_STYLES,
  type LyricStyleName,
} from "../../../home/player/visualizer/offline/lyricStyles";
import {
  applyLyricDirectionToStyle,
  directedLyricStyleName,
} from "../../../home/player/visualizer/offline/lyricDirections";
import type { LyricFrameState } from "../../../home/player/visualizer/offline/lyricTypes";
import type { TextRenderMode } from "../../../home/player/visualizer/offline/textTimeline";
import {
  POST_PRESET_NAMES,
  POST_STYLES,
  type PostPresetName,
  type PostProcessStyle,
} from "../../../home/player/visualizer/offline/postStyles";
import { OfflineVisualizerRenderer } from "../../../home/player/visualizer/offline/OfflineVisualizerRenderer";
import type {
  AudioFeatureFrame,
  OfflineFrame,
  OfflineRenderConfig,
} from "../../../home/player/visualizer/offline/offlineTypes";

import { bakeAudioFeatureFrames } from "../../../home/player/visualizer/offline/audioFeatureBake";

type RendererStatus = "idle" | "ready" | "disposed" | "error";

type AfrRendererApi = {
  init: (config: OfflineRenderConfig) => Promise<void>;
  renderFrame: (
    frame: OfflineFrame,
    opts?: { presentToScreen?: boolean },
  ) => void;
  readFrame: () => Uint8Array;
  dispose: () => void;
  status: () => RendererStatus;
  bakeAudioFeatures: (
    audioUrl: string,
    fps: number,
  ) => Promise<AudioFeatureFrame[]>;
};

type AudioFileOption = {
  file: string;
  url: string;
  path: string;
};

type RenderControllerOptions = {
  themes: string[];
  audioFiles: AudioFileOption[];
  lrcFiles: AudioFileOption[];
  lyricDirectionFiles: AudioFileOption[];
  imageFiles: AudioFileOption[];
};

type LyricStyleRuntime = {
  baseStyleName: LyricStyleName;
  formatGeometry: RenderFormatGeometry;
  lyricPixelScale: number;
  textMode: TextRenderMode;
};

type RenderResponse =
  | {
      ok: true;
      manifestPath: string;
      outputDir: string;
      stdout: string;
      stderr: string;
    }
  | {
      ok: false;
      error: string;
    };

declare global {
  interface Window {
    __AFR_RENDERER__?: AfrRendererApi;
  }
}

function scaleLyricStyle(
  style: Partial<LyricTextStyle> | undefined,
  pixelScale: number,
): Partial<LyricTextStyle> | undefined {
  if (!style || pixelScale === 1) return style;

  return {
    ...style,
    ...(style.fontSizePx !== undefined
      ? { fontSizePx: style.fontSizePx * pixelScale }
      : {}),
    ...(style.letterSpacingPx !== undefined
      ? { letterSpacingPx: style.letterSpacingPx * pixelScale }
      : {}),
    ...(style.strokeWidthPx !== undefined
      ? { strokeWidthPx: style.strokeWidthPx * pixelScale }
      : {}),
    ...(style.contrastStrokeWidthPx !== undefined
      ? {
          contrastStrokeWidthPx: style.contrastStrokeWidthPx * pixelScale,
        }
      : {}),
    ...(style.contrastShadowBlurPx !== undefined
      ? {
          contrastShadowBlurPx: style.contrastShadowBlurPx * pixelScale,
        }
      : {}),
    ...(style.shadowBlurPx !== undefined
      ? { shadowBlurPx: style.shadowBlurPx * pixelScale }
      : {}),
    ...(style.trailBlurPx !== undefined
      ? { trailBlurPx: style.trailBlurPx * pixelScale }
      : {}),
    ...(style.lineStartBlurPx !== undefined
      ? { lineStartBlurPx: style.lineStartBlurPx * pixelScale }
      : {}),
    ...(style.lineStartShakePx !== undefined
      ? { lineStartShakePx: style.lineStartShakePx * pixelScale }
      : {}),
    ...(style.backgroundVeilRadiusPx !== undefined
      ? {
          backgroundVeilRadiusPx: style.backgroundVeilRadiusPx * pixelScale,
        }
      : {}),
  };
}

function scalePostStyle(
  style: PostProcessStyle,
  pixelScale: number,
): PostProcessStyle {
  if (pixelScale === 1) return style;

  return {
    ...style,
    bloomBlurPx: style.bloomBlurPx * pixelScale,
  };
}

function promoFooterAnchorY01(
  portraitComposition: boolean,
  hasArtwork: boolean,
): number {
  if (!portraitComposition) return 0.9;
  return hasArtwork ? 0.875 : 0.82;
}

function derivePromoPrimaryStyle(
  lyricStyle: Partial<LyricTextStyle> | undefined,
  portraitComposition: boolean,
  hasArtwork: boolean,
): Partial<LyricTextStyle> | undefined {
  if (!lyricStyle || !portraitComposition || !hasArtwork) {
    return lyricStyle;
  }

  return {
    ...lyricStyle,
    anchorY01: 0.405,
    maxLines: 4,
    minimumFontScale: 0.62,
    fitRegionTop01: 0.24,
    fitRegionBottom01: 0.47,
  };
}

function primaryFontFamily(fontFamily: string): string {
  return fontFamily.split(",")[0]?.trim().replace(/^["']|["']$/g, "") ?? "";
}

async function ensureRenderFontsReady(): Promise<void> {
  if (!("fonts" in document)) {
    throw new Error("FontFaceSet is unavailable; deterministic text rendering cannot continue");
  }

  const requirements = new Map<string, { family: string; weight: number }>();

  for (const style of Object.values(LYRIC_STYLES)) {
    const family = style.fontFamily ? primaryFontFamily(style.fontFamily) : "";
    const weight = style.fontWeight ?? 400;
    if (!family) continue;
    requirements.set(`${family}:${weight}`, { family, weight });
  }

  const probeText = "Brendan John Roch — typography 0123456789";
  const missing: string[] = [];

  for (const requirement of requirements.values()) {
    const family = JSON.stringify(requirement.family);
    const descriptor = `${requirement.weight} 64px ${family}`;
    const faces = await document.fonts.load(descriptor, probeText);

    if (faces.length === 0 || !document.fonts.check(descriptor, probeText)) {
      missing.push(`${requirement.family} ${requirement.weight}`);
    }
  }

  await document.fonts.ready;

  if (missing.length > 0) {
    throw new Error(
      `Required offline render fonts failed to load: ${missing.join(", ")}`,
    );
  }
}

function derivePromoFooterStyle(
  lyricStyle: Partial<LyricTextStyle> | undefined,
  portraitComposition: boolean,
  hasArtwork: boolean,
): Partial<LyricTextStyle> | undefined {
  if (!lyricStyle) return undefined;

  return {
    ...lyricStyle,
    ...(lyricStyle.fontSizePx !== undefined
      ? { fontSizePx: lyricStyle.fontSizePx * 0.82 }
      : {}),
    ...(lyricStyle.letterSpacingPx !== undefined
      ? { letterSpacingPx: lyricStyle.letterSpacingPx * 0.86 }
      : {}),
    ...(lyricStyle.strokeWidthPx !== undefined
      ? { strokeWidthPx: lyricStyle.strokeWidthPx * 0.78 }
      : {}),
    ...(lyricStyle.contrastStrokeWidthPx !== undefined
      ? { contrastStrokeWidthPx: lyricStyle.contrastStrokeWidthPx * 0.72 }
      : {}),
    ...(lyricStyle.contrastShadowBlurPx !== undefined
      ? { contrastShadowBlurPx: lyricStyle.contrastShadowBlurPx * 0.68 }
      : {}),
    ...(lyricStyle.shadowBlurPx !== undefined
      ? { shadowBlurPx: lyricStyle.shadowBlurPx * 0.62 }
      : {}),
    anchorY01: promoFooterAnchorY01(portraitComposition, hasArtwork),
    maxWidth01: Math.min(
      lyricStyle.maxWidth01 ?? 0.76,
      portraitComposition ? 0.86 : 0.68,
    ),
    lineHeight: Math.max(1.04, lyricStyle.lineHeight ?? 1.08),
    maxLines: portraitComposition ? 2 : 1,
    minimumFontScale: 0.82,
    previousGhostOpacity: 0,
    nextEchoOpacity: 0,
    trailOpacity: 0,
    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
  };
}

type TrackIdentityStyles = {
  artist: Partial<LyricTextStyle>;
  title: Partial<LyricTextStyle>;
};

type TrackIdentityText = {
  artistName: string;
  trackTitle: string;
};

function deriveTrackIdentityStyles(
  lyricStyle: Partial<LyricTextStyle> | undefined,
  portraitComposition: boolean,
): TrackIdentityStyles | undefined {
  if (!lyricStyle) return undefined;

  const baseFontSize = lyricStyle.fontSizePx ?? 52;
  const baseLetterSpacing = lyricStyle.letterSpacingPx ?? 0;
  const anchorX01 = portraitComposition ? 0.92 : 0.945;

  const common: Partial<LyricTextStyle> = {
    ...lyricStyle,
    align: "right",
    anchorX01,
    lineHeight: 1,
    maxLines: 1,
    minimumFontScale: 0.68,
    balanceLines: false,
    strokeWidthPx: (lyricStyle.strokeWidthPx ?? 0) * 0.42,
    contrastStrokeWidthPx:
      (lyricStyle.contrastStrokeWidthPx ?? 0) * 0.42,
    contrastShadowBlurPx:
      (lyricStyle.contrastShadowBlurPx ?? 0) * 0.32,
    shadowBlurPx: (lyricStyle.shadowBlurPx ?? 0) * 0.28,
    previousGhostOpacity: 0,
    nextEchoOpacity: 0,
    trailOpacity: 0,
    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
    backgroundVeilOpacity: 0,
    backgroundVeilMode: "none",
  };

  return {
    artist: {
      ...common,
      fontSizePx: Math.max(13, Math.min(18, baseFontSize * 0.28)),
      letterSpacingPx: Math.max(
        0.5,
        baseLetterSpacing * 0.18 + 0.7,
      ),
      anchorY01: portraitComposition ? 0.035 : 0.055,
      maxWidth01: portraitComposition ? 0.52 : 0.34,
      opacity: Math.min(0.68, lyricStyle.opacity ?? 1),
    },
    title: {
      ...common,
      fontSizePx: Math.max(17, Math.min(23, baseFontSize * 0.35)),
      letterSpacingPx: Math.max(
        0.15,
        baseLetterSpacing * 0.16 + 0.38,
      ),
      anchorY01: portraitComposition ? 0.06 : 0.09,
      maxWidth01: portraitComposition ? 0.62 : 0.42,
      opacity: Math.min(0.9, lyricStyle.opacity ?? 1),
    },
  };
}

function deriveCopyrightLabelStyle(
  lyricStyle: Partial<LyricTextStyle> | undefined,
  portraitComposition: boolean,
): Partial<LyricTextStyle> | undefined {
  if (!lyricStyle) return undefined;

  const baseFontSize = lyricStyle.fontSizePx ?? 52;
  const baseLetterSpacing = lyricStyle.letterSpacingPx ?? 0;

  return {
    ...lyricStyle,
    align: "center",
    anchorX01: 0.5,
    anchorY01: portraitComposition ? 0.984 : 0.98,
    maxWidth01: portraitComposition ? 0.84 : 0.62,
    lineHeight: 1,
    maxLines: 1,
    minimumFontScale: 0.9,
    balanceLines: false,
    fontSizePx: Math.max(9, Math.min(13, baseFontSize * 0.18)),
    letterSpacingPx: Math.max(0.32, baseLetterSpacing * 0.12 + 0.42),
    strokeWidthPx: (lyricStyle.strokeWidthPx ?? 0) * 0.24,
    contrastStrokeWidthPx:
      (lyricStyle.contrastStrokeWidthPx ?? 0) * 0.24,
    contrastShadowBlurPx:
      (lyricStyle.contrastShadowBlurPx ?? 0) * 0.16,
    shadowBlurPx: (lyricStyle.shadowBlurPx ?? 0) * 0.16,
    previousGhostOpacity: 0,
    nextEchoOpacity: 0,
    trailOpacity: 0,
    lineStartScaleImpulse: 0,
    lineStartBlurPx: 0,
    lineStartShakePx: 0,
    revealMode: "none",
    backgroundVeilOpacity: 0,
    backgroundVeilMode: "none",
    opacity: Math.min(0.56, lyricStyle.opacity ?? 1),
  };
}

function staticTextFrame(text: string): LyricFrameState {
  return {
    activeLineIndex: 0,
    activeText: text,
    previousText: null,
    nextText: null,
    lineProgress01: 0.5,
    lineAgeSec: 1,
    timeToNextLineSec: null,
    isLineStart: false,
    isLineEnd: false,
    silence01: 0,
  };
}

function normalizeRenderPixelScale(pixelScale: number | undefined): number {
  if (typeof pixelScale !== "number" || !Number.isFinite(pixelScale)) {
    return 1;
  }

  return Math.max(0.1, Math.min(1, pixelScale));
}

function rendererInitErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Renderer init failed";
}

function applyDirectedLyricStyle(
  lyricRenderer: LyricTextRenderer,
  lyric: LyricFrameState,
  styleRuntime: LyricStyleRuntime | null,
): void {
  if (styleRuntime?.textMode !== "lyrics") return;

  const styleName = directedLyricStyleName(
    styleRuntime.baseStyleName,
    lyric.direction,
  );
  const formatStyle = applyRenderFormatToLyricStyle(
    LYRIC_STYLES[styleName],
    styleRuntime.formatGeometry,
  );
  const directedStyle = applyLyricDirectionToStyle(
    formatStyle ?? {},
    lyric.direction,
  );

  lyricRenderer.setStyle(
    scaleLyricStyle(
      directedStyle,
      styleRuntime.lyricPixelScale,
    ),
  );
}

export default function InternalVisualizerRenderPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<OfflineVisualizerRenderer | null>(null);
  const lyricRendererRef = useRef<LyricTextRenderer | null>(null);
  const promoFooterRendererRef = useRef<LyricTextRenderer | null>(null);
  const trackArtistRendererRef = useRef<LyricTextRenderer | null>(null);
  const trackTitleRendererRef = useRef<LyricTextRenderer | null>(null);
  const trackIdentityTextRef = useRef<TrackIdentityText | null>(null);
  const copyrightRendererRef = useRef<LyricTextRenderer | null>(null);
  const copyrightTextRef = useRef<string | null>(null);
  const promoImageRendererRef = useRef<PromoImageRenderer | null>(null);
  const postProcessorRef = useRef<FramePostProcessor | null>(null);
  const pixelBufferRef = useRef<Uint8Array | null>(null);
  const lastFrameRef = useRef<OfflineFrame | null>(null);
  const cameraPixelScaleRef = useRef(1);
  const lyricStyleRuntimeRef = useRef<LyricStyleRuntime | null>(null);
  const [rendererApiReady, setRendererApiReady] = useState(false);
  const [message, setMessage] = useState("Renderer not initialised");
  const [themes, setThemes] = useState<string[]>([]);

  const [audioFiles, setAudioFiles] = useState<AudioFileOption[]>([]);
  const [lrcFiles, setLrcFiles] = useState<AudioFileOption[]>([]);
  const [lyricDirectionFiles, setLyricDirectionFiles] = useState<
    AudioFileOption[]
  >([]);
  const [imageFiles, setImageFiles] = useState<AudioFileOption[]>([]);
  const [selectedTheme, setSelectedTheme] = useState("nebula");
  const [selectedAudioFile, setSelectedAudioFile] = useState("");
  const [selectedLrcFile, setSelectedLrcFile] = useState("__none__");
  const [selectedLyricDirectionsFile, setSelectedLyricDirectionsFile] =
    useState("__auto__");
  const [textMode, setTextMode] = useState<TextRenderMode>("lyrics");
  const [promoText, setPromoText] = useState("");
  const [promoFooterText, setPromoFooterText] = useState("");
  const [selectedPromoIconFile, setSelectedPromoIconFile] =
    useState("__none__");
  const [selectedPromoArtworkFile, setSelectedPromoArtworkFile] =
    useState("__none__");
  const [selectedLyricStyle, setSelectedLyricStyle] = useState<LyricStyleName>(
    "ghost-lit-devotional",
  );
  const [selectedPostPreset, setSelectedPostPreset] =
    useState<PostPresetName>("gold-devotional");
  const [recordingId, setRecordingId] = useState("test_render");
  const [artistName, setArtistName] = useState("Brendan John Roch");
  const [trackTitle, setTrackTitle] = useState("");
  const [renderFormatName, setRenderFormatName] =
    useState<RenderFormatName>("landscape-16:9");
  const [width, setWidth] = useState(1280);
  const [height, setHeight] = useState(720);
  const [fps, setFps] = useState(30);
  const [seed, setSeed] = useState(1);
  const [crf, setCrf] = useState(18);
  const [writeProRes, setWriteProRes] = useState(false);
  const [startSec, setStartSec] = useState("");
  const [endSec, setEndSec] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const api: AfrRendererApi = {
      init: async (config) => {
        try {
          rendererRef.current?.dispose();
          promoImageRendererRef.current?.dispose();
          rendererRef.current = null;
          lyricRendererRef.current = null;
          promoFooterRendererRef.current = null;
          trackArtistRendererRef.current = null;
          trackTitleRendererRef.current = null;
          trackIdentityTextRef.current = null;
          copyrightRendererRef.current = null;
          copyrightTextRef.current = null;
          promoImageRendererRef.current = null;
          postProcessorRef.current = null;
          pixelBufferRef.current = null;
          lastFrameRef.current = null;
          lyricStyleRuntimeRef.current = null;

          canvas.width = config.width;
          canvas.height = config.height;

          const gl = canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: true,
            premultipliedAlpha: false,
          });

          if (!gl) {
            throw new Error("WebGL2 is unavailable");
          }

          await ensureRenderFontsReady();

          const renderer = new OfflineVisualizerRenderer(gl, config);
          await renderer.init();

          const pixelScale = normalizeRenderPixelScale(config.pixelScale);

          const compositionWidth = config.compositionWidth ?? config.width;
          const compositionHeight = config.compositionHeight ?? config.height;

          const resolvedFormatName =
            config.renderFormatName ??
            inferRenderFormatName(compositionWidth, compositionHeight);

          const formatGeometry = getRenderFormatGeometry(
            resolvedFormatName,
            compositionWidth,
            compositionHeight,
          );

          const baseStyleName = config.lyricStyleName ?? "clean-center";
          const sourceLyricStyle = LYRIC_STYLES[baseStyleName];

          const lyricStyle = applyRenderFormatToLyricStyle(
            sourceLyricStyle,
            formatGeometry,
          );

          const portraitComposition =
            compositionHeight > compositionWidth * 1.15;
          const hasPromoArtwork = Boolean(config.promoArtworkUrl);
          const primaryTextStyle =
            config.textMode === "promo"
              ? derivePromoPrimaryStyle(
                  lyricStyle,
                  portraitComposition,
                  hasPromoArtwork,
                )
              : lyricStyle;
          const promoFooterStyle = config.promoFooterEnabled
            ? derivePromoFooterStyle(
                lyricStyle,
                portraitComposition,
                hasPromoArtwork,
              )
            : undefined;

          const identityTrackTitle = config.trackTitle?.trim() ?? "";
          const identityArtistName = config.artistName?.trim() ?? "";
          const trackIdentityStyles = identityTrackTitle
            ? deriveTrackIdentityStyles(lyricStyle, portraitComposition)
            : undefined;
          const copyrightNotice =
            config.textMode === "lyrics"
              ? `© Angelfish Records ${new Date().getFullYear()}`
              : "";
          const copyrightLabelStyle = copyrightNotice
            ? deriveCopyrightLabelStyle(lyricStyle, portraitComposition)
            : undefined;

          const postStyle = config.postPresetName
            ? POST_STYLES[config.postPresetName]
            : POST_STYLES.none;

          const lyricPixelScale = pixelScale * formatGeometry.lyricPixelScale;
          const effectPixelScale = pixelScale * formatGeometry.effectPixelScale;

          cameraPixelScaleRef.current =
            pixelScale * formatGeometry.cameraPixelScale;
          lyricStyleRuntimeRef.current = {
            baseStyleName,
            formatGeometry,
            lyricPixelScale,
            textMode: config.textMode ?? "lyrics",
          };

          const promoImageRenderer =
            config.promoIconUrl || config.promoArtworkUrl
              ? await PromoImageRenderer.create(config.width, config.height, {
                  iconUrl: config.promoIconUrl,
                  artworkUrl: config.promoArtworkUrl,
                  startSec: config.promoStartSec,
                  endSec: config.promoEndSec,
                })
              : null;

          rendererRef.current = renderer;
          pixelBufferRef.current = new Uint8Array(
            config.width * config.height * 4,
          );
          lyricRendererRef.current = new LyricTextRenderer(
            config.width,
            config.height,
            scaleLyricStyle(primaryTextStyle, lyricPixelScale),
          );
          promoFooterRendererRef.current = promoFooterStyle
            ? new LyricTextRenderer(
                config.width,
                config.height,
                scaleLyricStyle(promoFooterStyle, lyricPixelScale),
              )
            : null;
          trackArtistRendererRef.current =
            trackIdentityStyles && identityArtistName
              ? new LyricTextRenderer(
                  config.width,
                  config.height,
                  scaleLyricStyle(
                    trackIdentityStyles.artist,
                    lyricPixelScale,
                  ),
                )
              : null;
          trackTitleRendererRef.current = trackIdentityStyles
            ? new LyricTextRenderer(
                config.width,
                config.height,
                scaleLyricStyle(
                  trackIdentityStyles.title,
                  lyricPixelScale,
                ),
              )
            : null;
          trackIdentityTextRef.current = identityTrackTitle
            ? {
                artistName: identityArtistName,
                trackTitle: identityTrackTitle,
              }
            : null;
          copyrightRendererRef.current = copyrightLabelStyle
            ? new LyricTextRenderer(
                config.width,
                config.height,
                scaleLyricStyle(
                  copyrightLabelStyle,
                  lyricPixelScale,
                ),
              )
            : null;
          copyrightTextRef.current = copyrightNotice || null;
          promoImageRendererRef.current = promoImageRenderer;
          postProcessorRef.current = new FramePostProcessor(
            config.width,
            config.height,
            scalePostStyle(postStyle, effectPixelScale),
          );
          setMessage(
            `Ready: ${config.themeName} ${config.width}×${config.height} @ ${config.fps}fps`,
          );
        } catch (err) {
          setMessage(rendererInitErrorMessage(err));
          throw err;
        }
      },

      renderFrame: (frame, opts) => {
        const renderer = rendererRef.current;
        if (!renderer) throw new Error("Renderer has not been initialised");

        lastFrameRef.current = frame;
        renderer.renderFrame(frame, opts);
      },
      readFrame: () => {
        const renderer = rendererRef.current;
        const buffer = pixelBufferRef.current;

        if (!renderer || !buffer) {
          throw new Error("Renderer has not been initialised");
        }

        renderer.readPixelsInto(buffer);

        const promoImageRenderer = promoImageRendererRef.current;
        if (promoImageRenderer) {
          promoImageRenderer.compositeIntoRgbaBuffer(
            buffer,
            lastFrameRef.current?.time ?? 0,
          );
        }

        const lyric = lastFrameRef.current?.lyric;
        const lyricRenderer = lyricRendererRef.current;

        if (lyric && lyricRenderer) {
          applyDirectedLyricStyle(
            lyricRenderer,
            lyric,
            lyricStyleRuntimeRef.current,
          );
          lyricRenderer.compositeIntoRgbaBuffer(buffer, lyric);
        }

        const promoFooter = lastFrameRef.current?.promoFooter;
        const promoFooterRenderer = promoFooterRendererRef.current;

        if (promoFooter && promoFooterRenderer) {
          promoFooterRenderer.compositeIntoRgbaBuffer(buffer, promoFooter);
        }

        const sourceCamera = lastFrameRef.current?.camera;
        const cameraScale = cameraPixelScaleRef.current;
        const camera =
          sourceCamera && cameraScale !== 1
            ? {
                ...sourceCamera,
                shake: sourceCamera.shake * cameraScale,
              }
            : sourceCamera;

        const postProcessor = postProcessorRef.current;
        const frameIndex = lastFrameRef.current?.frameIndex ?? 0;

        if (postProcessor) {
          postProcessor.processIntoRgbaBuffer(buffer, frameIndex, camera);
        }

        const trackIdentity = trackIdentityTextRef.current;
        const trackArtistRenderer = trackArtistRendererRef.current;
        const trackTitleRenderer = trackTitleRendererRef.current;
        const copyrightNotice = copyrightTextRef.current;
        const copyrightRenderer = copyrightRendererRef.current;

        if (trackIdentity?.artistName && trackArtistRenderer) {
          trackArtistRenderer.compositeIntoRgbaBuffer(
            buffer,
            staticTextFrame(trackIdentity.artistName),
          );
        }

        if (trackIdentity?.trackTitle && trackTitleRenderer) {
          trackTitleRenderer.compositeIntoRgbaBuffer(
            buffer,
            staticTextFrame(trackIdentity.trackTitle),
          );
        }

        if (copyrightNotice && copyrightRenderer) {
          copyrightRenderer.compositeIntoRgbaBuffer(
            buffer,
            staticTextFrame(copyrightNotice),
          );
        }

        return buffer;
      },

      dispose: () => {
        rendererRef.current?.dispose();
        promoImageRendererRef.current?.dispose();
        rendererRef.current = null;
        lyricRendererRef.current = null;
        promoFooterRendererRef.current = null;
        trackArtistRendererRef.current = null;
        trackTitleRendererRef.current = null;
        trackIdentityTextRef.current = null;
        copyrightRendererRef.current = null;
        copyrightTextRef.current = null;
        promoImageRendererRef.current = null;
        postProcessorRef.current = null;
        pixelBufferRef.current = null;
        lastFrameRef.current = null;
        cameraPixelScaleRef.current = 1;
        lyricStyleRuntimeRef.current = null;
        setMessage("Renderer disposed");
      },

      status: () => {
        if (rendererRef.current) return "ready";
        return "idle";
      },

      bakeAudioFeatures: async (audioUrl, fps) => {
        const res = await fetch(audioUrl);
        if (!res.ok) {
          throw new Error(
            `Failed to fetch audio: ${res.status} ${res.statusText}`,
          );
        }

        const arrayBuffer = await res.arrayBuffer();
        const audioContext = new AudioContext();
        try {
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

          return bakeAudioFeatureFrames({
            audioBuffer,
            fps,
          });
        } finally {
          await audioContext.close();
        }
      },
    };

    window.__AFR_RENDERER__ = api;
    setRendererApiReady(true);
    setMessage("Renderer API attached to window.__AFR_RENDERER__");

    return () => {
      setRendererApiReady(false);
      rendererRef.current?.dispose();
      promoImageRendererRef.current?.dispose();
      rendererRef.current = null;
      lyricRendererRef.current = null;
      promoFooterRendererRef.current = null;
      trackArtistRendererRef.current = null;
      trackTitleRendererRef.current = null;
      trackIdentityTextRef.current = null;
      copyrightRendererRef.current = null;
      copyrightTextRef.current = null;
      promoImageRendererRef.current = null;
      postProcessorRef.current = null;
      pixelBufferRef.current = null;
      lastFrameRef.current = null;
      cameraPixelScaleRef.current = 1;
      lyricStyleRuntimeRef.current = null;

      if (window.__AFR_RENDERER__ === api) {
        delete window.__AFR_RENDERER__;
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOptions(): Promise<void> {
      const res = await fetch("/api/internal/render/visualizer");
      if (!res.ok) throw new Error("Failed to load render options");

      const data = (await res.json()) as RenderControllerOptions;
      if (cancelled) return;

      setThemes(data.themes);
      setAudioFiles(data.audioFiles);
      setLrcFiles(data.lrcFiles);
      setLyricDirectionFiles(data.lyricDirectionFiles);
      setImageFiles(data.imageFiles);

      if (data.themes[0]) setSelectedTheme(data.themes[0]);
      if (data.audioFiles[0]) {
        setSelectedAudioFile(data.audioFiles[0].file);
        setRecordingId(data.audioFiles[0].file.replace(/\.[^.]+$/, ""));
      }
    }

    loadOptions().catch((err) => {
      setExportMessage(
        err instanceof Error ? err.message : "Failed to load options",
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  function selectRenderFormat(nextFormatName: RenderFormatName): void {
    const profile = RENDER_FORMATS[nextFormatName];

    setRenderFormatName(nextFormatName);
    setWidth(profile.width);
    setHeight(profile.height);
  }

  function updateWidth(nextWidth: number): void {
    setWidth(nextWidth);
    setRenderFormatName(inferRenderFormatName(nextWidth, height));
  }

  function updateHeight(nextHeight: number): void {
    setHeight(nextHeight);
    setRenderFormatName(inferRenderFormatName(width, nextHeight));
  }

  async function runExport(): Promise<void> {
    setIsExporting(true);
    setExportMessage("Export started...");

    try {
      const res = await fetch("/api/internal/render/visualizer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recordingId,
          artistName: artistName.trim() || undefined,
          trackTitle: trackTitle.trim() || undefined,
          themeName: selectedTheme,
          audioFile: selectedAudioFile,
          lrcFile: selectedLrcFile,
          lyricDirectionsFile: selectedLyricDirectionsFile,
          textMode,
          promoText: textMode === "promo" ? promoText : undefined,
          promoFooterText:
            textMode === "promo" ? promoFooterText : undefined,
          promoIconFile:
            textMode === "promo" ? selectedPromoIconFile : undefined,
          promoArtworkFile:
            textMode === "promo" ? selectedPromoArtworkFile : undefined,
          lyricStyleName: selectedLyricStyle,
          postPresetName: selectedPostPreset,
          renderFormatName,
          width,
          height,
          fps,
          seed,
          crf,
          writeProRes,
          startSec: startSec.trim() ? Number(startSec) : undefined,
          endSec: endSec.trim() ? Number(endSec) : undefined,
        }),
      });

      const data = (await res.json()) as RenderResponse;

      if (!data.ok) {
        throw new Error(data.error);
      }

      setExportMessage(
        `Export complete. Output: ${data.outputDir}\nManifest: ${data.manifestPath}`,
      );
    } catch (err) {
      setExportMessage(err instanceof Error ? err.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "#f5f5f5",
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        padding: 24,
      }}
    >
      <h1 style={{ fontSize: 18, marginBottom: 8 }}>
        Angelfish Visualizer Render Controller
      </h1>

      <p style={{ opacity: 0.72, marginBottom: 16 }}>{message}</p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(300px, 390px) minmax(0, 1fr)",
          gap: 24,
          alignItems: "start",
          maxWidth: 1680,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            padding: 16,
            borderRadius: 12,
          }}
        >
          <label>
            <div>Audio file</div>
            <select
              value={selectedAudioFile}
              onChange={(event) => {
                const file = event.target.value;
                setSelectedAudioFile(file);
                setRecordingId(file.replace(/\.[^.]+$/, ""));
              }}
              style={{ width: "100%" }}
            >
              {audioFiles.map((audio) => (
                <option key={audio.file} value={audio.file}>
                  {audio.file}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div>Text mode</div>
            <select
              value={textMode}
              onChange={(event) =>
                setTextMode(event.target.value as TextRenderMode)
              }
              style={{ width: "100%" }}
            >
              <option value="lyrics">Lyrics</option>
              <option value="promo">Promo text</option>
              <option value="none">No text</option>
            </select>
          </label>

          {textMode === "lyrics" ? (
            <>
              <label>
                <div>LRC file</div>
                <select
                  value={selectedLrcFile}
                  onChange={(event) => setSelectedLrcFile(event.target.value)}
                  style={{ width: "100%" }}
                >
                  <option value="__none__">No lyrics</option>
                  {lrcFiles.map((lrc) => (
                    <option key={lrc.file} value={lrc.file}>
                      {lrc.file}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div>Lyric directions</div>
                <select
                  value={selectedLyricDirectionsFile}
                  onChange={(event) =>
                    setSelectedLyricDirectionsFile(event.target.value)
                  }
                  style={{ width: "100%" }}
                >
                  <option value="__auto__">
                    Auto-match .lyric-directions.json
                  </option>
                  <option value="__none__">No line overrides</option>
                  {lyricDirectionFiles.map((directions) => (
                    <option key={directions.file} value={directions.file}>
                      {directions.file}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : null}

          {textMode === "promo" ? (
            <>
              <label>
                <div>Promo text · above artwork</div>
                <textarea
                  value={promoText}
                  onChange={(event) => setPromoText(event.target.value)}
                  placeholder={"Brendan John Roch\nGOD DEFEND"}
                  rows={4}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    font: "inherit",
                  }}
                />
              </label>

              <label>
                <div>Promo icon</div>
                <select
                  value={selectedPromoIconFile}
                  onChange={(event) =>
                    setSelectedPromoIconFile(event.target.value)
                  }
                  style={{ width: "100%" }}
                >
                  <option value="__none__">No icon</option>
                  {imageFiles.map((image) => (
                    <option key={`icon-${image.file}`} value={image.file}>
                      {image.file}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div>Promo album art</div>
                <select
                  value={selectedPromoArtworkFile}
                  onChange={(event) =>
                    setSelectedPromoArtworkFile(event.target.value)
                  }
                  style={{ width: "100%" }}
                >
                  <option value="__none__">No album art</option>
                  {imageFiles.map((image) => (
                    <option key={`artwork-${image.file}`} value={image.file}>
                      {image.file}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <div>Promo footer text · below artwork</div>
                <textarea
                  value={promoFooterText}
                  onChange={(event) => setPromoFooterText(event.target.value)}
                  placeholder="Streaming Now"
                  rows={2}
                  style={{
                    width: "100%",
                    resize: "vertical",
                    font: "inherit",
                  }}
                />
              </label>

              <div style={{ fontSize: 11, opacity: 0.58, lineHeight: 1.45 }}>
                Promo images are optional. Put PNG, JPEG, WebP, or SVG assets in
                web/public/render-test and refresh this page to select them.
              </div>
            </>
          ) : null}

          {textMode !== "none" ? (
            <label>
              <div>Text style</div>
              <select
                value={selectedLyricStyle}
                onChange={(event) =>
                  setSelectedLyricStyle(event.target.value as LyricStyleName)
                }
                style={{ width: "100%" }}
              >
                {LYRIC_STYLE_NAMES.map((styleName) => (
                  <option key={styleName} value={styleName}>
                    {styleName}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label>
            <div>Post preset</div>
            <select
              value={selectedPostPreset}
              onChange={(event) =>
                setSelectedPostPreset(event.target.value as PostPresetName)
              }
              style={{ width: "100%" }}
            >
              {POST_PRESET_NAMES.map((presetName) => (
                <option key={presetName} value={presetName}>
                  {presetName}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div>Theme</div>
            <select
              value={selectedTheme}
              onChange={(event) => setSelectedTheme(event.target.value)}
              style={{ width: "100%" }}
            >
              {themes.map((theme) => (
                <option key={theme} value={theme}>
                  {theme}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div>Recording ID</div>
            <input
              value={recordingId}
              onChange={(event) => setRecordingId(event.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>Artist name · top-right label</div>
            <input
              value={artistName}
              onChange={(event) => setArtistName(event.target.value)}
              placeholder="Brendan John Roch"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>Track title · top-right label</div>
            <input
              value={trackTitle}
              onChange={(event) => setTrackTitle(event.target.value)}
              placeholder="Leave blank to hide track identity"
              style={{ width: "100%" }}
            />
          </label>

          <div style={{ fontSize: 11, opacity: 0.58, lineHeight: 1.45 }}>
            Track identity inherits the selected text face and remains fixed
            across lyric-direction changes.
          </div>

          <label>
            <div>Format</div>
            <select
              value={renderFormatName}
              onChange={(event) =>
                selectRenderFormat(event.target.value as RenderFormatName)
              }
              style={{ width: "100%" }}
            >
              {RENDER_FORMAT_NAMES.map((formatName) => (
                <option key={formatName} value={formatName}>
                  {RENDER_FORMATS[formatName].label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <div>Width</div>
            <input
              type="number"
              value={width}
              onChange={(event) => updateWidth(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>Height</div>
            <input
              type="number"
              value={height}
              onChange={(event) => updateHeight(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>FPS</div>
            <input
              type="number"
              value={fps}
              onChange={(event) => setFps(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>Seed</div>
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>CRF</div>
            <input
              type="number"
              value={crf}
              onChange={(event) => setCrf(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>
              Clip start sec
              {textMode === "promo" ? " (required)" : " optional"}
            </div>
            <input
              type="number"
              value={startSec}
              onChange={(event) => setStartSec(event.target.value)}
              placeholder="e.g. 40"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>
              Clip end sec
              {textMode === "promo" ? " (required)" : " optional"}
            </div>
            <input
              type="number"
              value={endSec}
              onChange={(event) => setEndSec(event.target.value)}
              placeholder="e.g. 60"
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={writeProRes}
              onChange={(event) => setWriteProRes(event.target.checked)}
            />{" "}
            Write ProRes master
          </label>

          <button
            type="button"
            disabled={
              isExporting ||
              !selectedAudioFile ||
              (textMode === "promo" &&
                (!promoText.trim() || !startSec.trim() || !endSec.trim()))
            }
            onClick={() => {
              void runExport();
            }}
          >
            {isExporting ? "Exporting..." : "Run export"}
          </button>

          <pre style={{ whiteSpace: "pre-wrap", opacity: 0.82 }}>
            {exportMessage}
          </pre>
        </div>

        <VisualizerLivePreview
          renderCanvasRef={canvasRef}
          rendererApiReady={rendererApiReady}
          rendererMessage={message}
          audioFiles={audioFiles}
          lrcFiles={lrcFiles}
          lyricDirectionFiles={lyricDirectionFiles}
          imageFiles={imageFiles}
          selectedTheme={selectedTheme}
          selectedAudioFile={selectedAudioFile}
          selectedLrcFile={selectedLrcFile}
          selectedLyricDirectionsFile={selectedLyricDirectionsFile}
          artistName={artistName}
          trackTitle={trackTitle}
          textMode={textMode}
          promoText={promoText}
          promoFooterText={promoFooterText}
          selectedPromoIconFile={selectedPromoIconFile}
          selectedPromoArtworkFile={selectedPromoArtworkFile}
          startSec={startSec}
          endSec={endSec}
          selectedLyricStyle={selectedLyricStyle}
          selectedPostPreset={selectedPostPreset}
          renderFormatName={renderFormatName}
          width={width}
          height={height}
          fps={fps}
          seed={seed}
        />
      </section>
    </main>
  );
}
