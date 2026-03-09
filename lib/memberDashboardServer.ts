// web/lib/memberDashboardServer.ts
import "server-only";

import { sql } from "@vercel/postgres";
import { getRecordingSummaryByRecordingId } from "@/lib/albums";
import {
  emptyPortalMemberSummary,
  type MemberDashboardBadge,
  type PortalMemberFavouriteTrack,
  type PortalMemberSummary,
} from "@/lib/memberDashboard";
import { buildMemberIdentityState } from "@/lib/memberIdentityServer";

type MemberListenTotalsRow = {
  listened_ms: string | number;
};

type MemberFavouriteTrackRow = {
  recording_id: string;
  listened_ms: string | number;
  completed_count: number;
  last_listened_at: string | null;
};

async function getDashboardContributionCount(
  memberId: string,
): Promise<number | null> {
  const identityState = await buildMemberIdentityState(memberId);
  return identityState.exegesisProgress?.contributionCount ?? null;
}

async function getDashboardMinutesStreamed(
  memberId: string,
): Promise<number | null> {
  const res = await sql<MemberListenTotalsRow>`
    select listened_ms
    from member_listen_totals
    where member_id = ${memberId}::uuid
    limit 1
  `;

  const listenedMsRaw = res.rows[0]?.listened_ms;
  const listenedMs =
    typeof listenedMsRaw === "string"
      ? Number(listenedMsRaw)
      : Number(listenedMsRaw ?? 0);

  if (!Number.isFinite(listenedMs) || listenedMs <= 0) return null;
  return Math.floor(listenedMs / 60_000);
}

async function getDashboardFavouriteTrack(
  memberId: string,
): Promise<PortalMemberFavouriteTrack | null> {
  const statsRes = await sql<MemberFavouriteTrackRow>`
    select
      recording_id,
      listened_ms,
      completed_count,
      last_listened_at
    from member_track_listen_stats
    where member_id = ${memberId}::uuid
    order by
      listened_ms desc,
      completed_count desc,
      last_listened_at desc nulls last
    limit 1
  `;

  const stat = statsRes.rows[0];
  if (!stat?.recording_id) return null;

  const recording = await getRecordingSummaryByRecordingId(stat.recording_id);
  if (!recording?.recordingId || !recording.title) return null;

  const listenedMsRaw = stat.listened_ms;
  const listenedMs =
    typeof listenedMsRaw === "string"
      ? Number(listenedMsRaw)
      : Number(listenedMsRaw ?? 0);

  const minutes =
    Number.isFinite(listenedMs) && listenedMs > 0
      ? Math.floor(listenedMs / 60_000)
      : null;

  return {
    recordingId: recording.recordingId,
    title: recording.title,
    artist: recording.artist,
    minutes,
  };
}

async function getUnlockedDashboardBadges(
  _memberId: string,
): Promise<MemberDashboardBadge[]> {
  return [];
}

export async function buildPortalMemberSummary(
  memberId: string,
): Promise<PortalMemberSummary> {
  const identityState = await buildMemberIdentityState(memberId);

  const [contributionCount, minutesStreamed, favouriteTrack, badges] =
    await Promise.all([
      getDashboardContributionCount(memberId),
      getDashboardMinutesStreamed(memberId),
      getDashboardFavouriteTrack(memberId),
      getUnlockedDashboardBadges(memberId),
    ]);

  return {
    ...emptyPortalMemberSummary(),
    identity: identityState.resolved,
    contributionCount,
    minutesStreamed,
    favouriteTrack,
    badges,
  };
}
