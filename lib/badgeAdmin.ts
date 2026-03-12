// web/lib/badgeAdmin.ts
import "server-only";

import { sql } from "@vercel/postgres";
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

export type BadgeQualificationMode =
  | "minutes_streamed"
  | "play_count"
  | "complete_count"
  | "joined_within_window"
  | "active_within_window"
  | "recording_minutes_streamed"
  | "recording_play_count"
  | "recording_complete_count";

export type BadgePreviewMemberRow = {
  memberId: string;
  email: string | null;
  joinedAt: string | null;
  listenedMs: number | null;
  minutesStreamed: number | null;
  playCount: number | null;
  completedCount: number | null;
  matchedRecordingId: string | null;
  matchedWindowEventCount: number | null;
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

export type BadgePreviewInput =
  | MinutesStreamedPreviewInput
  | PlayCountPreviewInput
  | CompleteCountPreviewInput
  | JoinedWithinWindowPreviewInput
  | ActiveWithinWindowPreviewInput
  | RecordingMinutesStreamedPreviewInput
  | RecordingPlayCountPreviewInput
  | RecordingCompleteCountPreviewInput;

export type BadgePreviewModeDescriptor = {
  key: BadgeQualificationMode;
  label: string;
  description: string;
  requiresRecording: boolean;
  supportsDateWindow: boolean;
  metricFamily: "minutes" | "plays" | "completes" | "membership" | "activity";
  inputRequirements: {
    minMinutes: boolean;
    minPlayCount: boolean;
    minCompletedCount: boolean;
    minProgressCount: boolean;
    joinedWindow: boolean;
    activeWindow: boolean;
    recordingId: boolean;
  };
  fieldText: {
    minMinutesLabel: string;
    minMinutesHelp: string | null;
    minPlayCountLabel: string;
    minPlayCountHelp: string | null;
    minCompletedCountLabel: string;
    minCompletedCountHelp: string | null;
    minProgressCountLabel: string;
    minProgressCountHelp: string | null;
    joinedOnOrAfterLabel: string;
    joinedBeforeLabel: string;
    joinedWindowHelp: string | null;
    activeOnOrAfterLabel: string;
    activeBeforeLabel: string;
    activeWindowHelp: string | null;
    recordingIdLabel: string;
    recordingIdPlaceholder: string;
    recordingIdHelp: string | null;
  };
};

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
};

const DEFAULT_PREVIEW_LIMIT = 200;
const MAX_PREVIEW_LIMIT = 1000;
const TELEMETRY_PROGRESS_STEP_MS = 15_000;

const PLAYBACK_TELEMETRY_EVENT_TYPES = {
  PLAY: "playback_telemetry_play",
  PROGRESS: "playback_telemetry_progress",
  COMPLETE: "playback_telemetry_complete",
} as const;

export const BADGE_PREVIEW_MODE_DESCRIPTORS: Record<
  BadgeQualificationMode,
  BadgePreviewModeDescriptor
