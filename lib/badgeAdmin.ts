// web/lib/badgeAdmin.ts
import "server-only";

import { sql } from "@vercel/postgres";
import { getRecordingSummaryByRecordingId } from "@/lib/albums";
import { grantEntitlement } from "@/lib/entitlementOps";

export type AwardBadgeToMembersInput = {
  entitlementKey: string;
  memberIds: string[];
  grantedBy: string;
  grantReason?: string | null;
  grantSource?: string | null;
  grantSourceRef?: string | null;
};

export type AwardBadgeToMembersResult = {
  entitlementKey: string;
  attempted: number;
  inserted: number;
  alreadyHeld: number;
};

function uniqueMemberIds(memberIds: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const memberId of memberIds) {
    const normalized = memberId.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(normalized);
  }

  return ordered;
}

export async function awardBadgeToMembers(
  input: AwardBadgeToMembersInput,
): Promise<AwardBadgeToMembersResult> {
  const entitlementKey = input.entitlementKey.trim();
  const memberIds = uniqueMemberIds(input.memberIds);

  let inserted = 0;
  let alreadyHeld = 0;

  for (const memberId of memberIds) {
    const result = await grantEntitlement({
      memberId,
      entitlementKey,
      scopeId: null,
      grantedBy: input.grantedBy,
      grantReason: input.grantReason ?? undefined,
      grantSource: input.grantSource ?? "badge_rule",
      grantSourceRef: input.grantSourceRef ?? undefined,
    });

    if (result.status === "inserted") {
      inserted += 1;
      continue;
    }

    alreadyHeld += 1;
  }

  return {
    entitlementKey,
    attempted: memberIds.length,
    inserted,
    alreadyHeld,
  };
}

export type BadgePreviewMemberRow = {
  memberId: string;
  email: string | null;
  joinedAt: string | null;
  listenedMs: number | null;
  minutesStreamed: number | null;
  playCount: number | null;
  completedCount: number | null;
  matchedRecordingId: string | null;
  matchedRecordingTitle: string | null;
  matchedWindowEventCount: number | null;
  contributionCount: number | null;
  exegesisVoteCount: number | null;
  publicNameUnlockedAt: string | null;
};

export type MinutesStreamedPreviewInput = {
  mode: "minutes_streamed";
  minMinutes: number;
  limit?: number;
};

export type PlayCountPreviewInput = {
  mode: "play_count";
  minPlayCount: number;
  limit?: number;
};

export type CompleteCountPreviewInput = {
  mode: "complete_count";
  minCompletedCount: number;
  limit?: number;
};

export type JoinedWithinWindowPreviewInput = {
  mode: "joined_within_window";
  joinedOnOrAfter: string;
  joinedBefore?: string | null;
  limit?: number;
};

export type ActiveWithinWindowPreviewInput = {
  mode: "active_within_window";
  activeOnOrAfter: string;
  activeBefore?: string | null;
  minPlayCount?: number;
  minProgressCount?: number;
  minCompleteCount?: number;
  limit?: number;
};

export type RecordingMinutesStreamedPreviewInput = {
  mode: "recording_minutes_streamed";
  recordingId: string;
  minMinutes: number;
  limit?: number;
};

export type RecordingPlayCountPreviewInput = {
  mode: "recording_play_count";
  recordingId: string;
  minPlayCount: number;
  limit?: number;
};

export type RecordingCompleteCountPreviewInput = {
  mode: "recording_complete_count";
  recordingId: string;
  minCompletedCount: number;
  limit?: number;
};

export type ExegesisContributionCountPreviewInput = {
  mode: "exegesis_contribution_count";
  minContributionCount: number;
  limit?: number;
};

export type ExegesisVoteTallyPreviewInput = {
  mode: "exegesis_vote_tally";
  minVoteCount: number;
  limit?: number;
};

export type PublicNameUnlockedPreviewInput = {
  mode: "public_name_unlocked";
  limit?: number;
};

export type BadgePreviewInput =
  | MinutesStreamedPreviewInput
  | PlayCountPreviewInput
  | CompleteCountPreviewInput
  | JoinedWithinWindowPreviewInput
  | ActiveWithinWindowPreviewInput
  | RecordingMinutesStreamedPreviewInput
  | RecordingPlayCountPreviewInput
  | RecordingCompleteCountPreviewInput
  | ExegesisContributionCountPreviewInput
  | ExegesisVoteTallyPreviewInput
  | PublicNameUnlockedPreviewInput;

