import "server-only";

import { sql } from "@vercel/postgres";

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

export async function getRecordingPlayCountsByRecordingIds(
  recordingIds: string[],
): Promise<Record<string, number>> {
  const ids = Array.from(
    new Set(
      recordingIds
        .map(asTrimmedRecordingId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  if (!ids.length) return {};

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
