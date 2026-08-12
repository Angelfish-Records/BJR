// web/app/home/player/visualizer/offline/lyricDirections.ts

import type { LyricTextStyle } from "./LyricTextRenderer";
import {
  isLyricStyleName,
  type LyricStyleName,
} from "./lyricStyles";
import type {
  LyricDirection,
  LyricFrameState,
} from "./lyricTypes";

export type LyricDirectionCue = {
  lineIndex: number | null;
  atSec: number | null;
  direction: LyricDirection;
};

export type LyricDirectionsDocument = {
  version: 1;
  cues: LyricDirectionCue[];
};

const MATCH_TOLERANCE_SEC = 0.15;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(
  value: unknown,
  label: string,
  min: number,
  max: number,
): number | undefined {
  if (value === undefined) return undefined;

  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }

  if (value < min || value > max) {
    throw new Error(`${label} must be between ${min} and ${max}`);
  }

  return value;
}

function parseTimestamp(value: string): number {
  const parts = value.trim().split(":");

  if (parts.length < 2 || parts.length > 3) {
    throw new Error(`Invalid lyric direction timestamp: ${value}`);
  }

  const numbers = parts.map((part) => Number(part));

  if (numbers.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new Error(`Invalid lyric direction timestamp: ${value}`);
  }

  if (numbers.length === 2) {
    const minutes = numbers[0] ?? 0;
    const seconds = numbers[1] ?? 0;
    return minutes * 60 + seconds;
  }

  const hours = numbers[0] ?? 0;
  const minutes = numbers[1] ?? 0;
  const seconds = numbers[2] ?? 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function parseAtSec(value: unknown, label: string): number | null {
  if (value === undefined) return null;

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${label} must be a non-negative number or timestamp`);
    }
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    return parseTimestamp(value);
  }

  throw new Error(`${label} must be a non-negative number or timestamp`);
}

function parseLineIndex(value: unknown, label: string): number | null {
  if (value === undefined) return null;

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a 1-based positive integer`);
  }

  return value - 1;
}

function parseDirection(
  raw: Record<string, unknown>,
  label: string,
): LyricDirection {
  const styleRaw = raw.style ?? raw.styleName;
  let styleName: LyricStyleName | undefined;

  if (styleRaw !== undefined) {
    if (typeof styleRaw !== "string" || !isLyricStyleName(styleRaw)) {
      throw new Error(`${label}.style is not a registered lyric style`);
    }
    styleName = styleRaw;
  }

  const revealRaw = raw.reveal ?? raw.revealMode;
  let revealMode: LyricDirection["revealMode"];

  if (revealRaw !== undefined) {
    if (revealRaw !== "none" && revealRaw !== "line-wipe") {
      throw new Error(`${label}.reveal must be "none" or "line-wipe"`);
    }
    revealMode = revealRaw;
  }

  const fontScale = readFiniteNumber(
    raw.fontScale,
    `${label}.fontScale`,
    0.25,
    4,
  );
  const anchorX01 = readFiniteNumber(
    raw.anchorX01,
    `${label}.anchorX01`,
    0,
    1,
  );
  const anchorY01 = readFiniteNumber(
    raw.anchorY01,
    `${label}.anchorY01`,
    0,
    1,
  );
  const maxWidth01 = readFiniteNumber(
    raw.maxWidth01,
    `${label}.maxWidth01`,
    0.1,
    1,
  );
  const previousGhostOpacity = readFiniteNumber(
    raw.previousGhostOpacity,
    `${label}.previousGhostOpacity`,
    0,
    1,
  );
  const nextEchoOpacity = readFiniteNumber(
    raw.nextEchoOpacity,
    `${label}.nextEchoOpacity`,
    0,
    1,
  );

  return {
    ...(styleName ? { styleName } : {}),
    ...(fontScale !== undefined ? { fontScale } : {}),
    ...(anchorX01 !== undefined ? { anchorX01 } : {}),
    ...(anchorY01 !== undefined ? { anchorY01 } : {}),
    ...(maxWidth01 !== undefined ? { maxWidth01 } : {}),
    ...(previousGhostOpacity !== undefined ? { previousGhostOpacity } : {}),
    ...(nextEchoOpacity !== undefined ? { nextEchoOpacity } : {}),
    ...(revealMode ? { revealMode } : {}),
  };
}

