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
import { getActiveBadgeDefinitionsByEntitlementKey } from "@/lib/badges";
import { listCurrentEntitlements } from "@/lib/entitlements";
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

function getDashboardContributionCount(identityState: {
  exegesisProgress?: { contributionCount?: number | null } | null;
}): number | null {
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

type SortableDashboardBadge = MemberDashboardBadge & {
  displayOrder: number;
};

async function getDashboardBadges(
  memberId: string,
): Promise<MemberDashboardBadge[]> {
  const [entitlements, badgeDefinitionsByKey] = await Promise.all([
    listCurrentEntitlements(memberId),
    getActiveBadgeDefinitionsByEntitlementKey(),
  ]);

  const ownedBadgeByKey = new Map<
    string,
    {
      grantedAt: string | null;
    }
  >();

  for (const entitlement of entitlements) {
    if (entitlement.scopeId !== null) continue;
    if (!entitlement.entitlementKey.startsWith("badge_")) continue;

    const existing = ownedBadgeByKey.get(entitlement.entitlementKey);

    if (!existing) {
      ownedBadgeByKey.set(entitlement.entitlementKey, {
        grantedAt: entitlement.grantedAt,
      });
      continue;
    }

    const existingTime = existing.grantedAt
      ? new Date(existing.grantedAt).getTime()
      : Number.POSITIVE_INFINITY;
    const candidateTime = entitlement.grantedAt
      ? new Date(entitlement.grantedAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (candidateTime < existingTime) {
      ownedBadgeByKey.set(entitlement.entitlementKey, {
        grantedAt: entitlement.grantedAt,
      });
    }
  }

  const badges: SortableDashboardBadge[] = [];

  for (const definition of badgeDefinitionsByKey.values()) {
    const owned = ownedBadgeByKey.get(definition.entitlementKey);
    const unlocked = Boolean(owned);

    if (definition.undisclosed && !unlocked) {
      continue;
    }

    badges.push({
      key: definition.entitlementKey,
      label: definition.title,
      description: definition.description ?? undefined,
      imageUrl: definition.imageUrl ?? undefined,
      shareable: definition.shareable,
      undisclosed: definition.undisclosed,
      unlocked,
      unlockedAt: owned?.grantedAt ?? null,
      displayOrder: definition.displayOrder,
    });
  }

  badges.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }

    return a.label.localeCompare(b.label);
  });

  return badges.map((badge) => ({
    key: badge.key,
    label: badge.label,
    description: badge.description ?? undefined,
    imageUrl: badge.imageUrl ?? undefined,
    shareable: badge.shareable,
    undisclosed: badge.undisclosed,
    unlocked: badge.unlocked,
    unlockedAt: badge.unlockedAt,
  }));
}

export async function buildPortalMemberSummary(
  memberId: string,
): Promise<PortalMemberSummary> {
  const identityState = await buildMemberIdentityState(memberId);

  const [minutesStreamed, favouriteTrack, badges] = await Promise.all([
    getDashboardMinutesStreamed(memberId),
    getDashboardFavouriteTrack(memberId),
    getDashboardBadges(memberId),
  ]);

  const contributionCount = getDashboardContributionCount(identityState);

  return {
    ...emptyPortalMemberSummary(),
    identity: identityState.resolved,
    contributionCount,
    minutesStreamed,
    favouriteTrack,
    badges,
  };
}
