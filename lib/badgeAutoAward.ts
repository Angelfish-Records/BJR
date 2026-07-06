// web/lib/badgeAutoAward.ts
import "server-only";

import { sql } from "@vercel/postgres";
import {
  getAutoAwardBadgeDefinitions,
  type BadgeDefinition,
} from "@/lib/badges";
import { areBadgesEnabled } from "@/lib/badgeFeature";
import { grantEntitlement } from "@/lib/entitlementOps";

export type AutoBadgeTriggerKind =
  | "playback_aggregate_updated"
  | "exegesis_contribution_created"
  | "exegesis_vote_updated"
  | "public_name_unlocked";

export type NewlyAwardedBadge = {
  entitlementKey: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  shareable: boolean;
  unlockedAt: string;
};

export type RunAutoBadgeAwardsForMemberInput = {
  memberId: string;
  trigger: AutoBadgeTriggerKind;
  recordingId?: string | null;
  grantedBy?: string;
  correlationId?: string | null;
};

function asNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

type PlaybackTelemetryBadgeEvent = "play" | "progress" | "complete";

type PlaybackAggregateSnapshot = {
  member: {
    listenedMs: number;
    playCount: number;
    completedCount: number;
  };
  recording: {
    listenedMs: number;
    playCount: number;
    completedCount: number;
  };
};

type PlaybackAggregateSnapshotRow = {
  member_listened_ms: string | number | null;
  member_play_count: string | number | null;
  member_completed_count: string | number | null;
  recording_listened_ms: string | number | null;
  recording_play_count: string | number | null;
  recording_completed_count: string | number | null;
};

function asNonNegativeInt(value: string | number | null | undefined): number {
  return Math.max(0, Math.floor(asNumber(value)));
}

function isPlaybackTelemetryBadgeRelevant(
  badge: BadgeDefinition,
  event: PlaybackTelemetryBadgeEvent,
  recordingId: string,
): boolean {
  const autoAward = badge.autoAward;
  const mode = autoAward?.qualificationMode;

  if (!autoAward || !mode) return false;

  switch (mode) {
    case "minutes_streamed":
      return event === "progress";

    case "play_count":
      return event === "play";

    case "complete_count":
      return event === "complete";

    case "recording_minutes_streamed":
      return (
        event === "progress" && autoAward.recordingId?.trim() === recordingId
      );

    case "recording_play_count":
      return event === "play" && autoAward.recordingId?.trim() === recordingId;

    case "recording_complete_count":
      return (
        event === "complete" && autoAward.recordingId?.trim() === recordingId
      );

    default:
      return false;
  }
}

function qualifiesPlaybackBadgeFromSnapshot(
  badge: BadgeDefinition,
  snapshot: PlaybackAggregateSnapshot,
): boolean {
  const autoAward = badge.autoAward;
  const mode = autoAward?.qualificationMode;

  if (!autoAward || !mode) return false;

  switch (mode) {
    case "minutes_streamed": {
      const minimumMs = Math.max(
        0,
        Math.floor(autoAward.minMinutes ?? 0) * 60_000,
      );

      return snapshot.member.listenedMs >= minimumMs;
    }

    case "play_count": {
      const minimum = Math.max(0, Math.floor(autoAward.minPlayCount ?? 0));

      return snapshot.member.playCount >= minimum;
    }

    case "complete_count": {
      const minimum = Math.max(0, Math.floor(autoAward.minCompletedCount ?? 0));

      return snapshot.member.completedCount >= minimum;
    }

    case "recording_minutes_streamed": {
      const minimumMs = Math.max(
        0,
        Math.floor(autoAward.minMinutes ?? 0) * 60_000,
      );

      return snapshot.recording.listenedMs >= minimumMs;
    }

    case "recording_play_count": {
      const minimum = Math.max(0, Math.floor(autoAward.minPlayCount ?? 0));

      return snapshot.recording.playCount >= minimum;
    }

    case "recording_complete_count": {
      const minimum = Math.max(0, Math.floor(autoAward.minCompletedCount ?? 0));

      return snapshot.recording.completedCount >= minimum;
    }

    default:
      return false;
  }
}

