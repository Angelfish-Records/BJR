// web/app/internal/render/visualizer/VisualizerLivePreview.tsx
"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

import {
  canonicalThemeName,
  clearThemeFactoryCache,
} from "../../../home/player/visualizer/core/themeRegistry";
import { bakeCameraFrameStates } from "../../../home/player/visualizer/offline/cinematicTimeline";
import {
  LYRIC_STYLES,
  type LyricStyleName,
} from "../../../home/player/visualizer/offline/lyricStyles";
import type {
  OfflineFrame,
  OfflineRenderConfig,
} from "../../../home/player/visualizer/offline/offlineTypes";
import type { PostPresetName } from "../../../home/player/visualizer/offline/postStyles";
import {
  inferRenderFormatName,
  RENDER_FORMATS,
  type RenderFormatName,
} from "../../../home/player/visualizer/offline/renderFormats";
import {
  bakePreviewSourceTimeline,
  type PreviewSourceTimeline,
} from "../../../home/player/visualizer/offline/previewTimeline";

type RenderAssetOption = {
  file: string;
  url: string;
  path: string;
};

type PreviewRendererApi = {
  init: (config: OfflineRenderConfig) => Promise<void>;
  renderFrame: (frame: OfflineFrame) => void;
  readFrame: () => Uint8Array;
};

type RevisionResponse = {
  sourceRevision: string;
};

type Props = Readonly<{
  renderCanvasRef: RefObject<HTMLCanvasElement | null>;
  rendererApiReady: boolean;
  rendererMessage: string;
  audioFiles: readonly RenderAssetOption[];
  lrcFiles: readonly RenderAssetOption[];
  selectedTheme: string;
  selectedAudioFile: string;
  selectedLrcFile: string;
  selectedLyricStyle: LyricStyleName;
  selectedPostPreset: PostPresetName;
  renderFormatName: RenderFormatName;
  width: number;
  height: number;
  fps: number;
  seed: number;
}>;

type PreviewState = "idle" | "baking" | "initialising" | "ready" | "error";

type PreviewQualityName = "draft" | "balanced" | "full";

type PreviewQualityConfig = {
  label: string;
  maxWidth: number;
  maxHeight: number;
  fpsCap: number;
};

const PREVIEW_QUALITY_NAMES: PreviewQualityName[] = [
  "draft",
  "balanced",
  "full",
];

const PREVIEW_QUALITY_CONFIG: Record<PreviewQualityName, PreviewQualityConfig> =
  {
    draft: {
      label: "Draft",
      maxWidth: 640,
      maxHeight: 360,
      fpsCap: 8,
    },
    balanced: {
      label: "Balanced",
      maxWidth: 960,
      maxHeight: 540,
      fpsCap: 12,
    },
    full: {
      label: "Full",
      maxWidth: Number.POSITIVE_INFINITY,
      maxHeight: Number.POSITIVE_INFINITY,
      fpsCap: Number.POSITIVE_INFINITY,
    },
  };

const FALLBACK_FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function resolveRenderFormatName(
  value: RenderFormatName | undefined,
  width: number,
  height: number,
): RenderFormatName {
  if (value && Object.hasOwn(RENDER_FORMATS, value)) {
    return value;
  }

  return inferRenderFormatName(width, height);
}

