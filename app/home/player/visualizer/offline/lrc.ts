import type { LyricCue } from "./lyricTypes";

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

function parseTimestampSec(
  minutesRaw: string,
  secondsRaw: string,
  fractionRaw: string | undefined,
): number {
  const minutes = Number(minutesRaw);
  const seconds = Number(secondsRaw);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    throw new Error(`Invalid LRC timestamp: ${minutesRaw}:${secondsRaw}`);
  }

  const fraction =
    fractionRaw === undefined
      ? 0
      : Number(`0.${fractionRaw.padEnd(3, "0").slice(0, 3)}`);

  return minutes * 60 + seconds + fraction;
}

export function parseLrc(input: string): LyricCue[] {
  const pending: Array<{ startSec: number; text: string }> = [];

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const matches = [...line.matchAll(TIMESTAMP_RE)];
    if (matches.length === 0) continue;

    const text = line.replace(TIMESTAMP_RE, "").trim();

    for (const match of matches) {
      const minutesRaw = match[1];
      const secondsRaw = match[2];

      if (minutesRaw === undefined || secondsRaw === undefined) continue;

      pending.push({
        startSec: parseTimestampSec(minutesRaw, secondsRaw, match[3]),
        text,
      });
    }
  }

  pending.sort((a, b) => a.startSec - b.startSec);

  return pending.map((cue, index): LyricCue => {
    const next = pending[index + 1];

    return {
      index,
      startSec: cue.startSec,
      endSec: next ? next.startSec : null,
      text: cue.text,
    };
  });
}