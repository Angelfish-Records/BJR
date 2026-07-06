import "server-only";

import { unstable_cache } from "next/cache";
import { sql } from "@vercel/postgres";

const RECORDING_PLAY_COUNTS_REVALIDATE_SECONDS = 60;

type RecordingPlayCountRow = {
  recording_id: string;
  play_count: number | string | null;
};

function asTrimmedRecordingId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next ? next : null;
}

function asNonNegativeInt(value: number | string | null): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return 0;
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.floor(parsed);
  }

  return 0;
}

function normalizeRecordingIds(recordingIds: string[]): string[] {
  return Array.from(
    new Set(
      recordingIds
        .map(asTrimmedRecordingId)
        .filter((value): value is string => Boolean(value)),
    ),
  ).sort((a, b) => a.localeCompare(b));
}

async function readRecordingPlayCounts(
  ids: string[],
): Promise<Record<string, number>> {
  if (ids.length === 0) return {};

  const placeholders = ids.map((_, index) => `$${index + 1}`).join(", ");

  const res = await sql.query<RecordingPlayCountRow>(
    `
      select
        recording_id,
        play_count
      from recording_listen_totals
      where recording_id in (${placeholders})
    `,
    ids,
  );

  const out: Record<string, number> = {};

  for (const row of res.rows) {
    const recordingId = asTrimmedRecordingId(row.recording_id);
    if (!recordingId) continue;

    out[recordingId] = asNonNegativeInt(row.play_count);
  }

  return out;
}

const getCachedRecordingPlayCountsByIds = unstable_cache(
  async (ids: string[]): Promise<Record<string, number>> => {
    return readRecordingPlayCounts(ids);
  },
  ["recording-play-counts-v1"],
  {
    revalidate: RECORDING_PLAY_COUNTS_REVALIDATE_SECONDS,
  },
);

export async function getRecordingPlayCountsByRecordingIds(
  recordingIds: string[],
): Promise<Record<string, number>> {
  const ids = normalizeRecordingIds(recordingIds);

  if (ids.length === 0) return {};

  return getCachedRecordingPlayCountsByIds(ids);
}