type BadgePreviewHandlerMap = {
  minutes_streamed: (
    input: MinutesStreamedPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  play_count: (
    input: PlayCountPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  complete_count: (
    input: CompleteCountPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  joined_within_window: (
    input: JoinedWithinWindowPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  active_within_window: (
    input: ActiveWithinWindowPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  recording_minutes_streamed: (
    input: RecordingMinutesStreamedPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  recording_play_count: (
    input: RecordingPlayCountPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  recording_complete_count: (
    input: RecordingCompleteCountPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  exegesis_contribution_count: (
    input: ExegesisContributionCountPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  exegesis_vote_tally: (
    input: ExegesisVoteTallyPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
  public_name_unlocked: (
    input: PublicNameUnlockedPreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;
};

type MemberBaseRow = {
  id: string;
  email: string | null;
  created_at: string | null;
};

type AggregateRow = {
  member_id: string;
  email: string | null;
  created_at: string | null;
  listened_ms: string | number | null;
  play_count: string | number | null;
  completed_count: string | number | null;
  recording_id?: string | null;
  matched_window_event_count?: string | number | null;
  contribution_count?: string | number | null;
  vote_count?: string | number | null;
  public_name_unlocked_at?: string | null;
};

const DEFAULT_PREVIEW_LIMIT = 200;
const MAX_PREVIEW_LIMIT = 1000;
const TELEMETRY_PROGRESS_STEP_MS = 15_000;

const PLAYBACK_TELEMETRY_EVENT_TYPES = {
  PLAY: "playback_telemetry_play",
  PROGRESS: "playback_telemetry_progress",
  COMPLETE: "playback_telemetry_complete",
} as const;

function clampPreviewLimit(limit?: number): number {
  if (!Number.isFinite(limit)) return DEFAULT_PREVIEW_LIMIT;
  const rounded = Math.floor(limit ?? DEFAULT_PREVIEW_LIMIT);
  return Math.max(1, Math.min(MAX_PREVIEW_LIMIT, rounded));
}

function asNumber(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function mapAggregateRow(row: AggregateRow): BadgePreviewMemberRow {
  const listenedMs = asNumber(row.listened_ms);
  const playCount = asNumber(row.play_count);
  const completedCount = asNumber(row.completed_count);
  const matchedWindowEventCount = asNumber(row.matched_window_event_count);

  return {
    memberId: row.member_id,
    email: row.email,
    joinedAt: row.created_at,
    listenedMs,
    minutesStreamed:
      listenedMs !== null && listenedMs > 0
        ? Math.floor(listenedMs / 60_000)
        : listenedMs === 0
          ? 0
          : null,
    playCount,
    completedCount,
    matchedRecordingId: row.recording_id ?? null,
    matchedRecordingTitle: null,
    matchedWindowEventCount,
    contributionCount: asNumber(row.contribution_count),
    exegesisVoteCount: asNumber(row.vote_count),
    publicNameUnlockedAt: row.public_name_unlocked_at ?? null,
  };
}

function mapMemberBaseRow(row: MemberBaseRow): BadgePreviewMemberRow {
  return {
    memberId: row.id,
    email: row.email,
    joinedAt: row.created_at,
    listenedMs: null,
    minutesStreamed: null,
    playCount: null,
    completedCount: null,
    matchedRecordingId: null,
    matchedRecordingTitle: null,
    matchedWindowEventCount: null,
    contributionCount: null,
    exegesisVoteCount: null,
    publicNameUnlockedAt: null,
  };
}

const BADGE_PREVIEW_HANDLERS: BadgePreviewHandlerMap = {
  minutes_streamed: previewByMinutesStreamed,
  play_count: previewByPlayCount,
  complete_count: previewByCompleteCount,
  joined_within_window: previewByJoinedWindow,
  active_within_window: previewByActiveWithinWindow,
  recording_minutes_streamed: previewByRecordingMinutesStreamed,
  recording_play_count: previewByRecordingPlayCount,
  recording_complete_count: previewByRecordingCompleteCount,
  exegesis_contribution_count: previewByExegesisContributionCount,
  exegesis_vote_tally: previewByExegesisVoteTally,
  public_name_unlocked: previewByPublicNameUnlocked,
};

async function hydratePreviewRecordingTitles(
  rows: BadgePreviewMemberRow[],
): Promise<BadgePreviewMemberRow[]> {
  const distinctRecordingIds = Array.from(
    new Set(
      rows
        .map((row) => row.matchedRecordingId)
        .filter(
          (recordingId): recordingId is string =>
            typeof recordingId === "string" && recordingId.trim().length > 0,
        ),
    ),
  );

  if (distinctRecordingIds.length === 0) {
    return rows;
  }

  const titleByRecordingId = new Map<string, string | null>();

  await Promise.all(
    distinctRecordingIds.map(async (recordingId) => {
      const summary = await getRecordingSummaryByRecordingId(recordingId);
      titleByRecordingId.set(recordingId, summary?.title ?? recordingId);
    }),
  );

  return rows.map((row) => {
    if (!row.matchedRecordingId) return row;

    return {
      ...row,
      matchedRecordingTitle:
        titleByRecordingId.get(row.matchedRecordingId) ??
        row.matchedRecordingId,
    };
  });
}

export async function previewBadgeQualification(
  input: BadgePreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const handler = BADGE_PREVIEW_HANDLERS[input.mode] as (
    value: BadgePreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;

  const rows = await handler(input);
  return hydratePreviewRecordingTitles(rows);
}

async function previewByMinutesStreamed(
  input: MinutesStreamedPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minListenedMs = Math.max(0, Math.floor(input.minMinutes * 60_000));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      mlt.member_id,
      m.email,
      
      m.created_at,
      mlt.listened_ms,
      mlt.play_count,
      mlt.completed_count
    from member_listen_totals mlt
    join members m on m.id = mlt.member_id
    where mlt.listened_ms >= ${minListenedMs}
    order by
      mlt.listened_ms desc,
      mlt.play_count desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByPlayCount(
  input: PlayCountPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minPlayCount = Math.max(0, Math.floor(input.minPlayCount));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      mlt.member_id,
      m.email,
      
      m.created_at,
      mlt.listened_ms,
      mlt.play_count,
      mlt.completed_count
    from member_listen_totals mlt
    join members m on m.id = mlt.member_id
    where mlt.play_count >= ${minPlayCount}
    order by
      mlt.play_count desc,
      mlt.listened_ms desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByCompleteCount(
  input: CompleteCountPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minCompletedCount = Math.max(0, Math.floor(input.minCompletedCount));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      mlt.member_id,
      m.email,
      
      m.created_at,
      mlt.listened_ms,
      mlt.play_count,
      mlt.completed_count
    from member_listen_totals mlt
    join members m on m.id = mlt.member_id
    where mlt.completed_count >= ${minCompletedCount}
    order by
      mlt.completed_count desc,
      mlt.listened_ms desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByJoinedWindow(
  input: JoinedWithinWindowPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const limit = clampPreviewLimit(input.limit);
  const joinedBefore = input.joinedBefore ?? null;

  const res = await sql<MemberBaseRow>`
    select
      m.id,
      m.email,
      
      m.created_at
    from members m
    where m.created_at >= ${input.joinedOnOrAfter}
      and (${joinedBefore}::timestamptz is null or m.created_at < ${joinedBefore}::timestamptz)
    order by
      m.created_at asc,
      m.id asc
    limit ${limit}
  `;

  return res.rows.map(mapMemberBaseRow);
}

async function previewByActiveWithinWindow(
  input: ActiveWithinWindowPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const limit = clampPreviewLimit(input.limit);
  const activeBefore = input.activeBefore ?? null;
  const minPlayCount = Math.max(0, Math.floor(input.minPlayCount ?? 0));
  const minProgressCount = Math.max(0, Math.floor(input.minProgressCount ?? 0));
  const minCompleteCount = Math.max(0, Math.floor(input.minCompleteCount ?? 0));

  const res = await sql<AggregateRow>`
    with window_counts as (
      select
        d.member_id,
                count(*) filter (
          where d.event_type = ${PLAYBACK_TELEMETRY_EVENT_TYPES.PLAY}
        )::int as play_count,
        count(*) filter (
          where d.event_type = ${PLAYBACK_TELEMETRY_EVENT_TYPES.PROGRESS}
        )::int as listened_ms_steps,
        count(*) filter (
          where d.event_type = ${PLAYBACK_TELEMETRY_EVENT_TYPES.COMPLETE}
        )::int as completed_count
      from member_playback_telemetry_dedupe d
      where
        d.created_at >= ${input.activeOnOrAfter}::timestamptz
        and (
          ${activeBefore}::timestamptz is null
          or d.created_at < ${activeBefore}::timestamptz
        )
      group by d.member_id
    )
    select
      wc.member_id,
      m.email,
      
      m.created_at,
            (wc.listened_ms_steps * ${TELEMETRY_PROGRESS_STEP_MS})::bigint as listened_ms,
      wc.play_count,
      wc.completed_count,
      null::text as recording_id,
      (wc.play_count + wc.listened_ms_steps + wc.completed_count)::int as matched_window_event_count
    from window_counts wc
    join members m
      on m.id = wc.member_id
    where
      wc.play_count >= ${minPlayCount}
      and wc.listened_ms_steps >= ${minProgressCount}
      and wc.completed_count >= ${minCompleteCount}
      and (wc.play_count + wc.listened_ms_steps + wc.completed_count) > 0
    order by
      matched_window_event_count desc,
      wc.play_count desc,
      wc.listened_ms_steps desc,
      wc.completed_count desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByRecordingMinutesStreamed(
  input: RecordingMinutesStreamedPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minListenedMs = Math.max(0, Math.floor(input.minMinutes * 60_000));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      mts.member_id,
      m.email,
      
      m.created_at,
      mts.listened_ms,
      mts.play_count,
      mts.completed_count,
      mts.recording_id
    from member_track_listen_stats mts
    join members m on m.id = mts.member_id
    where mts.recording_id = ${input.recordingId}
      and mts.listened_ms >= ${minListenedMs}
    order by
      mts.listened_ms desc,
      mts.play_count desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByRecordingPlayCount(
  input: RecordingPlayCountPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minPlayCount = Math.max(0, Math.floor(input.minPlayCount));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      mts.member_id,
      m.email,
      
      m.created_at,
      mts.listened_ms,
      mts.play_count,
      mts.completed_count,
      mts.recording_id
    from member_track_listen_stats mts
    join members m on m.id = mts.member_id
    where mts.recording_id = ${input.recordingId}
      and mts.play_count >= ${minPlayCount}
    order by
      mts.play_count desc,
      mts.listened_ms desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByRecordingCompleteCount(
  input: RecordingCompleteCountPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minCompletedCount = Math.max(0, Math.floor(input.minCompletedCount));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      mts.member_id,
      m.email,
      
      m.created_at,
      mts.listened_ms,
      mts.play_count,
      mts.completed_count,
      mts.recording_id
    from member_track_listen_stats mts
    join members m on m.id = mts.member_id
    where mts.recording_id = ${input.recordingId}
      and mts.completed_count >= ${minCompletedCount}
    order by
      mts.completed_count desc,
      mts.listened_ms desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByExegesisContributionCount(
  input: ExegesisContributionCountPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minContributionCount = Math.max(
    0,
    Math.floor(input.minContributionCount),
  );
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      ei.member_id,
      m.email,
      
      m.created_at,
      null::bigint as listened_ms,
      null::int as play_count,
      null::int as completed_count,
      null::text as recording_id,
      null::int as matched_window_event_count,
      ei.contribution_count::int as contribution_count,
      null::int as vote_count,
      ei.public_name_unlocked_at
    from exegesis_identity ei
    join members m
      on m.id = ei.member_id
    where ei.contribution_count >= ${minContributionCount}
    order by
      ei.contribution_count desc,
      ei.public_name_unlocked_at desc nulls last,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByExegesisVoteTally(
  input: ExegesisVoteTallyPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const minVoteCount = Math.max(0, Math.floor(input.minVoteCount));
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    with vote_totals as (
      select
        c.created_by_member_id as member_id,
        coalesce(sum(c.vote_count), 0)::int as vote_count
      from exegesis_comment c
      where c.status = 'live'
      group by c.created_by_member_id
    )
    select
      vt.member_id,
      m.email,
      
      m.created_at,
      null::bigint as listened_ms,
      null::int as play_count,
      null::int as completed_count,
      null::text as recording_id,
      null::int as matched_window_event_count,
      coalesce(ei.contribution_count, 0)::int as contribution_count,
      vt.vote_count,
      ei.public_name_unlocked_at
    from vote_totals vt
    join members m
      on m.id = vt.member_id
    left join exegesis_identity ei
      on ei.member_id = vt.member_id
    where vt.vote_count >= ${minVoteCount}
    order by
      vt.vote_count desc,
      coalesce(ei.contribution_count, 0) desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}

async function previewByPublicNameUnlocked(
  input: PublicNameUnlockedPreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const limit = clampPreviewLimit(input.limit);

  const res = await sql<AggregateRow>`
    select
      ei.member_id,
      m.email,
      
      m.created_at,
      null::bigint as listened_ms,
      null::int as play_count,
      null::int as completed_count,
      null::text as recording_id,
      null::int as matched_window_event_count,
      ei.contribution_count::int as contribution_count,
      coalesce(vt.vote_count, 0)::int as vote_count,
      ei.public_name_unlocked_at
    from exegesis_identity ei
    join members m
      on m.id = ei.member_id
    left join lateral (
      select coalesce(sum(c.vote_count), 0)::int as vote_count
      from exegesis_comment c
      where c.created_by_member_id = ei.member_id
        and c.status = 'live'
    ) vt on true
    where ei.public_name_unlocked_at is not null
    order by
      ei.public_name_unlocked_at asc,
      ei.contribution_count desc,
      m.created_at asc nulls last
    limit ${limit}
  `;

  return res.rows.map(mapAggregateRow);
}
