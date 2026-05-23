// web/app/internal/render/visualizer/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { FramePostProcessor } from "../../../home/player/visualizer/offline/FramePostProcessor";
import { LyricTextRenderer } from "../../../home/player/visualizer/offline/LyricTextRenderer";
import {
  LYRIC_STYLE_NAMES,
  LYRIC_STYLES,
  type LyricStyleName,
} from "../../../home/player/visualizer/offline/lyricStyles";
import {
  POST_PRESET_NAMES,
  POST_STYLES,
  type PostPresetName,
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

export default function InternalVisualizerRenderPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<OfflineVisualizerRenderer | null>(null);
  const lyricRendererRef = useRef<LyricTextRenderer | null>(null);
  const postProcessorRef = useRef<FramePostProcessor | null>(null);
  const pixelBufferRef = useRef<Uint8Array | null>(null);
  const lastFrameRef = useRef<OfflineFrame | null>(null);
  const [, setStatus] = useState<RendererStatus>("idle");
  const [message, setMessage] = useState("Renderer not initialised");
  const [themes, setThemes] = useState<string[]>([]);
  const [audioFiles, setAudioFiles] = useState<AudioFileOption[]>([]);
  const [lrcFiles, setLrcFiles] = useState<AudioFileOption[]>([]);
  const [selectedTheme, setSelectedTheme] = useState("nebula");
  const [selectedAudioFile, setSelectedAudioFile] = useState("");
  const [selectedLrcFile, setSelectedLrcFile] = useState("__none__");
  const [selectedLyricStyle, setSelectedLyricStyle] = useState<LyricStyleName>(
    "ghost-lit-devotional",
  );
  const [selectedPostPreset, setSelectedPostPreset] =
    useState<PostPresetName>("gold-devotional");
  const [recordingId, setRecordingId] = useState("test_render");
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
          rendererRef.current = null;
          lyricRendererRef.current = null;
          postProcessorRef.current = null;
          pixelBufferRef.current = null;
          lastFrameRef.current = null;

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

          const renderer = new OfflineVisualizerRenderer(gl, config);
          await renderer.init();

          rendererRef.current = renderer;
          pixelBufferRef.current = new Uint8Array(
            config.width * config.height * 4,
          );
          lyricRendererRef.current = new LyricTextRenderer(
            config.width,
            config.height,
            config.lyricStyleName
              ? LYRIC_STYLES[config.lyricStyleName]
              : undefined,
          );
          postProcessorRef.current = new FramePostProcessor(
            config.width,
            config.height,
            config.postPresetName
              ? POST_STYLES[config.postPresetName]
              : POST_STYLES.none,
          );

          setStatus("ready");
          setMessage(
            `Ready: ${config.themeName} ${config.width}×${config.height} @ ${config.fps}fps`,
          );
        } catch (err) {
          setStatus("error");
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

        const lyric = lastFrameRef.current?.lyric;
        const lyricRenderer = lyricRendererRef.current;

        if (lyric && lyricRenderer) {
          lyricRenderer.compositeIntoRgbaBuffer(buffer, lyric);
        }

        const camera = lastFrameRef.current?.camera;
        const postProcessor = postProcessorRef.current;
        const frameIndex = lastFrameRef.current?.frameIndex ?? 0;

        if (postProcessor) {
          postProcessor.processIntoRgbaBuffer(buffer, frameIndex, camera);
        }

        return buffer;
      },

      dispose: () => {
        rendererRef.current?.dispose();
        rendererRef.current = null;
        lyricRendererRef.current = null;
        postProcessorRef.current = null;
        pixelBufferRef.current = null;
        lastFrameRef.current = null;
        setStatus("disposed");
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

    setMessage("Renderer API attached to window.__AFR_RENDERER__");

    return () => {
      rendererRef.current?.dispose();
      rendererRef.current = null;
      lyricRendererRef.current = null;
      postProcessorRef.current = null;
      pixelBufferRef.current = null;
      lastFrameRef.current = null;

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
          lyricStyleName: selectedLyricStyle,
          postPresetName: selectedPostPreset,
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
          gridTemplateColumns: "minmax(280px, 420px) 480px",
          gap: 24,
          alignItems: "start",
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
            <div>Lyric style</div>
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
            <div>Width</div>
            <input
              type="number"
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>Height</div>
            <input
              type="number"
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
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
            <div>Start sec optional</div>
            <input
              type="number"
              value={startSec}
              onChange={(event) => setStartSec(event.target.value)}
              placeholder="e.g. 40"
              style={{ width: "100%" }}
            />
          </label>

          <label>
            <div>End sec optional</div>
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
            />
            Write ProRes master
          </label>

          <button
            type="button"
            disabled={isExporting || !selectedAudioFile}
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

        <canvas
          ref={canvasRef}
          style={{
            width: 480,
            height: 270,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "black",
          }}
        />
      </section>
    </main>
  );
}
