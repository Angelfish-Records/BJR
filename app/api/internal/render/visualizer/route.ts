// web/app/api/internal/render/visualizer/route.ts
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { NextResponse } from "next/server";

import {
  isLyricStyleName,
  type LyricStyleName,
} from "../../../../home/player/visualizer/offline/lyricStyles";
import {
  isPostPresetName,
  type PostPresetName,
} from "../../../../home/player/visualizer/offline/postStyles";
import {
  inferRenderFormatName,
  isRenderFormatName,
  type RenderFormatName,
} from "../../../../home/player/visualizer/offline/renderFormats";
import { directionSidecarFilenameForLrc } from "../../../../home/player/visualizer/offline/lyricDirections";
import {
  isTextRenderMode,
  type TextRenderMode,
} from "../../../../home/player/visualizer/offline/textTimeline";

export const runtime = "nodejs";

type ThemeName =
  | "nebula"
  | "gravitational-lattice"
  | "filament-storm"
  | "mosaic-drift"
  | "meaning-leak"
  | "orbital-script"
  | "mhd-silk"
  | "pressure-glass"
  | "reaction-veins"
  | "reaction-veins-2"
  | "topographic-memory"
  | "magnetic-particulate"
  | "event-horizon"
  | "signal-decay"
  | "crystalline-growth"
  | "singularity-nursery"
  | "reef-wall"
  | "crystal-cathedral"
  | "wormhole-throat";

type RenderRequest = {
  recordingId: string;
  themeName: ThemeName;
  audioFile: string;
  lrcFile?: string;
  lyricDirectionsFile?: string;
  textMode?: TextRenderMode;
  promoText?: string;
  lyricStyleName?: LyricStyleName;
  postPresetName?: PostPresetName;
  renderFormatName?: RenderFormatName;
  width: number;
  height: number;
  fps: number;
  seed: number;
  crf: number;
  writeProRes: boolean;
  startSec?: number;
  endSec?: number;
};

type RenderAssetOption = {
  file: string;
  url: string;
  path: string;
};

const THEMES: ThemeName[] = [
  "nebula",
  "gravitational-lattice",
  "filament-storm",
  "mosaic-drift",
  "meaning-leak",
  "orbital-script",
  "mhd-silk",
  "pressure-glass",
  "reaction-veins",
  "reaction-veins-2",
  "topographic-memory",
  "magnetic-particulate",
  "event-horizon",
  "signal-decay",
  "crystalline-growth",
  "singularity-nursery",
  "reef-wall",
  "crystal-cathedral",
  "wormhole-throat",
];

const PREVIEW_SOURCE_EXTENSIONS = /\.(css|ts|tsx)$/i;

async function latestSourceMtimeMs(pathname: string): Promise<number> {
  let stat: Awaited<ReturnType<typeof fs.stat>>;

  try {
    stat = await fs.stat(pathname);
  } catch {
    return 0;
  }

  if (stat.isFile()) {
    return PREVIEW_SOURCE_EXTENSIONS.test(pathname) ? stat.mtimeMs : 0;
  }

  if (!stat.isDirectory()) return 0;

  const entries = await fs.readdir(pathname, { withFileTypes: true });
  let latest = stat.mtimeMs;

  for (const entry of entries) {
    const childPath = path.join(pathname, entry.name);

    if (entry.isDirectory()) {
      latest = Math.max(latest, await latestSourceMtimeMs(childPath));
      continue;
    }

    if (entry.isFile() && PREVIEW_SOURCE_EXTENSIONS.test(entry.name)) {
      const childStat = await fs.stat(childPath);
      latest = Math.max(latest, childStat.mtimeMs);
    }
  }

  return latest;
}

async function getPreviewSourceRevision(): Promise<string> {
  const candidates = [
    path.resolve("app/home/player/visualizer/themes"),
    path.resolve("app/home/player/visualizer/core"),
    path.resolve("app/home/player/visualizer/offline"),
    path.resolve("app/globals.css"),
    path.resolve("web/app/home/player/visualizer/themes"),
    path.resolve("web/app/home/player/visualizer/core"),
    path.resolve("web/app/home/player/visualizer/offline"),
    path.resolve("web/app/globals.css"),
  ];

  let latest = 0;

  for (const candidate of candidates) {
    latest = Math.max(latest, await latestSourceMtimeMs(candidate));
  }

  return String(Math.floor(latest));
}

function isThemeName(value: string): value is ThemeName {
  return THEMES.includes(value as ThemeName);
}

function safeStem(filename: string): string {
  return path
    .basename(filename, path.extname(filename))
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .slice(0, 80);
}

