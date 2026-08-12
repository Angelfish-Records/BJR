// web/app/home/player/visualizer/offline/textTimeline.ts

import type { LyricFrameState } from "./lyricTypes";

export type TextRenderMode = "lyrics" | "promo" | "none";

export const TEXT_RENDER_MODES: readonly TextRenderMode[] = [
  "lyrics",
  "promo",
  "none",
];

export function isTextRenderMode(value: string): value is TextRenderMode {
  return TEXT_RENDER_MODES.includes(value as TextRenderMode);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function emptyTextFrame(): LyricFrameState {
  return {
    activeLineIndex: null,
    activeText: null,
    previousText: null,
    nextText: null,
    lineProgress01: 0,
    lineAgeSec: 0,
    timeToNextLineSec: null,
    isLineStart: false,
    isLineEnd: false,
    silence01: 1,
  };
}

export function bakePromoTextFrameStates(input: {
  text: string;
  fps: number;
  durationSec: number;
  startSec?: number;
  endSec?: number;
  lineStartWindowSec?: number;
  lineEndWindowSec?: number;
}): LyricFrameState[] {
  const {
    fps,
    durationSec,
    lineStartWindowSec = 0.12,
    lineEndWindowSec = 0.16,
  } = input;

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`Invalid FPS for promo text timeline: ${fps}`);
  }

  if (!Number.isFinite(durationSec) || durationSec < 0) {
    throw new Error(
      `Invalid duration for promo text timeline: ${durationSec}`,
    );
  }

  const text = input.text.trim();
  const startSec = Math.max(0, input.startSec ?? 0);
  const endSec = Math.min(
    durationSec,
    input.endSec !== undefined && input.endSec > startSec
      ? input.endSec
      : durationSec,
  );
  const cueDurationSec = Math.max(0.001, endSec - startSec);
  const frameCount = Math.ceil(durationSec * fps);
  const frames: LyricFrameState[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const time = frameIndex / fps;

    if (!text || time < startSec || time >= endSec) {
      frames.push(emptyTextFrame());
      continue;
    }

    const lineAgeSec = Math.max(0, time - startSec);
    const timeToLineEndSec = Math.max(0, endSec - time);

    frames.push({
      activeLineIndex: 0,
      activeText: text,
      previousText: null,
      nextText: null,
      lineProgress01: clamp01(lineAgeSec / cueDurationSec),
      lineAgeSec,
      timeToNextLineSec: null,
      isLineStart: lineAgeSec <= lineStartWindowSec,
      isLineEnd: timeToLineEndSec <= lineEndWindowSec,
      silence01: 0,
    });
  }

  return frames;
}
