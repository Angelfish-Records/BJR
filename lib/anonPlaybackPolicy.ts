import "server-only";

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;

  return parsed;
}

export const ANON_PLAYBACK_POLICY = {
  distinctTrackCap: readPositiveIntEnv("ANON_DISTINCT_TRACK_CAP", 3),
  windowDays: readPositiveIntEnv("ANON_PLAYBACK_WINDOW_DAYS", 30),
} as const;

export function hasReachedAnonPlaybackCap(params: {
  distinctCompletedTracks: number;
}): boolean {
  return (
    params.distinctCompletedTracks >= ANON_PLAYBACK_POLICY.distinctTrackCap
  );
}