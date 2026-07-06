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
import { areBadgesEnabled } from "@/lib/badgeFeature";
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

type ActiveBadgeGrantRow = {
  id: string;
  entitlement_key: string;
  granted_at: string;
  cabinet_revealed_at: string | null;
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
  editorialOrder: number;
};

async function listActiveGlobalBadgeGrants(
  memberId: string,
): Promise<ActiveBadgeGrantRow[]> {
  const res = await sql<ActiveBadgeGrantRow>`
    select
      eg.id,
      eg.entitlement_key,
      eg.granted_at,
      eg.cabinet_revealed_at
    from entitlement_grants eg
    where eg.member_id = ${memberId}::uuid
      and eg.scope_id is null
      and eg.entitlement_key like 'badge\_%' escape '\'
      and eg.revoked_at is null
      and (eg.expires_at is null or eg.expires_at > now())
    order by eg.entitlement_key asc, eg.granted_at asc
  `;

  return res.rows;
}

async function consumeCabinetRevealGrants(grantIds: string[]): Promise<void> {
  if (grantIds.length === 0) return;

  const grantIdsJson = JSON.stringify(grantIds);

  await sql`
    with grant_ids as (
      select jsonb_array_elements_text(${grantIdsJson}::jsonb)::uuid as id
    )
    update entitlement_grants eg
    set cabinet_revealed_at = now()
    from grant_ids gi
    where eg.id = gi.id
      and eg.cabinet_revealed_at is null
  `;
}

async function getDashboardBadges(
  memberId: string,
): Promise<MemberDashboardBadge[]> {
  if (!areBadgesEnabled()) {
    return [];
  }

  const [activeBadgeGrants, badgeDefinitionsByKey] = await Promise.all([
    listActiveGlobalBadgeGrants(memberId),
    getActiveBadgeDefinitionsByEntitlementKey(),
  ]);

  const ownedBadgeByKey = new Map<
    string,
    {
      grantId: string;
      grantedAt: string | null;
      cabinetRevealPending: boolean;
    }
  >();

  for (const grant of activeBadgeGrants) {
    const existing = ownedBadgeByKey.get(grant.entitlement_key);

    const candidate = {
      grantId: grant.id,
      grantedAt: grant.granted_at,
      cabinetRevealPending: grant.cabinet_revealed_at == null,
    };

    if (!existing) {
      ownedBadgeByKey.set(grant.entitlement_key, candidate);
      continue;
    }

    const existingTime = existing.grantedAt
      ? new Date(existing.grantedAt).getTime()
      : Number.POSITIVE_INFINITY;

    const candidateTime = candidate.grantedAt
      ? new Date(candidate.grantedAt).getTime()
      : Number.POSITIVE_INFINITY;

    if (candidateTime < existingTime) {
      ownedBadgeByKey.set(grant.entitlement_key, candidate);
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
      editorialOrder: definition.displayOrder,
      cabinetRevealPending: owned?.cabinetRevealPending ?? false,
    });
  }

  const pendingGrantIds = Array.from(ownedBadgeByKey.values())
    .filter((grant) => grant.cabinetRevealPending)
    .map((grant) => grant.grantId);

  if (pendingGrantIds.length > 0) {
    await consumeCabinetRevealGrants(pendingGrantIds);
  }

  badges.sort((a, b) => {
    if (a.editorialOrder !== b.editorialOrder) {
      return a.editorialOrder - b.editorialOrder;
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
    editorialOrder: badge.editorialOrder,
    cabinetRevealPending: badge.cabinetRevealPending ?? false,
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