> = {
  minutes_streamed: {
    key: "minutes_streamed",
    label: "Total minutes streamed",
    description: "Qualify members by all-time listening minutes.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "minutes",
    inputRequirements: {
      minMinutes: true,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp:
        "Qualify members whose all-time listening minutes meet or exceed this threshold.",
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  play_count: {
    key: "play_count",
    label: "Total play count",
    description: "Qualify members by all-time credited play count.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "plays",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: true,
      minCompletedCount: false,
      minProgressCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp:
        "Qualify members whose all-time credited plays meet or exceed this threshold.",
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  complete_count: {
    key: "complete_count",
    label: "Total complete count",
    description: "Qualify members by all-time completion count.",
    requiresRecording: false,
    supportsDateWindow: false,
    metricFamily: "completes",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: true,
      minProgressCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp:
        "Qualify members whose all-time completion count meets or exceeds this threshold.",
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  joined_within_window: {
    key: "joined_within_window",
    label: "Joined within date window",
    description: "Qualify members by membership creation time.",
    requiresRecording: false,
    supportsDateWindow: true,
    metricFamily: "membership",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      joinedWindow: true,
      activeWindow: false,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp:
        "Qualify members whose account creation timestamp falls within this date window.",
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  active_within_window: {
    key: "active_within_window",
    label: "Active within playback window",
    description:
      "Qualify members by member telemetry activity inside a time window.",
    requiresRecording: false,
    supportsDateWindow: true,
    metricFamily: "activity",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: true,
      minCompletedCount: true,
      minProgressCount: true,
      joinedWindow: false,
      activeWindow: true,
      recordingId: false,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count in window",
      minPlayCountHelp:
        "Count qualifying play events within the selected playback window.",
      minCompletedCountLabel: "Minimum complete count in window",
      minCompletedCountHelp:
        "Count qualifying completion events within the selected playback window.",
      minProgressCountLabel: "Minimum progress count in window",
      minProgressCountHelp:
        "Progress count reflects credited telemetry progress events, not literal minutes.",
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp:
        "Qualify members whose telemetry activity falls within this playback time window.",
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp: null,
    },
  },
  recording_minutes_streamed: {
    key: "recording_minutes_streamed",
    label: "Recording-specific minutes streamed",
    description: "Qualify members by minutes streamed on a specific recording.",
    requiresRecording: true,
    supportsDateWindow: false,
    metricFamily: "minutes",
    inputRequirements: {
      minMinutes: true,
      minPlayCount: false,
      minCompletedCount: false,
      minProgressCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: true,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed on recording",
      minMinutesHelp:
        "Qualify members whose listening minutes on the selected recording meet or exceed this threshold.",
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp:
        "Use the canonical recording UUID for the work being qualified.",
    },
  },
  recording_play_count: {
    key: "recording_play_count",
    label: "Recording-specific play count",
    description: "Qualify members by play count on a specific recording.",
    requiresRecording: true,
    supportsDateWindow: false,
    metricFamily: "plays",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: true,
      minCompletedCount: false,
      minProgressCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: true,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count on recording",
      minPlayCountHelp:
        "Qualify members whose credited plays on the selected recording meet or exceed this threshold.",
      minCompletedCountLabel: "Minimum complete count",
      minCompletedCountHelp: null,
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp:
        "Use the canonical recording UUID for the work being qualified.",
    },
  },
  recording_complete_count: {
    key: "recording_complete_count",
    label: "Recording-specific complete count",
    description: "Qualify members by completion count on a specific recording.",
    requiresRecording: true,
    supportsDateWindow: false,
    metricFamily: "completes",
    inputRequirements: {
      minMinutes: false,
      minPlayCount: false,
      minCompletedCount: true,
      minProgressCount: false,
      joinedWindow: false,
      activeWindow: false,
      recordingId: true,
    },
    fieldText: {
      minMinutesLabel: "Minimum minutes streamed",
      minMinutesHelp: null,
      minPlayCountLabel: "Minimum play count",
      minPlayCountHelp: null,
      minCompletedCountLabel: "Minimum complete count on recording",
      minCompletedCountHelp:
        "Qualify members whose completion count on the selected recording meets or exceeds this threshold.",
      minProgressCountLabel: "Minimum progress count",
      minProgressCountHelp: null,
      joinedOnOrAfterLabel: "Joined on or after",
      joinedBeforeLabel: "Joined before",
      joinedWindowHelp: null,
      activeOnOrAfterLabel: "Active on or after",
      activeBeforeLabel: "Active before",
      activeWindowHelp: null,
      recordingIdLabel: "Recording ID",
      recordingIdPlaceholder: "recording UUID",
      recordingIdHelp:
        "Use the canonical recording UUID for the work being qualified.",
    },
  },
};

export const BADGE_PREVIEW_MODES: BadgePreviewModeDescriptor[] = [
  BADGE_PREVIEW_MODE_DESCRIPTORS.minutes_streamed,
  BADGE_PREVIEW_MODE_DESCRIPTORS.play_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.complete_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.joined_within_window,
  BADGE_PREVIEW_MODE_DESCRIPTORS.active_within_window,
  BADGE_PREVIEW_MODE_DESCRIPTORS.recording_minutes_streamed,
  BADGE_PREVIEW_MODE_DESCRIPTORS.recording_play_count,
  BADGE_PREVIEW_MODE_DESCRIPTORS.recording_complete_count,
];

export function getBadgePreviewModeDescriptor(
  mode: BadgeQualificationMode,
): BadgePreviewModeDescriptor {
  return BADGE_PREVIEW_MODE_DESCRIPTORS[mode];
}

export function isRecordingScopedBadgePreviewMode(
  mode: BadgeQualificationMode,
): boolean {
  return BADGE_PREVIEW_MODE_DESCRIPTORS[mode].requiresRecording;
}

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
    matchedWindowEventCount,
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
    matchedWindowEventCount: null,
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
};

export async function previewBadgeQualification(
  input: BadgePreviewInput,
): Promise<BadgePreviewMemberRow[]> {
  const handler = BADGE_PREVIEW_HANDLERS[input.mode] as (
    value: BadgePreviewInput,
  ) => Promise<BadgePreviewMemberRow[]>;

  return handler(input);
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
