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
  | "crystalline-growth";

type RenderRequest = {
  recordingId: string;
  themeName: ThemeName;
  audioFile: string;
  lrcFile?: string;
  lyricStyleName?: LyricStyleName;
  postPresetName?: PostPresetName;
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
];

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

export async function GET(): Promise<NextResponse> {
  const [audioFiles, lrcFiles] = await Promise.all([
    listAudioFiles(),
    listLrcFiles(),
  ]);

  return NextResponse.json({
    themes: THEMES,
    audioFiles,
    lrcFiles,
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body = (await req.json()) as RenderRequest;

    if (!isThemeName(body.themeName)) {
      throw new Error(`Invalid themeName: ${body.themeName}`);
    }

    const [audioFiles, lrcFiles] = await Promise.all([
      listAudioFiles(),
      listLrcFiles(),
    ]);

    const audio = audioFiles.find((item) => item.file === body.audioFile);
    if (!audio) {
      throw new Error(
        `Audio file not found in web/public/render-test: ${body.audioFile}`,
      );
    }

    const lrc =
      body.lrcFile && body.lrcFile !== "__none__"
        ? lrcFiles.find((item) => item.file === body.lrcFile)
        : undefined;

    if (body.lrcFile && body.lrcFile !== "__none__" && !lrc) {
      throw new Error(
        `LRC file not found in web/public/render-test: ${body.lrcFile}`,
      );
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

    const recordingId = body.recordingId.trim() || safeStem(body.audioFile);
    const outputDir = `exports/${recordingId}_${body.themeName}`;

    const manifest = {
      recordingId,
      themeName: body.themeName,
      seed: Math.floor(body.seed),
      width: Math.floor(body.width),
      height: Math.floor(body.height),
      fps: body.fps,
      audioUrl: audio.url,
      audioPath: audio.path,
      lrcUrl: lrc?.url,
      lrcPath: lrc?.path,
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
