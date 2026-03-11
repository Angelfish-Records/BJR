// web/lib/playbackAdmin.ts
import "server-only";

import { sql } from "@vercel/postgres";
import { getRecordingSummaryByRecordingId } from "@/lib/albums";
import { EVENT_TYPES } from "@/lib/vocab";

const RECENT_WINDOW_DAYS = 30;
const TELEMETRY_PROGRESS_STEP_MS = 15_000;

type AggregateRow = {
  listened_ms: string | number;
  credited_progress_count: string | number;
  play_count: string | number;
  completed_count: string | number;
  active_count: number | null;
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

type TrendRow = {
  day_iso: string;
  member_play_count: string | number;
  anonymous_play_count: string | number;
  site_play_count: string | number;
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
  activeCount: number | null;
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

export type PlaybackAdminTrendDay = {
  date: string;
  memberPlayCount: number;
  anonymousPlayCount: number;
  sitePlayCount: number;
};

export type PlaybackAdminAudienceSplit = {
  allTimeMemberPlayCount: number;
  allTimeAnonymousPlayCount: number;
  recent30dMemberPlayCount: number;
  recent30dAnonymousPlayCount: number;
};

export type PlaybackAdminSnapshot = {
  generatedAt: string;
  memberTotals: PlaybackAdminAggregate;
  member30d: PlaybackAdminAggregate;
  siteTotals: PlaybackAdminAggregate;
  site30d: PlaybackAdminAggregate;
  qualifiedPlayTrend30d: PlaybackAdminTrendDay[];
  audienceSplit: PlaybackAdminAudienceSplit;
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

async function getMember30d(): Promise<PlaybackAdminAggregate> {
  const res = await sql<AggregateRow>`
    select
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS}
        ),
        0
      ) * ${TELEMETRY_PROGRESS_STEP_MS} as listened_ms,
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS}
        ),
        0
      ) as credited_progress_count,
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        ),
        0
      ) as play_count,
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_COMPLETE}
        ),
        0
      ) as completed_count,
      count(distinct member_id)::int as active_count
    from member_playback_telemetry_dedupe
    where created_at >= now() - (${RECENT_WINDOW_DAYS} * interval '1 day')
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

async function getSite30d(): Promise<PlaybackAdminAggregate> {
  const res = await sql<AggregateRow>`
    with recent_events as (
      select event_type
      from member_playback_telemetry_dedupe
      where created_at >= now() - (${RECENT_WINDOW_DAYS} * interval '1 day')

      union all

      select event_type
      from anonymous_playback_telemetry_dedupe
      where created_at >= now() - (${RECENT_WINDOW_DAYS} * interval '1 day')
    )
    select
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS}
        ),
        0
      ) * ${TELEMETRY_PROGRESS_STEP_MS} as listened_ms,
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS}
        ),
        0
      ) as credited_progress_count,
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        ),
        0
      ) as play_count,
      coalesce(
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_COMPLETE}
        ),
        0
      ) as completed_count,
      null::int as active_count
    from recent_events
  `;

  const row = res.rows[0];

  return {
    listenedMs: asSafeInt(row?.listened_ms),
    creditedProgressCount: asSafeInt(row?.credited_progress_count),
    playCount: asSafeInt(row?.play_count),
    completedCount: asSafeInt(row?.completed_count),
    activeCount: row?.active_count ?? null,
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

async function getQualifiedPlayTrend30d(): Promise<PlaybackAdminTrendDay[]> {
  const res = await sql<TrendRow>`
    with days as (
      select generate_series(
        date_trunc('day', now()) - ((${RECENT_WINDOW_DAYS} - 1) * interval '1 day'),
        date_trunc('day', now()),
        interval '1 day'
      ) as day_start
    ),
    member_counts as (
      select
        date_trunc('day', created_at) as day_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('day', now()) - ((${RECENT_WINDOW_DAYS} - 1) * interval '1 day')
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('day', created_at) as day_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('day', now()) - ((${RECENT_WINDOW_DAYS} - 1) * interval '1 day')
      group by 1
    )
    select
      to_char(days.day_start::date, 'YYYY-MM-DD') as day_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from days
    left join member_counts
      on member_counts.day_start = days.day_start
    left join anonymous_counts
      on anonymous_counts.day_start = days.day_start
    order by days.day_start asc
  `;

  return res.rows.map((row) => ({
    date: row.day_iso,
    memberPlayCount: asSafeInt(row.member_play_count),
    anonymousPlayCount: asSafeInt(row.anonymous_play_count),
    sitePlayCount: asSafeInt(row.site_play_count),
  }));
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
        d.recording_id,
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

function buildAudienceSplit(params: {
  memberTotals: PlaybackAdminAggregate;
  siteTotals: PlaybackAdminAggregate;
  member30d: PlaybackAdminAggregate;
  site30d: PlaybackAdminAggregate;
}): PlaybackAdminAudienceSplit {
  const allTimeMemberPlayCount = Math.max(0, params.memberTotals.playCount);
  const allTimeAnonymousPlayCount = Math.max(
    0,
    params.siteTotals.playCount - params.memberTotals.playCount,
  );
  const recent30dMemberPlayCount = Math.max(0, params.member30d.playCount);
  const recent30dAnonymousPlayCount = Math.max(
    0,
    params.site30d.playCount - params.member30d.playCount,
  );

  return {
    allTimeMemberPlayCount,
    allTimeAnonymousPlayCount,
    recent30dMemberPlayCount,
    recent30dAnonymousPlayCount,
  };
}

export async function getPlaybackAdminSnapshot(): Promise<PlaybackAdminSnapshot> {
  const [
    memberTotals,
    member30d,
    siteTotals,
    site30d,
    qualifiedPlayTrend30d,
    topTracksByListenedMs,
    recentTracks,
    recentDedupe,
  ] = await Promise.all([
    getMemberTotals(),
    getMember30d(),
    getSiteTotals(),
    getSite30d(),
    getQualifiedPlayTrend30d(),
    getTopTracksByListenedMs(),
    getRecentTracks(),
    getRecentDedupe(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    memberTotals,
    member30d,
    siteTotals,
    site30d,
    qualifiedPlayTrend30d,
    audienceSplit: buildAudienceSplit({
      memberTotals,
      siteTotals,
      member30d,
      site30d,
    }),
    topTracksByListenedMs,
    recentTracks,
    recentDedupe,
  };
}
