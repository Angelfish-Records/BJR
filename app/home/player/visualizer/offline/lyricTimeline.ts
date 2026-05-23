import type { LyricCue, LyricFrameState } from "./lyricTypes";

export type LyricTimelineConfig = {
  cues: LyricCue[];
  fps: number;
  durationSec: number;
  lineStartWindowSec?: number;
  lineEndWindowSec?: number;
  silenceRampSec?: number;
};

const DEFAULT_LINE_START_WINDOW_SEC = 0.12;
const DEFAULT_LINE_END_WINDOW_SEC = 0.16;
const DEFAULT_SILENCE_RAMP_SEC = 1.25;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function emptyLyricFrameState(
  previousText: string | null,
  nextText: string | null,
  timeToNextLineSec: number | null,
  silence01: number,
): LyricFrameState {
  return {
    activeLineIndex: null,
    activeText: null,
    previousText,
    nextText,
    lineProgress01: 0,
    lineAgeSec: 0,
    timeToNextLineSec,
    isLineStart: false,
    isLineEnd: false,
    silence01,
  };
}

function findActiveCueIndex(cues: LyricCue[], time: number): number | null {
  let activeIndex: number | null = null;

  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    if (!cue) continue;

    const endSec = cue.endSec ?? Number.POSITIVE_INFINITY;
    if (time >= cue.startSec && time < endSec) {
      activeIndex = i;
      break;
    }

    if (cue.startSec > time) break;
  }

  return activeIndex;
}

function findPreviousCue(cues: LyricCue[], time: number): LyricCue | null {
  let previous: LyricCue | null = null;

  for (const cue of cues) {
    if (cue.startSec <= time) previous = cue;
    else break;
  }

  return previous;
}

function findNextCue(cues: LyricCue[], time: number): LyricCue | null {
  for (const cue of cues) {
    if (cue.startSec > time) return cue;
  }

  return null;
}

export function bakeLyricFrameStates(
  config: LyricTimelineConfig,
): LyricFrameState[] {
  const {
    cues,
    fps,
    durationSec,
    lineStartWindowSec = DEFAULT_LINE_START_WINDOW_SEC,
    lineEndWindowSec = DEFAULT_LINE_END_WINDOW_SEC,
    silenceRampSec = DEFAULT_SILENCE_RAMP_SEC,
  } = config;

  if (!Number.isFinite(fps) || fps <= 0) {
    throw new Error(`Invalid FPS for lyric timeline bake: ${fps}`);
  }

  if (!Number.isFinite(durationSec) || durationSec < 0) {
    throw new Error(`Invalid duration for lyric timeline bake: ${durationSec}`);
  }

  const frameCount = Math.ceil(durationSec * fps);
  const frames: LyricFrameState[] = [];

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const time = frameIndex / fps;
    const activeCueIndex = findActiveCueIndex(cues, time);
    const previousCue = findPreviousCue(cues, time);
    const nextCue = findNextCue(cues, time);
    const timeToNextLineSec = nextCue
      ? Math.max(0, nextCue.startSec - time)
      : null;

    if (activeCueIndex === null) {
      const silenceDuration =
        timeToNextLineSec === null ? silenceRampSec : timeToNextLineSec;

      frames.push(
        emptyLyricFrameState(
          previousCue?.text ?? null,
          nextCue?.text ?? null,
          timeToNextLineSec,
          clamp01(silenceDuration / silenceRampSec),
        ),
      );

      continue;
    }

    const cue = cues[activeCueIndex];
    if (!cue) {
      throw new Error(`Missing lyric cue at index ${activeCueIndex}`);
    }

    if (cue.text.trim().length === 0) {
      frames.push(
        emptyLyricFrameState(
          cues[activeCueIndex - 1]?.text || null,
          cues[activeCueIndex + 1]?.text || null,
          timeToNextLineSec,
          clamp01((timeToNextLineSec ?? silenceRampSec) / silenceRampSec),
        ),
      );

      continue;
    }

    const cueEndSec = cue.endSec ?? durationSec;
    const cueDurationSec = Math.max(0.001, cueEndSec - cue.startSec);
    const lineAgeSec = Math.max(0, time - cue.startSec);
    const timeToLineEndSec = Math.max(0, cueEndSec - time);

    frames.push({
      activeLineIndex: cue.index,
      activeText: cue.text,
      previousText: cues[activeCueIndex - 1]?.text ?? null,
      nextText: cues[activeCueIndex + 1]?.text ?? null,
      lineProgress01: clamp01(lineAgeSec / cueDurationSec),
      lineAgeSec,
      timeToNextLineSec,
      isLineStart: lineAgeSec <= lineStartWindowSec,
      isLineEnd: timeToLineEndSec <= lineEndWindowSec,
      silence01: 0,
    });
  }

  return frames;
}