async function readPlaybackAggregateSnapshot(params: {
  memberId: string;
  recordingId: string;
}): Promise<PlaybackAggregateSnapshot> {
  const result = await sql<PlaybackAggregateSnapshotRow>`
    select
      coalesce(
        (
          select listened_ms
          from member_listen_totals
          where member_id = ${params.memberId}::uuid
          limit 1
        ),
        0
      ) as member_listened_ms,
      coalesce(
        (
          select play_count
          from member_listen_totals
          where member_id = ${params.memberId}::uuid
          limit 1
        ),
        0
      ) as member_play_count,
      coalesce(
        (
          select completed_count
          from member_listen_totals
          where member_id = ${params.memberId}::uuid
          limit 1
        ),
        0
      ) as member_completed_count,
      coalesce(
        (
          select listened_ms
          from member_track_listen_stats
          where member_id = ${params.memberId}::uuid
            and recording_id = ${params.recordingId}
          limit 1
        ),
        0
      ) as recording_listened_ms,
      coalesce(
        (
          select play_count
          from member_track_listen_stats
          where member_id = ${params.memberId}::uuid
            and recording_id = ${params.recordingId}
          limit 1
        ),
        0
      ) as recording_play_count,
      coalesce(
        (
          select completed_count
          from member_track_listen_stats
          where member_id = ${params.memberId}::uuid
            and recording_id = ${params.recordingId}
          limit 1
        ),
        0
      ) as recording_completed_count
  `;

  const row = result.rows[0];

  return {
    member: {
      listenedMs: asNonNegativeInt(row?.member_listened_ms),
      playCount: asNonNegativeInt(row?.member_play_count),
      completedCount: asNonNegativeInt(row?.member_completed_count),
    },
    recording: {
      listenedMs: asNonNegativeInt(row?.recording_listened_ms),
      playCount: asNonNegativeInt(row?.recording_play_count),
      completedCount: asNonNegativeInt(row?.recording_completed_count),
    },
  };
}

export async function runPlaybackAutoBadgeAwardsForMember(input: {
  memberId: string;
  recordingId: string;
  event: PlaybackTelemetryBadgeEvent;
  grantedBy?: string;
  correlationId?: string | null;
}): Promise<NewlyAwardedBadge[]> {
  if (!areBadgesEnabled()) {
    return [];
  }

  const recordingId = input.recordingId.trim();
  if (!recordingId) return [];

  const allAutoBadges = await getAutoAwardBadgeDefinitions();

  const relevantBadges = allAutoBadges.filter((badge) =>
    isPlaybackTelemetryBadgeRelevant(badge, input.event, recordingId),
  );

  if (relevantBadges.length === 0) {
    return [];
  }

  const snapshot = await readPlaybackAggregateSnapshot({
    memberId: input.memberId,
    recordingId,
  });

  const newlyAwarded: NewlyAwardedBadge[] = [];

  for (const badge of relevantBadges) {
    if (!qualifiesPlaybackBadgeFromSnapshot(badge, snapshot)) {
      continue;
    }

    const grantResult = await grantEntitlement({
      memberId: input.memberId,
      entitlementKey: badge.entitlementKey,
      scopeId: null,
      grantedBy: input.grantedBy ?? "system",
      grantReason: "Automatic badge award via playback_aggregate_updated.",
      grantSource: "badge_auto_rule",
      grantSourceRef: `${badge.entitlementKey}:playback_aggregate_updated`,
      correlationId: input.correlationId ?? null,
    });

    if (grantResult.status !== "inserted") {
      continue;
    }

    newlyAwarded.push({
      entitlementKey: badge.entitlementKey,
      title: badge.title,
      description: badge.description,
      imageUrl: badge.imageUrl,
      shareable: badge.shareable,
      unlockedAt: new Date().toISOString(),
    });
  }

  return newlyAwarded;
}

function isTriggerRelevant(
  badge: BadgeDefinition,
  trigger: AutoBadgeTriggerKind,
  recordingId?: string | null,
): boolean {
  const mode = badge.autoAward?.qualificationMode;

  if (!mode) return false;

  switch (mode) {
    case "minutes_streamed":
    case "play_count":
    case "complete_count":
      return trigger === "playback_aggregate_updated";

    case "recording_minutes_streamed":
    case "recording_play_count":
    case "recording_complete_count":
      return (
        trigger === "playback_aggregate_updated" &&
        typeof recordingId === "string" &&
        recordingId.trim().length > 0 &&
        badge.autoAward?.recordingId === recordingId.trim()
      );

    case "exegesis_contribution_count":
      return trigger === "exegesis_contribution_created";

    case "exegesis_vote_tally":
      return trigger === "exegesis_vote_updated";

    case "public_name_unlocked":
      return (
        trigger === "public_name_unlocked" ||
        trigger === "exegesis_contribution_created"
      );

    default:
      return false;
  }
}

