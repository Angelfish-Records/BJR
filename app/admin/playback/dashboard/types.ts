// web/app/admin/playback/dashboard/types.ts
import type { PlaybackAdminSnapshot } from "@/lib/playbackAdmin";

export type TrackRow = PlaybackAdminSnapshot["topTracksByListenedMs"][number];
export type DedupeRowBase = PlaybackAdminSnapshot["recentDedupe"][number];
export type TrendRangeKey = keyof PlaybackAdminSnapshot["qualifiedPlayTrends"];
export type TrendBucket =
  PlaybackAdminSnapshot["qualifiedPlayTrends"][TrendRangeKey]["buckets"][number];

export type DedupeRow = DedupeRowBase & {
  recordingTitle?: string | null;
  trackTitle?: string | null;
  memberEmail?: string | null;
  shareTokenLabel?: string | null;
};

export type DedupeSessionRow = {
  groupKey: string;
  playbackId: string;
  audience: "member" | "anonymous";
  memberId: string | null;
  memberEmail: string | null;
  recordingId: string | null;
  recordingTitle: string | null;
  createdAt: string;
  latestAt: string;
  progressMs: number;
  progressPct: number;
  creditedMilestoneCount: number;
  hasPlay: boolean;
  hasComplete: boolean;
  statusLabel: string;
  sourceRows: DedupeRow[];
};

export type ChartPoint = {
  x: number;
  y: number;
};
