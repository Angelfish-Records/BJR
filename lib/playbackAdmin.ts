// web/lib/playbackAdmin.ts
import "server-only";

import { sql } from "@vercel/postgres";
import { getRecordingSummaryByRecordingId } from "@/lib/albums";
import { EVENT_TYPES } from "@/lib/vocab";

const RECENT_WINDOW_DAYS = 30;
const TELEMETRY_PROGRESS_STEP_MS = 15_000;
const RECENT_DEDUPE_SESSION_LIMIT = 24;

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
  share_token_label: string | null;
};

type TrendRow = {
  bucket_start_iso: string;
  member_play_count: string | number;
  anonymous_play_count: string | number;
  site_play_count: string | number;
};

type ShareLinkActivityQueryRow = {
  telemetry_label: string;
  qualified_play_count: string | number;
  listened_ms: string | number;
  completed_count: string | number;
  top_recording_id: string | null;
  last_activity_at: string;
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
  shareTokenLabel: string | null;
};

export type PlaybackAdminTrendRangeKey =
  | "hour"
  | "day"
  | "week"
  | "month"
  | "year"
  | "allTime";

export type PlaybackAdminTrendBucket = {
  bucketStart: string;
  memberPlayCount: number;
  anonymousPlayCount: number;
  sitePlayCount: number;
};

export type PlaybackAdminTrendRange = {
  key: PlaybackAdminTrendRangeKey;
  label: string;
  buckets: PlaybackAdminTrendBucket[];
};

export type PlaybackAdminAudienceSplit = {
  allTimeMemberPlayCount: number;
  allTimeAnonymousPlayCount: number;
  recent30dMemberPlayCount: number;
  recent30dAnonymousPlayCount: number;
};

export type PlaybackAdminShareLinkActivityRow = {
  telemetryLabel: string;
  qualifiedPlayCount: number;
  listenedMs: number;
  completedCount: number;
  topTrackTitle: string | null;
  lastActivityAt: string;
};