export function parseLyricDirections(input: string): LyricDirectionsDocument {
  let raw: unknown;

  try {
    raw = JSON.parse(input) as unknown;
  } catch {
    throw new Error("Lyric directions sidecar is not valid JSON");
  }

  if (!isRecord(raw)) {
    throw new Error("Lyric directions sidecar must be a JSON object");
  }

  if (raw.version !== 1) {
    throw new Error("Lyric directions sidecar version must be 1");
  }

  if (!Array.isArray(raw.cues)) {
    throw new Error("Lyric directions sidecar must contain a cues array");
  }

  const cues = raw.cues.map((entry, index): LyricDirectionCue => {
    const label = `cues[${index}]`;

    if (!isRecord(entry)) {
      throw new Error(`${label} must be an object`);
    }

    const lineIndex = parseLineIndex(entry.line, `${label}.line`);
    const atSec = parseAtSec(entry.at, `${label}.at`);

    if ((lineIndex === null) === (atSec === null)) {
      throw new Error(`${label} must specify exactly one of "line" or "at"`);
    }

    return {
      lineIndex,
      atSec,
      direction: parseDirection(entry, label),
    };
  });

  return {
    version: 1,
    cues,
  };
}

function lineStartTimes(
  frames: readonly LyricFrameState[],
  fps: number,
): Map<number, number> {
  const starts = new Map<number, number>();

  frames.forEach((frame, frameIndex) => {
    const lineIndex = frame.activeLineIndex;
    if (lineIndex === null || starts.has(lineIndex)) return;

    starts.set(
      lineIndex,
      Math.max(0, frameIndex / fps - Math.max(0, frame.lineAgeSec)),
    );
  });

  return starts;
}

function resolveCueLineIndex(
  cue: LyricDirectionCue,
  starts: ReadonlyMap<number, number>,
): number {
  if (cue.lineIndex !== null) {
    if (!starts.has(cue.lineIndex)) {
      throw new Error(
        `Lyric directions line ${cue.lineIndex + 1} does not exist in the LRC timeline`,
      );
    }

    return cue.lineIndex;
  }

  const atSec = cue.atSec;
  if (atSec === null) {
    throw new Error("Lyric direction cue has no line locator");
  }

  let closestLineIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const [lineIndex, startSec] of starts) {
    const distance = Math.abs(startSec - atSec);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestLineIndex = lineIndex;
    }
  }

  if (
    closestLineIndex === null ||
    closestDistance > MATCH_TOLERANCE_SEC
  ) {
    throw new Error(
      `No LRC cue starts within ${MATCH_TOLERANCE_SEC}s of lyric direction timestamp ${atSec.toFixed(3)}s`,
    );
  }

  return closestLineIndex;
}

export function applyLyricDirectionsToFrameStates(input: {
  frames: readonly LyricFrameState[];
  fps: number;
  directions: LyricDirectionsDocument;
}): LyricFrameState[] {
  if (!Number.isFinite(input.fps) || input.fps <= 0) {
    throw new Error(`Invalid FPS for lyric directions: ${input.fps}`);
  }

  if (input.directions.cues.length === 0) {
    return [...input.frames];
  }

  const starts = lineStartTimes(input.frames, input.fps);
  const directionByLine = new Map<number, LyricDirection>();

  for (const cue of input.directions.cues) {
    const lineIndex = resolveCueLineIndex(cue, starts);

    if (directionByLine.has(lineIndex)) {
      throw new Error(
        `Lyric directions contain more than one override for line ${lineIndex + 1}`,
      );
    }

    directionByLine.set(lineIndex, cue.direction);
  }

  return input.frames.map((frame) => {
    const lineIndex = frame.activeLineIndex;
    if (lineIndex === null) return frame;

    const direction = directionByLine.get(lineIndex);
    return direction ? { ...frame, direction } : frame;
  });
}

export function directionSidecarFilenameForLrc(lrcFilename: string): string {
  return lrcFilename.replace(/\.lrc$/i, ".lyric-directions.json");
}

export function directedLyricStyleName(
  baseStyleName: LyricStyleName,
  direction: LyricDirection | undefined,
): LyricStyleName {
  return direction?.styleName ?? baseStyleName;
}

export function applyLyricDirectionToStyle(
  style: Partial<LyricTextStyle>,
  direction: LyricDirection | undefined,
): Partial<LyricTextStyle> {
  if (!direction) return style;

  return {
    ...style,
    ...(direction.fontScale !== undefined && style.fontSizePx !== undefined
      ? { fontSizePx: style.fontSizePx * direction.fontScale }
      : {}),
    ...(direction.anchorX01 !== undefined
      ? { anchorX01: direction.anchorX01 }
      : {}),
    ...(direction.anchorY01 !== undefined
      ? { anchorY01: direction.anchorY01 }
      : {}),
    ...(direction.maxWidth01 !== undefined
      ? { maxWidth01: direction.maxWidth01 }
      : {}),
    ...(direction.previousGhostOpacity !== undefined
      ? { previousGhostOpacity: direction.previousGhostOpacity }
      : {}),
    ...(direction.nextEchoOpacity !== undefined
      ? { nextEchoOpacity: direction.nextEchoOpacity }
      : {}),
    ...(direction.revealMode !== undefined
      ? { revealMode: direction.revealMode }
      : {}),
  };
}