async function qualifiesForBadge(
  badge: BadgeDefinition,
  memberId: string,
): Promise<boolean> {
  const autoAward = badge.autoAward;
  const mode = autoAward?.qualificationMode;

  if (!autoAward || !mode) return false;

  switch (mode) {
    case "minutes_streamed": {
      const minMinutes = Math.max(0, Math.floor(autoAward.minMinutes ?? 0));
      const minListenedMs = minMinutes * 60_000;

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from member_listen_totals
        where member_id = ${memberId}::uuid
          and listened_ms >= ${minListenedMs}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "play_count": {
      const minPlayCount = Math.max(0, Math.floor(autoAward.minPlayCount ?? 0));

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from member_listen_totals
        where member_id = ${memberId}::uuid
          and play_count >= ${minPlayCount}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "complete_count": {
      const minCompletedCount = Math.max(
        0,
        Math.floor(autoAward.minCompletedCount ?? 0),
      );

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from member_listen_totals
        where member_id = ${memberId}::uuid
          and completed_count >= ${minCompletedCount}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "recording_minutes_streamed": {
      const recordingId = autoAward.recordingId?.trim() ?? "";
      const minMinutes = Math.max(0, Math.floor(autoAward.minMinutes ?? 0));
      const minListenedMs = minMinutes * 60_000;

      if (!recordingId) return false;

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from member_track_listen_stats
        where member_id = ${memberId}::uuid
          and recording_id = ${recordingId}
          and listened_ms >= ${minListenedMs}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "recording_play_count": {
      const recordingId = autoAward.recordingId?.trim() ?? "";
      const minPlayCount = Math.max(0, Math.floor(autoAward.minPlayCount ?? 0));

      if (!recordingId) return false;

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from member_track_listen_stats
        where member_id = ${memberId}::uuid
          and recording_id = ${recordingId}
          and play_count >= ${minPlayCount}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "recording_complete_count": {
      const recordingId = autoAward.recordingId?.trim() ?? "";
      const minCompletedCount = Math.max(
        0,
        Math.floor(autoAward.minCompletedCount ?? 0),
      );

      if (!recordingId) return false;

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from member_track_listen_stats
        where member_id = ${memberId}::uuid
          and recording_id = ${recordingId}
          and completed_count >= ${minCompletedCount}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "exegesis_contribution_count": {
      const minContributionCount = Math.max(
        0,
        Math.floor(autoAward.minContributionCount ?? 0),
      );

      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from exegesis_identity
        where member_id = ${memberId}::uuid
          and contribution_count >= ${minContributionCount}
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "exegesis_vote_tally": {
      const minVoteCount = Math.max(0, Math.floor(autoAward.minVoteCount ?? 0));

      const res = await sql<{ vote_count: string | number }>`
        select coalesce(sum(vote_count), 0) as vote_count
        from exegesis_comment
        where created_by_member_id = ${memberId}::uuid
          and status = 'live'
      `;

      return asNumber(res.rows[0]?.vote_count) >= minVoteCount;
    }

    case "public_name_unlocked": {
      const res = await sql<{ count: string | number }>`
        select count(*) as count
        from exegesis_identity
        where member_id = ${memberId}::uuid
          and public_name_unlocked_at is not null
      `;

      return asNumber(res.rows[0]?.count) > 0;
    }

    case "joined_within_window":
    case "active_within_window":
      return false;
  }
}

export async function runAutoBadgeAwardsForMember(
  input: RunAutoBadgeAwardsForMemberInput,
): Promise<NewlyAwardedBadge[]> {
  if (!areBadgesEnabled()) {
    return [];
  }

  const allAutoBadges = await getAutoAwardBadgeDefinitions();

  const relevantBadges = allAutoBadges.filter((badge) =>
    isTriggerRelevant(badge, input.trigger, input.recordingId),
  );

  if (relevantBadges.length === 0) {
    return [];
  }

  const newlyAwarded: NewlyAwardedBadge[] = [];

  for (const badge of relevantBadges) {
    const qualifies = await qualifiesForBadge(badge, input.memberId);

    if (!qualifies) {
      continue;
    }

    const grantResult = await grantEntitlement({
      memberId: input.memberId,
      entitlementKey: badge.entitlementKey,
      scopeId: null,
      grantedBy: input.grantedBy ?? "system",
      grantReason: `Automatic badge award via ${input.trigger}.`,
      grantSource: "badge_auto_rule",
      grantSourceRef: `${badge.entitlementKey}:${input.trigger}`,
      correlationId: input.correlationId ?? null,
    });

    if (grantResult.status !== "inserted") {
      continue;
    }

    newlyAwarded.push({
      entitlementKey: badge.entitlementKey,
      title: badge.title,
      description: badge.description,
      imageUrl: badge.imageUrl,
      shareable: badge.shareable,
      unlockedAt: new Date().toISOString(),
    });
  }

  return newlyAwarded;
}
