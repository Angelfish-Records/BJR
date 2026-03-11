import "server-only";

import { sql } from "@vercel/postgres";
import { getRecordingSummaryByRecordingId } from "@/lib/albums";

type AggregateRow = {
  listened_ms: string | number;
  credited_progress_count: string | number;
  play_count: string | number;
  completed_count: string | number;
  active_count: number;
};

type RecordingAggregateRow = {
  recording_id: string;
  listened_ms: string | number;
  credited_progress_count: string | number;
  play_count: string | number;
  completed_count: string | number;
  last_listened_at: string | null;
};

type DedupeRow = {
  member_id: string | null;
  member_email: string | null;
  playback_id: string;
  recording_id: string | null;
  event_type: string;
  milestone_key: string;
  created_at: string;
  audience: "member" | "anonymous";
};

function asSafeInt(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.floor(value) : 0;
  }

  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n) : 0;
  }

  return 0;
}

function formatIso(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export type PlaybackAdminAggregate = {
  listenedMs: number;
  creditedProgressCount: number;
  playCount: number;
  completedCount: number;
  activeCount: number;
};

export type PlaybackAdminTrackRow = {
  recordingId: string;
  title: string;
  artist: string | null;
  listenedMs: number;
  creditedProgressCount: number;
  playCount: number;
  completedCount: number;
  lastListenedAt: string | null;
};

export type PlaybackAdminDedupeRow = {
  memberId: string | null;
  memberEmail: string | null;
  playbackId: string;
  recordingId: string | null;
  recordingTitle: string | null;
  eventType: string;
  milestoneKey: string;
  createdAt: string;
  audience: "member" | "anonymous";
};

export type PlaybackAdminSnapshot = {
  generatedAt: string;
  memberTotals: PlaybackAdminAggregate;
  siteTotals: PlaybackAdminAggregate;
  topTracksByListenedMs: PlaybackAdminTrackRow[];
  recentTracks: PlaybackAdminTrackRow[];
  recentDedupe: PlaybackAdminDedupeRow[];
};

async function getMemberTotals(): Promise<PlaybackAdminAggregate> {
  const res = await sql<AggregateRow>`
    select
      coalesce(sum(listened_ms), 0) as listened_ms,
      coalesce(sum(credited_progress_count), 0) as credited_progress_count,
      coalesce(sum(play_count), 0) as play_count,
      coalesce(sum(completed_count), 0) as completed_count,
      count(*)::int as active_count
    from member_listen_totals
    where
      listened_ms > 0
      or credited_progress_count > 0
      or play_count > 0
      or completed_count > 0
  `;

  const row = res.rows[0];

  return {
    listenedMs: asSafeInt(row?.listened_ms),
    creditedProgressCount: asSafeInt(row?.credited_progress_count),
    playCount: asSafeInt(row?.play_count),
    completedCount: asSafeInt(row?.completed_count),
    activeCount: row?.active_count ?? 0,
  };
}

async function getSiteTotals(): Promise<PlaybackAdminAggregate> {
  const res = await sql<AggregateRow>`
    select
      coalesce(sum(listened_ms), 0) as listened_ms,
      coalesce(sum(credited_progress_count), 0) as credited_progress_count,
      coalesce(sum(play_count), 0) as play_count,
      coalesce(sum(completed_count), 0) as completed_count,
      count(*)::int as active_count
    from recording_listen_totals
    where
      listened_ms > 0
      or credited_progress_count > 0
      or play_count > 0
      or completed_count > 0
  `;

  const row = res.rows[0];

  return {
    listenedMs: asSafeInt(row?.listened_ms),
    creditedProgressCount: asSafeInt(row?.credited_progress_count),
    playCount: asSafeInt(row?.play_count),
    completedCount: asSafeInt(row?.completed_count),
    activeCount: row?.active_count ?? 0,
  };
}

async function hydrateTrackRows(
  rows: RecordingAggregateRow[],
): Promise<PlaybackAdminTrackRow[]> {
  const hydrated = await Promise.all(
    rows.map(async (row): Promise<PlaybackAdminTrackRow> => {
      const recording = await getRecordingSummaryByRecordingId(
        row.recording_id,
      );

      return {
        recordingId: row.recording_id,
        title: recording?.title ?? row.recording_id,
        artist: recording?.artist ?? null,
        listenedMs: asSafeInt(row.listened_ms),
        creditedProgressCount: asSafeInt(row.credited_progress_count),
        playCount: asSafeInt(row.play_count),
        completedCount: asSafeInt(row.completed_count),
        lastListenedAt: formatIso(row.last_listened_at),
      };
    }),
  );

  return hydrated;
}

async function getTopTracksByListenedMs(): Promise<PlaybackAdminTrackRow[]> {
  const res = await sql<RecordingAggregateRow>`
    select
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      last_listened_at
    from recording_listen_totals
    where
      listened_ms > 0
      or credited_progress_count > 0
      or play_count > 0
      or completed_count > 0
    order by
      listened_ms desc,
      play_count desc,
      completed_count desc,
      last_listened_at desc nulls last
    limit 12
  `;

  return hydrateTrackRows(res.rows);
}

async function getRecentTracks(): Promise<PlaybackAdminTrackRow[]> {
  const res = await sql<RecordingAggregateRow>`
    select
      recording_id,
      listened_ms,
      credited_progress_count,
      play_count,
      completed_count,
      last_listened_at
    from recording_listen_totals
    where last_listened_at is not null
    order by last_listened_at desc
    limit 12
  `;

  return hydrateTrackRows(res.rows);
}

async function getRecentDedupe(): Promise<PlaybackAdminDedupeRow[]> {
  const res = await sql<DedupeRow>`
    with recent_member_dedupe as (
      select
        d.member_id,
        m.email::text as member_email,
        d.playback_id,
        evt.recording_id,
        d.event_type,
        d.milestone_key,
        d.created_at::text as created_at,
        'member'::text as audience
      from member_playback_telemetry_dedupe d
      left join members m
        on m.id = d.member_id
      left join lateral (
        select
          me.payload->>'recording_id' as recording_id
        from member_events me
        where
          me.member_id = d.member_id
          and me.event_type = d.event_type
          and me.payload->>'playback_id' = d.playback_id
        order by me.occurred_at desc
        limit 1
      ) evt on true
    ),
    recent_anonymous_dedupe as (
      select
        null::uuid as member_id,
        null::text as member_email,
        d.playback_id,
        null::text as recording_id,
        d.event_type,
        d.milestone_key,
        d.created_at::text as created_at,
        'anonymous'::text as audience
      from anonymous_playback_telemetry_dedupe d
    )
    select
      t.member_id::text as member_id,
      t.member_email,
      t.playback_id,
      t.recording_id,
      t.event_type,
      t.milestone_key,
      t.created_at,
      t.audience
    from (
      select * from recent_member_dedupe
      union all
      select * from recent_anonymous_dedupe
    ) t
    order by t.created_at desc
    limit 40
  `;

  const titleByRecordingId = new Map<string, string | null>();
  const distinctRecordingIds = Array.from(
    new Set(
      res.rows
        .map((row) => row.recording_id)
        .filter(
          (value): value is string =>
            typeof value === "string" && value.length > 0,
        ),
    ),
  );

  await Promise.all(
    distinctRecordingIds.map(async (recordingId) => {
      const recording = await getRecordingSummaryByRecordingId(recordingId);
      titleByRecordingId.set(recordingId, recording?.title ?? recordingId);
    }),
  );

  return res.rows.map((row) => ({
    memberId: row.member_id,
    memberEmail: row.member_email,
    playbackId: row.playback_id,
    recordingId: row.recording_id,
    recordingTitle: row.recording_id
      ? (titleByRecordingId.get(row.recording_id) ?? row.recording_id)
      : null,
    eventType: row.event_type,
    milestoneKey: row.milestone_key,
    createdAt: new Date(row.created_at).toISOString(),
    audience: row.audience,
  }));
}

export async function getPlaybackAdminSnapshot(): Promise<PlaybackAdminSnapshot> {
  const [
    memberTotals,
    siteTotals,
    topTracksByListenedMs,
    recentTracks,
    recentDedupe,
  ] = await Promise.all([
    getMemberTotals(),
    getSiteTotals(),
    getTopTracksByListenedMs(),
    getRecentTracks(),
    getRecentDedupe(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    memberTotals,
    siteTotals,
    topTracksByListenedMs,
    recentTracks,
    recentDedupe,
  };
}
