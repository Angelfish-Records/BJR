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
  return hasArtwork ? 0.895 : 0.79;
}

export default function InternalVisualizerRenderPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<OfflineVisualizerRenderer | null>(null);
  const lyricRendererRef = useRef<LyricTextRenderer | null>(null);
  const promoFooterRendererRef = useRef<LyricTextRenderer | null>(null);
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

          if ("fonts" in document) {
            await document.fonts.ready;
          }

          const renderer = new OfflineVisualizerRenderer(gl, config);
          await renderer.init();

          const requestedPixelScale = config.pixelScale;
          const pixelScale =
            typeof requestedPixelScale === "number" &&
            Number.isFinite(requestedPixelScale)
              ? Math.max(0.1, Math.min(1, requestedPixelScale))
              : 1;

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
          const promoFooterStyle = config.promoFooterEnabled
            ? {
                ...(lyricStyle ?? {}),
                ...(lyricStyle?.fontSizePx !== undefined
                  ? { fontSizePx: lyricStyle.fontSizePx * 0.72 }
                  : {}),
                anchorY01: promoFooterAnchorY01(
                  portraitComposition,
                  Boolean(config.promoArtworkUrl),
                ),
                maxWidth01: Math.min(
                  lyricStyle?.maxWidth01 ?? 0.76,
                  portraitComposition ? 0.82 : 0.68,
                ),
                previousGhostOpacity: 0,
                nextEchoOpacity: 0,
                trailOpacity: 0,
                lineStartScaleImpulse:
                  (lyricStyle?.lineStartScaleImpulse ?? 0) * 0.5,
                lineStartShakePx: 0,
              }
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
            scaleLyricStyle(lyricStyle, lyricPixelScale),
          );
          promoFooterRendererRef.current = promoFooterStyle
            ? new LyricTextRenderer(
                config.width,
                config.height,
                scaleLyricStyle(promoFooterStyle, lyricPixelScale),
              )
            : null;
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
          setMessage(
            err instanceof Error ? err.message : "Renderer init failed",
          );
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
          const styleRuntime = lyricStyleRuntimeRef.current;

          if (styleRuntime) {
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

        return buffer;
      },

      dispose: () => {
        rendererRef.current?.dispose();
        promoImageRendererRef.current?.dispose();
        rendererRef.current = null;
        lyricRendererRef.current = null;
        promoFooterRendererRef.current = null;
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