function formatTime(value: number): string {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;

  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

const EMPTY_CAPTIONS_TRACK = "data:text/vtt;charset=utf-8,WEBVTT%0A%0A";

function formatVttTimestamp(valueSec: number): string {
  const totalMs = Math.max(0, Math.round(valueSec * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  const milliseconds = totalMs % 1000;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0",
  )}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(
    3,
    "0",
  )}`;
}

function buildCaptionTrackSrc(
  timeline: PreviewSourceTimeline | null,
  fps: number,
): string {
  const frames = timeline?.lyricFrames;
  if (!timeline || !frames?.length) return EMPTY_CAPTIONS_TRACK;

  const lines = ["WEBVTT", ""];
  let activeText = "";
  let startFrame = 0;

  const appendCue = (endFrame: number): void => {
    if (!activeText) return;

    const startSec = startFrame / fps;
    const endSec = Math.min(
      timeline.durationSec,
      Math.max(startSec + 0.001, endFrame / fps),
    );

    lines.push(
      `${formatVttTimestamp(startSec)} --> ${formatVttTimestamp(endSec)}`,
      activeText.replace(/\r?\n/g, " "),
      "",
    );
  };

  frames.forEach((frame, frameIndex) => {
    const nextText = frame.activeText?.trim() ?? "";
    if (nextText === activeText) return;

    appendCue(frameIndex);
    activeText = nextText;
    startFrame = frameIndex;
  });

  appendCue(frames.length);

  return `data:text/vtt;charset=utf-8,${encodeURIComponent(lines.join("\n"))}`;
}

function previewBorderForState(state: PreviewState): string {
  if (state === "error") return "rgba(255,92,92,0.52)";
  if (state === "ready") return "rgba(255,255,255,0.22)";
  return "rgba(255,255,255,0.13)";
}

function getRendererApi(): PreviewRendererApi | null {
  const browserWindow = window as Window & {
    __AFR_RENDERER__?: PreviewRendererApi;
  };

  return browserWindow.__AFR_RENDERER__ ?? null;
}

export default function VisualizerLivePreview(props: Props) {
  const {
    renderCanvasRef,
    rendererApiReady,
    rendererMessage,
    audioFiles,
    lrcFiles,
    selectedTheme,
    selectedAudioFile,
    selectedLrcFile,
    selectedLyricStyle,
    selectedPostPreset,
    renderFormatName,
    width,
    height,
    fps,
    seed,
  } = props;

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineLoadTokenRef = useRef(0);
  const previewInitTokenRef = useRef(0);
  const renderSequenceRef = useRef(0);
  const lastSourceFrameRef = useRef(-1);
  const previewReadyRef = useRef(false);
  const previewInitialisingRef = useRef(false);
  const previewTimeRef = useRef(0);
  const previewImageDataRef = useRef<ImageData | null>(null);
  const scrubTimerRef = useRef<number | null>(null);
  const lastUiUpdateMsRef = useRef(0);

  const [timeline, setTimeline] = useState<PreviewSourceTimeline | null>(null);
  const [previewState, setPreviewState] = useState<PreviewState>("idle");
  const [previewMessage, setPreviewMessage] = useState(
    "Choose an audio source to bake the live preview.",
  );
  const [previewTimeSec, setPreviewTimeSec] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeLyric, setActiveLyric] = useState("");
  const [sourceRevision, setSourceRevision] = useState("");
  const [manualReloadToken, setManualReloadToken] = useState(0);
  const [timelineReloadToken, setTimelineReloadToken] = useState(0);
  const [previewQuality, setPreviewQuality] =
    useState<PreviewQualityName>("draft");

  const selectedAudio = useMemo(
    () => audioFiles.find((item) => item.file === selectedAudioFile) ?? null,
    [audioFiles, selectedAudioFile],
  );

  const selectedLrc = useMemo(
    () =>
      selectedLrcFile === "__none__"
        ? null
        : (lrcFiles.find((item) => item.file === selectedLrcFile) ?? null),
    [lrcFiles, selectedLrcFile],
  );

  const cameraFrames = useMemo(() => {
    if (!timeline) return [];

    return bakeCameraFrameStates({
      audioFrames: timeline.audioFrames,
      lyricFrames: timeline.lyricFrames,
      seed,
    });
  }, [seed, timeline]);

  const exportWidth = Math.max(16, Math.floor(width));
  const exportHeight = Math.max(16, Math.floor(height));
  const exportFps = clamp(fps, 1, 120);

  const resolvedRenderFormatName = resolveRenderFormatName(
    renderFormatName,
    exportWidth,
    exportHeight,
  );
  const renderFormatProfile = RENDER_FORMATS[resolvedRenderFormatName];

  const previewProfile = PREVIEW_QUALITY_CONFIG[previewQuality];

  const previewScale = Math.min(
    1,
    previewProfile.maxWidth / exportWidth,
    previewProfile.maxHeight / exportHeight,
  );

  const safeWidth = Math.max(16, Math.round(exportWidth * previewScale));
  const safeHeight = Math.max(16, Math.round(exportHeight * previewScale));
  const safeFps = Math.max(1, Math.min(exportFps, previewProfile.fpsCap));

  const durationSec = timeline?.durationSec ?? 0;
  const captionTrackSrc = useMemo(
    () => buildCaptionTrackSrc(timeline, safeFps),
    [safeFps, timeline],
  );

  const updatePreviewTime = useCallback((timeSec: number): void => {
    previewTimeRef.current = timeSec;
    setPreviewTimeSec(timeSec);
  }, []);

  const presentBuffer = useCallback(
    (buffer: Uint8Array): void => {
      const canvas = previewCanvasRef.current;
      if (!canvas) return;

      if (canvas.width !== safeWidth || canvas.height !== safeHeight) {
        canvas.width = safeWidth;
        canvas.height = safeHeight;
        previewImageDataRef.current = null;
      }

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Canvas2D is unavailable for live preview display");
      }

      let image = previewImageDataRef.current;
      const imageMatchesBuffer =
        image?.width === safeWidth &&
        image?.height === safeHeight &&
        image?.data.length === buffer.length;

      if (!imageMatchesBuffer) {
        image = context.createImageData(safeWidth, safeHeight);
        previewImageDataRef.current = image;
      }

      if (!image) return;

      image.data.set(buffer);
      context.putImageData(image, 0, 0);
    },
    [safeHeight, safeWidth],
  );

  const renderPreparedFrame = useCallback(
    (requestedTimeSec: number, force = false): void => {
      if (
        !timeline ||
        !previewReadyRef.current ||
        previewInitialisingRef.current
      ) {
        return;
      }

      const api = getRendererApi();
      if (!api) return;

      const maxTime = Math.max(0, timeline.durationSec - 1 / safeFps);
      const timeSec = clamp(requestedTimeSec, 0, maxTime);
      const sourceFrameIndex = clamp(
        Math.floor(timeSec * safeFps),
        0,
        Math.max(0, timeline.audioFrames.length - 1),
      );

      if (!force && sourceFrameIndex === lastSourceFrameRef.current) return;

      const sourceAudio = timeline.audioFrames[sourceFrameIndex];
      if (!sourceAudio) return;

      const sequenceFrameIndex = renderSequenceRef.current;
      const lyric = timeline.lyricFrames?.[sourceFrameIndex];
      const camera = cameraFrames[sourceFrameIndex];

      const frame: OfflineFrame = {
        frameIndex: sequenceFrameIndex,
        time: timeSec,
        audio: {
          ...sourceAudio,
          frameIndex: sequenceFrameIndex,
          time: timeSec,
        },
        ...(lyric ? { lyric } : {}),
        ...(camera ? { camera } : {}),
      };

      api.renderFrame(frame);
      presentBuffer(api.readFrame());

      renderSequenceRef.current += 1;
      lastSourceFrameRef.current = sourceFrameIndex;

      const now = performance.now();
      if (force || now - lastUiUpdateMsRef.current >= 80) {
        lastUiUpdateMsRef.current = now;
        updatePreviewTime(timeSec);
        setActiveLyric(lyric?.activeText?.trim() ?? "");
      }
    },
    [cameraFrames, presentBuffer, safeFps, timeline, updatePreviewTime],
  );

  const rebuildPreview = useCallback(
    async (requestedTimeSec: number): Promise<void> => {
      if (!rendererApiReady || !timeline) return;

      const api = getRendererApi();
      if (!api) return;

      const initToken = previewInitTokenRef.current + 1;
      previewInitTokenRef.current = initToken;
      previewInitialisingRef.current = true;
      previewReadyRef.current = false;
      setPreviewState("initialising");
      setPreviewMessage("Initialising the selected composition…");

      try {
        const themeName = canonicalThemeName(selectedTheme);
        clearThemeFactoryCache(themeName);

        await api.init({
          width: safeWidth,
          height: safeHeight,
          fps: safeFps,
          durationSec: timeline.durationSec,
          themeName,
          seed: Math.max(0, Math.floor(seed)),
          lyricStyleName: selectedLyricStyle,
          postPresetName: selectedPostPreset,
          renderFormatName: resolvedRenderFormatName,
          compositionWidth: exportWidth,
          compositionHeight: exportHeight,
          pixelScale: previewScale,
        });

        if (previewInitTokenRef.current !== initToken) return;

        renderSequenceRef.current = 0;
        lastSourceFrameRef.current = -1;
        previewImageDataRef.current = null;
        previewInitialisingRef.current = false;
        previewReadyRef.current = true;

        renderPreparedFrame(requestedTimeSec, true);

        setPreviewState("ready");
        setPreviewMessage(
          `${themeName} · ${selectedLyricStyle} · ${selectedPostPreset}`,
        );
      } catch (error) {
        if (previewInitTokenRef.current !== initToken) return;

        previewInitialisingRef.current = false;
        previewReadyRef.current = false;
        setPreviewState("error");
        setPreviewMessage(
          error instanceof Error
            ? error.message
            : "The live preview failed to initialise.",
        );
      }
    },
    [
      exportHeight,
      exportWidth,
      previewScale,
      resolvedRenderFormatName,
      rendererApiReady,
      renderPreparedFrame,
      safeFps,
      safeHeight,
      safeWidth,
      seed,
      selectedLyricStyle,
      selectedPostPreset,
      selectedTheme,
      timeline,
    ],
  );

  const scheduleStaticRebuild = useCallback(
    (timeSec: number): void => {
      if (document.visibilityState !== "visible") return;

      if (scrubTimerRef.current !== null) {
        window.clearTimeout(scrubTimerRef.current);
      }

      scrubTimerRef.current = window.setTimeout(() => {
        scrubTimerRef.current = null;
        void rebuildPreview(timeSec);
      }, 90);
    },
    [rebuildPreview],
  );

  useEffect(() => {
    return () => {
      if (scrubTimerRef.current !== null) {
        window.clearTimeout(scrubTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === "visible") return;

      const audio = audioRef.current;
      if (audio && !audio.paused) {
        audio.pause();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function pollSourceRevision(): Promise<void> {
      if (document.visibilityState !== "visible") return;

      try {
        const response = await fetch(
          "/api/internal/render/visualizer?mode=revision",
          { cache: "no-store" },
        );

        if (!response.ok) return;

        const data = (await response.json()) as RevisionResponse;
        if (!cancelled) setSourceRevision(data.sourceRevision);
      } catch {
        // Next.js Fast Refresh remains the fallback if revision polling fails.
      }
    }

    void pollSourceRevision();
    const intervalId = window.setInterval(() => {
      void pollSourceRevision();
    }, 2500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const loadToken = timelineLoadTokenRef.current + 1;
    timelineLoadTokenRef.current = loadToken;
    previewReadyRef.current = false;

    const startLoadTimer = window.setTimeout(() => {
      if (timelineLoadTokenRef.current !== loadToken) return;

      if (!selectedAudio) {
        setTimeline(null);
        setPreviewState("idle");
        setPreviewMessage("No preview audio is available.");
        setActiveLyric("");
        return;
      }

      setPreviewState("baking");
      setPreviewMessage("Baking deterministic audio and lyric timelines…");
      setActiveLyric("");

      void bakePreviewSourceTimeline({
        audioUrl: selectedAudio.url,
        lrcUrl: selectedLrc?.url ?? null,
        fps: safeFps,
      })
        .then((nextTimeline) => {
          if (timelineLoadTokenRef.current !== loadToken) return;

          setTimeline(nextTimeline);
          updatePreviewTime(0);

          const audio = audioRef.current;
          if (audio) audio.currentTime = 0;

          setPreviewMessage(
            `Timeline ready · ${nextTimeline.audioFrames.length.toLocaleString()} frames`,
          );
        })
        .catch((error: unknown) => {
          if (timelineLoadTokenRef.current !== loadToken) return;

          setTimeline(null);
          setPreviewState("error");
          setPreviewMessage(
            error instanceof Error
              ? error.message
              : "The preview timeline could not be baked.",
          );
        });
    }, 0);

    return () => {
      window.clearTimeout(startLoadTimer);

      if (timelineLoadTokenRef.current === loadToken) {
        timelineLoadTokenRef.current += 1;
      }
    };
  }, [
    safeFps,
    selectedAudio,
    selectedLrc,
    timelineReloadToken,
    updatePreviewTime,
  ]);

  useEffect(() => {
    if (!timeline || !rendererApiReady) return;

    const timeoutId = window.setTimeout(() => {
      void rebuildPreview(previewTimeRef.current);
    }, 80);

    return () => window.clearTimeout(timeoutId);
  }, [
    manualReloadToken,
    rebuildPreview,
    rendererApiReady,
    sourceRevision,
    timeline,
  ]);

  useEffect(() => {
    if (!isPlaying || !timeline) return;

    let rafId = 0;
    let cancelled = false;
    let lastRenderAtMs = 0;

    const minimumFrameIntervalMs = 1000 / safeFps;

    const tick = (nowMs: number): void => {
      if (cancelled) return;

      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) {
        setIsPlaying(false);
        return;
      }

      if (
        document.visibilityState === "visible" &&
        nowMs - lastRenderAtMs >= minimumFrameIntervalMs
      ) {
        lastRenderAtMs = nowMs;
        renderPreparedFrame(audio.currentTime);
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying, renderPreparedFrame, safeFps, timeline]);

  const handleSeek = useCallback(
    (timeSec: number): void => {
      const clampedTime = clamp(timeSec, 0, durationSec);
      const audio = audioRef.current;

      if (audio) audio.currentTime = clampedTime;
      updatePreviewTime(clampedTime);

      if (!audio || audio.paused) {
        scheduleStaticRebuild(clampedTime);
      }
    },
    [durationSec, scheduleStaticRebuild, updatePreviewTime],
  );

  const previewBorder = previewBorderForState(previewState);

  const activeStyle = LYRIC_STYLES[selectedLyricStyle];

  return (
    <div style={{ display: "grid", gap: 14, minWidth: 0 }}>
      <canvas
        ref={renderCanvasRef}
        role="presentation"
        style={{
          position: "fixed",
          left: -10000,
          top: -10000,
          width: 1,
          height: 1,
          pointerEvents: "none",
          opacity: 0,
        }}
      />

      <section
        style={{
          overflow: "hidden",
          border: `1px solid ${previewBorder}`,
          borderRadius: 18,
          background: "rgba(255,255,255,0.025)",
          boxShadow: "0 28px 90px rgba(0,0,0,0.42)",
        }}
      >
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 16,
            alignItems: "center",
            padding: "12px 14px",
            borderBottom: "1px solid rgba(255,255,255,0.09)",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 1.4,
                textTransform: "uppercase",
                opacity: 0.52,
              }}
            >
              Live composition
            </div>
            <div style={{ marginTop: 4, fontSize: 13, opacity: 0.86 }}>
              {previewMessage}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "flex-end",
              flexWrap: "wrap",
            }}
          >
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 11,
                opacity: 0.78,
              }}
            >
              <span>Preview</span>
              <select
                value={previewQuality}
                onChange={(event) =>
                  setPreviewQuality(event.target.value as PreviewQualityName)
                }
              >
                {PREVIEW_QUALITY_NAMES.map((qualityName) => (
                  <option key={qualityName} value={qualityName}>
                    {PREVIEW_QUALITY_CONFIG[qualityName].label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => setTimelineReloadToken((value) => value + 1)}
              disabled={!selectedAudio}
            >
              Rebake source
            </button>
            <button
              type="button"
              onClick={() => setManualReloadToken((value) => value + 1)}
              disabled={!timeline || !rendererApiReady}
            >
              Reload code
            </button>
          </div>
        </header>

        <div
          style={{
            position: "relative",
            aspectRatio: `${safeWidth} / ${safeHeight}`,
            width: "100%",
            background: "#000",
          }}
        >
          <canvas
            ref={previewCanvasRef}
            width={safeWidth}
            height={safeHeight}
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              background: "#000",
            }}
          />

          {previewState !== "ready" ? (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                padding: 24,
                textAlign: "center",
                background: "rgba(0,0,0,0.28)",
                color: "rgba(255,255,255,0.72)",
                fontSize: 13,
              }}
            >
              {previewMessage}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            padding: 14,
            borderTop: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <audio
            ref={audioRef}
            src={selectedAudio?.url}
            preload="metadata"
            onPlay={() => setIsPlaying(true)}
            onPause={() => {
              setIsPlaying(false);
              const audio = audioRef.current;
              if (audio) scheduleStaticRebuild(audio.currentTime);
            }}
            onEnded={() => setIsPlaying(false)}
            onSeeked={() => {
              const audio = audioRef.current;
              if (audio) scheduleStaticRebuild(audio.currentTime);
            }}
            onLoadedMetadata={() => {
              const audio = audioRef.current;
              if (audio) updatePreviewTime(audio.currentTime);
            }}
            style={{ width: "100%" }}
            controls
          >
            <track
              kind="captions"
              src={captionTrackSrc}
              label="Lyric captions"
              default
            />
          </audio>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 10,
              alignItems: "center",
            }}
          >
            <input
              type="range"
              min={0}
              max={Math.max(durationSec, 0.01)}
              step={1 / safeFps}
              value={clamp(previewTimeSec, 0, Math.max(durationSec, 0.01))}
              onChange={(event) => handleSeek(Number(event.target.value))}
              disabled={!timeline}
              aria-label="Preview playhead"
              style={{ width: "100%" }}
            />

            <div
              style={{
                minWidth: 112,
                textAlign: "right",
                fontVariantNumeric: "tabular-nums",
                fontSize: 12,
                opacity: 0.68,
              }}
            >
              {formatTime(previewTimeSec)} / {formatTime(durationSec)}
            </div>
          </div>

          <div
            style={{
              minHeight: 24,
              fontFamily: activeStyle.fontFamily ?? FALLBACK_FONT,
              fontWeight: activeStyle.fontWeight ?? 700,
              letterSpacing: activeStyle.letterSpacingPx ?? 0,
              fontSize: 18,
              textAlign: "center",
              color: "rgba(255,255,255,0.82)",
            }}
          >
            {activeLyric || "The current lyric line will appear here."}
          </div>
        </div>
      </section>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          fontSize: 11,
          opacity: 0.46,
        }}
      >
        <span>{rendererMessage}</span>

        <span>
          {renderFormatProfile.label} · {previewProfile.label} preview:{" "}
          {safeWidth}×{safeHeight} @ {safeFps}fps · export: {exportWidth}×
          {exportHeight} @ {exportFps}fps
        </span>

        <span>
          Seeking resets the preview simulation; final export remains the exact
          sequential render.
        </span>
      </div>
    </div>
  );
}