export type PlaybackAdminSnapshot = {
  generatedAt: string;
  memberTotals: PlaybackAdminAggregate;
  member30d: PlaybackAdminAggregate;
  siteTotals: PlaybackAdminAggregate;
  site30d: PlaybackAdminAggregate;
  qualifiedPlayTrends: Record<
    PlaybackAdminTrendRangeKey,
    PlaybackAdminTrendRange
  >;
  audienceSplit: PlaybackAdminAudienceSplit;
  topTracksByListenedMs: PlaybackAdminTrackRow[];
  recentTracks: PlaybackAdminTrackRow[];
  recentDedupe: PlaybackAdminDedupeRow[];
  shareLinkActivity: PlaybackAdminShareLinkActivityRow[];
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

function mapTrendRows(rows: TrendRow[]): PlaybackAdminTrendBucket[] {
  return rows.map((row) => ({
    bucketStart: row.bucket_start_iso,
    memberPlayCount: asSafeInt(row.member_play_count),
    anonymousPlayCount: asSafeInt(row.anonymous_play_count),
    sitePlayCount: asSafeInt(row.site_play_count),
  }));
}

async function getQualifiedPlayTrendHour(): Promise<PlaybackAdminTrendRange> {
  const res = await sql<TrendRow>`
    with buckets as (
      select generate_series(
        date_trunc('minute', now()) - (59 * interval '1 minute'),
        date_trunc('minute', now()),
        interval '1 minute'
      ) as bucket_start
    ),
    member_counts as (
      select
        date_trunc('minute', created_at) as bucket_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('minute', now()) - (59 * interval '1 minute')
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('minute', created_at) as bucket_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('minute', now()) - (59 * interval '1 minute')
      group by 1
    )
    select
      buckets.bucket_start::text as bucket_start_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from buckets
    left join member_counts
      on member_counts.bucket_start = buckets.bucket_start
    left join anonymous_counts
      on anonymous_counts.bucket_start = buckets.bucket_start
    order by buckets.bucket_start asc
  `;

  return {
    key: "hour",
    label: "60m",
    buckets: mapTrendRows(res.rows),
  };
}

async function getQualifiedPlayTrendDay(): Promise<PlaybackAdminTrendRange> {
  const res = await sql<TrendRow>`
    with buckets as (
      select generate_series(
        date_trunc('hour', now()) - (23 * interval '1 hour'),
        date_trunc('hour', now()),
        interval '1 hour'
      ) as bucket_start
    ),
    member_counts as (
      select
        date_trunc('hour', created_at) as bucket_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('hour', now()) - (23 * interval '1 hour')
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('hour', created_at) as bucket_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('hour', now()) - (23 * interval '1 hour')
      group by 1
    )
    select
      buckets.bucket_start::text as bucket_start_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from buckets
    left join member_counts
      on member_counts.bucket_start = buckets.bucket_start
    left join anonymous_counts
      on anonymous_counts.bucket_start = buckets.bucket_start
    order by buckets.bucket_start asc
  `;

  return {
    key: "day",
    label: "24h",
    buckets: mapTrendRows(res.rows),
  };
}

async function getQualifiedPlayTrendWeek(): Promise<PlaybackAdminTrendRange> {
  const res = await sql<TrendRow>`
    with buckets as (
      select generate_series(
        date_trunc('day', now()) - (6 * interval '1 day'),
        date_trunc('day', now()),
        interval '1 day'
      ) as bucket_start
    ),
    member_counts as (
      select
        date_trunc('day', created_at) as bucket_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('day', now()) - (6 * interval '1 day')
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('day', created_at) as bucket_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('day', now()) - (6 * interval '1 day')
      group by 1
    )
    select
      buckets.bucket_start::text as bucket_start_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from buckets
    left join member_counts
      on member_counts.bucket_start = buckets.bucket_start
    left join anonymous_counts
      on anonymous_counts.bucket_start = buckets.bucket_start
    order by buckets.bucket_start asc
  `;

  return {
    key: "week",
    label: "7d",
    buckets: mapTrendRows(res.rows),
  };
}

async function getQualifiedPlayTrendMonth(): Promise<PlaybackAdminTrendRange> {
  const res = await sql<TrendRow>`
    with buckets as (
      select generate_series(
        date_trunc('day', now()) - (29 * interval '1 day'),
        date_trunc('day', now()),
        interval '1 day'
      ) as bucket_start
    ),
    member_counts as (
      select
        date_trunc('day', created_at) as bucket_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('day', now()) - (29 * interval '1 day')
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('day', created_at) as bucket_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('day', now()) - (29 * interval '1 day')
      group by 1
    )
    select
      buckets.bucket_start::text as bucket_start_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from buckets
    left join member_counts
      on member_counts.bucket_start = buckets.bucket_start
    left join anonymous_counts
      on anonymous_counts.bucket_start = buckets.bucket_start
    order by buckets.bucket_start asc
  `;

  return {
    key: "month",
    label: "30d",
    buckets: mapTrendRows(res.rows),
  };
}

async function getQualifiedPlayTrendYear(): Promise<PlaybackAdminTrendRange> {
  const res = await sql<TrendRow>`
    with buckets as (
      select generate_series(
        date_trunc('month', now()) - (11 * interval '1 month'),
        date_trunc('month', now()),
        interval '1 month'
      ) as bucket_start
    ),
    member_counts as (
      select
        date_trunc('month', created_at) as bucket_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('month', now()) - (11 * interval '1 month')
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('month', created_at) as bucket_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where
        event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        and created_at >= date_trunc('month', now()) - (11 * interval '1 month')
      group by 1
    )
    select
      buckets.bucket_start::text as bucket_start_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from buckets
    left join member_counts
      on member_counts.bucket_start = buckets.bucket_start
    left join anonymous_counts
      on anonymous_counts.bucket_start = buckets.bucket_start
    order by buckets.bucket_start asc
  `;

  return {
    key: "year",
    label: "12m",
    buckets: mapTrendRows(res.rows),
  };
}

async function getQualifiedPlayTrendAllTime(): Promise<PlaybackAdminTrendRange> {
  const res = await sql<TrendRow>`
    with bounds as (
      select
        least(
          coalesce(
            (
              select date_trunc('year', min(created_at))
              from member_playback_telemetry_dedupe
              where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
            ),
            date_trunc('year', now())
          ),
          coalesce(
            (
              select date_trunc('year', min(created_at))
              from anonymous_playback_telemetry_dedupe
              where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
            ),
            date_trunc('year', now())
          )
        ) as first_year_start,
        date_trunc('year', now()) as current_year_start
    ),
    buckets as (
      select generate_series(
        (select first_year_start from bounds),
        (select current_year_start from bounds),
        interval '1 year'
      ) as bucket_start
    ),
    member_counts as (
      select
        date_trunc('year', created_at) as bucket_start,
        count(*)::int as n
      from member_playback_telemetry_dedupe
      where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
      group by 1
    ),
    anonymous_counts as (
      select
        date_trunc('year', created_at) as bucket_start,
        count(*)::int as n
      from anonymous_playback_telemetry_dedupe
      where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
      group by 1
    )
    select
      buckets.bucket_start::text as bucket_start_iso,
      coalesce(member_counts.n, 0) as member_play_count,
      coalesce(anonymous_counts.n, 0) as anonymous_play_count,
      coalesce(member_counts.n, 0) + coalesce(anonymous_counts.n, 0) as site_play_count
    from buckets
    left join member_counts
      on member_counts.bucket_start = buckets.bucket_start
    left join anonymous_counts
      on anonymous_counts.bucket_start = buckets.bucket_start
    order by buckets.bucket_start asc
  `;

  return {
    key: "allTime",
    label: "All time",
    buckets: mapTrendRows(res.rows),
  };
}

async function getQualifiedPlayTrends(): Promise<
  Record<PlaybackAdminTrendRangeKey, PlaybackAdminTrendRange>
> {
  const [hour, day, week, month, year, allTime] = await Promise.all([
    getQualifiedPlayTrendHour(),
    getQualifiedPlayTrendDay(),
    getQualifiedPlayTrendWeek(),
    getQualifiedPlayTrendMonth(),
    getQualifiedPlayTrendYear(),
    getQualifiedPlayTrendAllTime(),
  ]);

  return {
    hour,
    day,
    week,
    month,
    year,
    allTime,
  };
}

async function getShareLinkActivity(): Promise<
  PlaybackAdminShareLinkActivityRow[]
> {
  const result = await sql<ShareLinkActivityQueryRow>`
    with label_totals as (
      select
        telemetry_label,
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
        ) as qualified_play_count,
        coalesce(
          sum(listened_ms) filter (
            where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS}
          ),
          0
        ) as listened_ms,
        count(*) filter (
          where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_COMPLETE}
        ) as completed_count,
        max(occurred_at) as last_activity_at
      from share_token_playback_events
      where char_length(btrim(telemetry_label)) > 0
      group by telemetry_label
    ),
    ranked_tracks as (
      select
        telemetry_label,
        recording_id,
        row_number() over (
          partition by telemetry_label
          order by
            coalesce(
              sum(listened_ms) filter (
                where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PROGRESS}
              ),
              0
            ) desc,
            count(*) filter (
              where event_type = ${EVENT_TYPES.PLAYBACK_TELEMETRY_PLAY}
            ) desc,
            max(occurred_at) desc
        ) as rank
      from share_token_playback_events
      where char_length(btrim(telemetry_label)) > 0
      group by telemetry_label, recording_id
    )
    select
      totals.telemetry_label,
      totals.qualified_play_count,
      totals.listened_ms,
      totals.completed_count,
      tracks.recording_id as top_recording_id,
      totals.last_activity_at::text as last_activity_at
    from label_totals totals
    left join ranked_tracks tracks
      on tracks.telemetry_label = totals.telemetry_label
      and tracks.rank = 1
    order by
      totals.last_activity_at desc,
      totals.listened_ms desc,
      totals.qualified_play_count desc
    limit 24
  `;

  return Promise.all(
    result.rows.map(async (row): Promise<PlaybackAdminShareLinkActivityRow> => {
      const topTrack = row.top_recording_id
        ? await getRecordingSummaryByRecordingId(row.top_recording_id)
        : null;

      return {
        telemetryLabel: row.telemetry_label,
        qualifiedPlayCount: asSafeInt(row.qualified_play_count),
        listenedMs: asSafeInt(row.listened_ms),
        completedCount: asSafeInt(row.completed_count),
        topTrackTitle: topTrack?.title ?? row.top_recording_id,
        lastActivityAt: new Date(row.last_activity_at).toISOString(),
      };
    }),
  );
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
        'member'::text as audience,
        share_event.telemetry_label as share_token_label
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
      left join lateral (
        select e.telemetry_label
        from share_token_playback_events e
        where
          e.audience = 'member'
          and e.member_id = d.member_id
          and e.playback_id = d.playback_id
          and e.event_type = d.event_type
          and e.milestone_key = d.milestone_key
        order by e.occurred_at desc
        limit 1
      ) share_event on true
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
        'anonymous'::text as audience,
        share_event.telemetry_label as share_token_label
      from anonymous_playback_telemetry_dedupe d
      left join lateral (
        select e.telemetry_label
        from share_token_playback_events e
        where
          e.audience = 'anonymous'
          and e.playback_id = d.playback_id
          and e.recording_id = d.recording_id
          and e.event_type = d.event_type
          and e.milestone_key = d.milestone_key
        order by e.occurred_at desc
        limit 1
      ) share_event on true
    ),
    all_dedupe_rows as (
      select * from recent_member_dedupe
      union all
      select * from recent_anonymous_dedupe
    ),
    recent_sessions as (
      select
        audience,
        coalesce(member_id::text, 'anonymous') as identity_key,
        coalesce(recording_id, '__unknown_recording__') as recording_key,
        playback_id,
        max(created_at::timestamptz) as latest_at
      from all_dedupe_rows
      group by
        audience,
        coalesce(member_id::text, 'anonymous'),
        coalesce(recording_id, '__unknown_recording__'),
        playback_id
      order by latest_at desc
      limit ${RECENT_DEDUPE_SESSION_LIMIT}
    )
    select
      t.member_id::text as member_id,
      t.member_email,
      t.playback_id,
      t.recording_id,
      t.event_type,
      t.milestone_key,
      t.created_at,
      t.audience,
      t.share_token_label
    from all_dedupe_rows t
    inner join recent_sessions s
      on s.audience = t.audience
      and s.identity_key = coalesce(t.member_id::text, 'anonymous')
      and s.recording_key = coalesce(t.recording_id, '__unknown_recording__')
      and s.playback_id = t.playback_id
    order by t.created_at desc
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
    shareTokenLabel: row.share_token_label,
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
    qualifiedPlayTrends,
    topTracksByListenedMs,
    recentTracks,
    recentDedupe,
    shareLinkActivity,
  ] = await Promise.all([
    getMemberTotals(),
    getMember30d(),
    getSiteTotals(),
    getSite30d(),
    getQualifiedPlayTrends(),
    getTopTracksByListenedMs(),
    getRecentTracks(),
    getRecentDedupe(),
    getShareLinkActivity(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    memberTotals,
    member30d,
    siteTotals,
    site30d,
    qualifiedPlayTrends,
    audienceSplit: buildAudienceSplit({
      memberTotals,
      siteTotals,
      member30d,
      site30d,
    }),
    topTracksByListenedMs,
    recentTracks,
    recentDedupe,
    shareLinkActivity,
  };
}