function assertNumber(
  name: string,
  value: number,
  min: number,
  max: number,
): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`Invalid ${name}: ${value}`);
  }
}

function runExport(
  manifestPath: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npm",
      ["run", "export:visualizer", "--", manifestPath],
      {
        cwd: path.resolve(process.cwd(), ".."),
        env: process.env,
      },
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", reject);

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Visualizer export failed with code ${code}\n\n${stdout}\n\n${stderr}`,
          ),
        );
      }
    });
  });
}

async function listRenderAssets(
  extensions: RegExp,
): Promise<RenderAssetOption[]> {
  const candidates = [
    path.resolve("web/public/render-test"),
    path.resolve("public/render-test"),
  ];

  let dir = candidates[0] ?? path.resolve("web/public/render-test");

  for (const candidate of candidates) {
    try {
      const entries = await fs.readdir(candidate, { withFileTypes: true });
      const hasMatchingAsset = entries.some(
        (entry) => entry.isFile() && extensions.test(entry.name),
      );

      if (hasMatchingAsset) {
        dir = candidate;
        break;
      }
    } catch {
      // Keep looking; the directory may not exist yet.
    }
  }

  await fs.mkdir(dir, { recursive: true });

  const entries = await fs.readdir(dir, { withFileTypes: true });
  const publicRoot =
    path.basename(path.dirname(dir)) === "public"
      ? path.dirname(dir)
      : path.resolve("web/public");

  return entries
    .filter((entry) => entry.isFile())
    .filter((entry) => extensions.test(entry.name))
    .map((entry): RenderAssetOption => {
      const absolutePath = path.join(dir, entry.name);
      const relativePublicPath = path.relative(publicRoot, absolutePath);

      return {
        file: entry.name,
        url: `/${relativePublicPath.split(path.sep).join("/")}`,
        path: absolutePath,
      };
    });
}

async function listAudioFiles(): Promise<RenderAssetOption[]> {
  return listRenderAssets(/\.(wav|wave|mp3|aiff|aif|flac)$/i);
}

async function listLrcFiles(): Promise<RenderAssetOption[]> {
  return listRenderAssets(/\.lrc$/i);
}

async function listLyricDirectionFiles(): Promise<RenderAssetOption[]> {
  return listRenderAssets(/\.lyric-directions\.json$/i);
}

function assertThemeName(themeName: string): void {
  if (!isThemeName(themeName)) {
    throw new Error(`Invalid themeName: ${themeName}`);
  }
}

function resolveAudioAsset(
  audioFiles: readonly RenderAssetOption[],
  audioFile: string,
): RenderAssetOption {
  const audio = audioFiles.find((item) => item.file === audioFile);

  if (!audio) {
    throw new Error(
      `Audio file not found in web/public/render-test: ${audioFile}`,
    );
  }

  return audio;
}

function resolveLrcAsset(
  lrcFiles: readonly RenderAssetOption[],
  lrcFile: string | undefined,
): RenderAssetOption | undefined {
  if (!lrcFile || lrcFile === "__none__") {
    return undefined;
  }

  const lrc = lrcFiles.find((item) => item.file === lrcFile);

  if (!lrc) {
    throw new Error(`LRC file not found in web/public/render-test: ${lrcFile}`);
  }

  return lrc;
}

function resolveLyricDirectionsAsset(
  files: readonly RenderAssetOption[],
  lrc: RenderAssetOption | undefined,
  requestedFile: string | undefined,
): RenderAssetOption | undefined {
  if (!lrc || requestedFile === "__none__") {
    return undefined;
  }

  const isAuto = !requestedFile || requestedFile === "__auto__";
  const filename = isAuto
    ? directionSidecarFilenameForLrc(lrc.file)
    : requestedFile;
  const asset = files.find((item) => item.file === filename);

  if (!asset && !isAuto) {
    throw new Error(
      `Lyric directions file not found in web/public/render-test: ${filename}`,
    );
  }

  return asset;
}

function assertPromoSettings(
  body: RenderRequest,
  textMode: TextRenderMode,
): void {
  if (textMode !== "promo") return;

  if (!body.promoText?.trim()) {
    throw new Error("promoText is required when textMode is promo");
  }

  if (body.startSec === undefined || body.endSec === undefined) {
    throw new Error(
      "Promo exports require both startSec and endSec",
    );
  }
}

function assertRenderSettings(body: RenderRequest): void {
  const textMode = body.textMode ?? "lyrics";

  if (!isTextRenderMode(textMode)) {
    throw new Error(`Invalid textMode: ${String(body.textMode)}`);
  }

  if (
    body.lyricStyleName !== undefined &&
    !isLyricStyleName(body.lyricStyleName)
  ) {
    throw new Error(`Invalid lyricStyleName: ${body.lyricStyleName}`);
  }

  if (
    body.postPresetName !== undefined &&
    !isPostPresetName(body.postPresetName)
  ) {
    throw new Error(`Invalid postPresetName: ${body.postPresetName}`);
  }

  if (
    body.renderFormatName !== undefined &&
    !isRenderFormatName(body.renderFormatName)
  ) {
    throw new Error(`Invalid renderFormatName: ${body.renderFormatName}`);
  }

  assertNumber("width", body.width, 16, 7680);
  assertNumber("height", body.height, 16, 4320);
  assertNumber("fps", body.fps, 1, 120);
  assertNumber("seed", body.seed, 0, 2147483647);
  assertNumber("crf", body.crf, 0, 51);

  if (body.startSec !== undefined) {
    assertNumber("startSec", body.startSec, 0, 60 * 60);
  }

  if (body.endSec !== undefined) {
    assertNumber("endSec", body.endSec, 0, 60 * 60);
  }

  if (
    body.startSec !== undefined &&
    body.endSec !== undefined &&
    body.endSec <= body.startSec
  ) {
    throw new Error("endSec must be greater than startSec");
  }

  assertPromoSettings(body, textMode);
}

export async function GET(req: Request): Promise<NextResponse> {
  const sourceRevision = await getPreviewSourceRevision();
  const requestUrl = new URL(req.url);

  if (requestUrl.searchParams.get("mode") === "revision") {
    return NextResponse.json(
      { sourceRevision },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const [audioFiles, lrcFiles, lyricDirectionFiles] = await Promise.all([
    listAudioFiles(),
    listLrcFiles(),
    listLyricDirectionFiles(),
  ]);

  return NextResponse.json(
    {
      themes: THEMES,
      audioFiles,
      lrcFiles,
      lyricDirectionFiles,
      sourceRevision,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as RenderRequest;

    assertThemeName(body.themeName);

    const [audioFiles, lrcFiles, lyricDirectionFiles] = await Promise.all([
      listAudioFiles(),
      listLrcFiles(),
      listLyricDirectionFiles(),
    ]);

    assertRenderSettings(body);

    const textMode = body.textMode ?? "lyrics";
    const audio = resolveAudioAsset(audioFiles, body.audioFile);
    const lrc =
      textMode === "lyrics"
        ? resolveLrcAsset(lrcFiles, body.lrcFile)
        : undefined;
    const lyricDirections =
      textMode === "lyrics"
        ? resolveLyricDirectionsAsset(
            lyricDirectionFiles,
            lrc,
            body.lyricDirectionsFile,
          )
        : undefined;

    const recordingId = body.recordingId.trim() || safeStem(body.audioFile);
    const textVariant =
      textMode === "lyrics" ? "" : `_${textMode}`;
    const outputDir =
      `exports/${recordingId}${textVariant}_${body.themeName}`;
    const renderFormatName =
      body.renderFormatName ?? inferRenderFormatName(body.width, body.height);

    const manifest = {
      recordingId,
      themeName: body.themeName,
      renderFormatName,
      seed: Math.floor(body.seed),
      width: Math.floor(body.width),
      height: Math.floor(body.height),
      fps: body.fps,
      audioUrl: audio.url,
      audioPath: audio.path,
      lrcUrl: lrc?.url,
      lrcPath: lrc?.path,
      lyricDirectionsUrl: lyricDirections?.url,
      lyricDirectionsPath: lyricDirections?.path,
      textMode,
      promoText: textMode === "promo" ? body.promoText?.trim() : undefined,
      lyricStyleName: body.lyricStyleName,
      postPresetName: body.postPresetName,
      outputDir,
      crf: body.crf,
      cleanFrames: true,
      writeFrameHashes: true,
      reuseAudioFeatures: true,
      writeProRes: body.writeProRes,
      startSec: body.startSec,
      endSec: body.endSec,
    };

    const repoRoot = path.resolve(process.cwd(), "..");
    const manifestDir = path.resolve(
      repoRoot,
      "tools/video-export/manifests/generated",
    );
    await fs.mkdir(manifestDir, { recursive: true });

    const manifestPath = path.join(
      manifestDir,
      `${recordingId}_${body.themeName}.json`,
    );

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await runExport(manifestPath);

    return NextResponse.json({
      ok: true,
      manifestPath,
      outputDir,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown render error",
      },
      { status: 500 },
    );
  }
}
