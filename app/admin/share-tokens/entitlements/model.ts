"use client";

import { hasAlbumDownloadAccess } from "@/lib/albumDownloadPolicy";
import { ENT } from "@/lib/entitlementVocab";
import type {
  AccessHealth,
  CurrentEntitlementRow,
  DashboardRecentJoin,
  DashboardStats,
  GrantRow,
  JoinChartModel,
  MemberRow,
  SelectedMemberDetails,
  StripeWebhookEventRow,
} from "./types";

export const DASHBOARD_RANGE_OPTIONS = [
  { label: "7d", value: 7 },
  { label: "30d", value: 30 },
  { label: "90d", value: 90 },
  { label: "1yr", value: 365 },
  { label: "All", value: 99999 },
] as const;

export function buildTierCountMap(
  tiers: DashboardStats["tiers"] | undefined,
): Map<string, number> {
  const map = new Map<string, number>();

  for (const tier of tiers ?? []) {
    map.set(tier.entitlement_key, tier.count);
  }

  return map;
}

export function buildJoinChart(
  recentJoins: DashboardRecentJoin[] | undefined,
): JoinChartModel {
  const points = [...(recentJoins ?? [])].reverse();
  const maxCount = points.reduce(
    (accumulator, point) => Math.max(accumulator, point.count),
    0,
  );

  if (points.length === 0 || maxCount <= 0) {
    return {
      points: [],
      maxCount: 0,
      path: "",
      areaPath: "",
    };
  }

  const width = 100;
  const height = 100;

  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - (point.count / maxCount) * height;

    return { x, y, ...point };
  });

  const path = coordinates
    .map((point, index) => {
      const command = index === 0 ? "M" : "L";
      return `${command} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    })
    .join(" ");

  const firstX = coordinates[0]?.x.toFixed(2) ?? "0";
  const lastX = coordinates.at(-1)?.x.toFixed(2) ?? String(width);

  const areaPath = [
    `M ${firstX} ${height}`,
    ...coordinates.map(
      (point) => `L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`,
    ),
    `L ${lastX} ${height}`,
    "Z",
  ].join(" ");

  return {
    points: coordinates,
    maxCount,
    path,
    areaPath,
  };
}

function resolveTier(keys: ReadonlySet<string>): AccessHealth["tier"] {
  if (keys.has("tier_partner")) return "partner";
  if (keys.has("tier_patron")) return "patron";
  if (keys.has("tier_friend")) return "friend";
  return "none";
}

export function buildAccessHealth(input: {
  current: CurrentEntitlementRow[];
  memberDetails: SelectedMemberDetails | null;
  stripeWebhookEvents: StripeWebhookEventRow[];
}): AccessHealth {
  const keys = new Set(input.current.map((row) => row.entitlement_key));
  const scoped = new Set(
    input.current.map(
      (row) => `${row.entitlement_key}::${row.scope_id ?? "global"}`,
    ),
  );

  const failedWebhookCount = input.stripeWebhookEvents.filter((event) =>
    Boolean(event.handler_error),
  ).length;

  return {
    tier: resolveTier(keys),
    hasStripeCustomer: Boolean(input.memberDetails?.stripe_customer_id),
    hasCataloguePlayback:
      scoped.has("play_album::catalogue") || keys.has("play_album"),
    hasGodDefendDownload: hasAlbumDownloadAccess(
      Array.from(keys),
      ENT.downloadAlbum("god-defend"),
    ),
    failedWebhookCount,
  };
}

export function formatDateTime(
  value: string | null | undefined,
): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleString();
}

export function formatDateOnly(
  value: string | null | undefined,
): string {
  if (!value) return "—";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString();
}

export function getDashboardRangeDescription(periodDays: number): string {
  if (periodDays === 99999) {
    return "All-time join activity";
  }

  return `New members over the last ${periodDays} days`;
}

export function getSearchButtonLabel(
  searchBusy: boolean,
  query: string,
): string {
  if (searchBusy) return "Loading…";
  if (query.trim()) return "Filter";
  return "Refresh";
}

export function getMembersEmptyLabel(query: string): string {
  return query.trim() ? "No matching members found." : "No members found.";
}

export function getWebhookStatusLabel(
  event: StripeWebhookEventRow,
): string {
  if (event.handler_error) {
    return `failed ${formatDateTime(event.handler_error_at)}`;
  }

  if (event.handled_at) {
    return `handled ${formatDateTime(event.handled_at)}`;
  }

  return "received";
}

export function getWebhookObjectLabel(
  event: StripeWebhookEventRow,
): string {
  if (event.checkout_session_id) {
    return `checkout ${event.checkout_session_id}`;
  }

  if (event.subscription_id) {
    return `subscription ${event.subscription_id}`;
  }

  if (event.stripe_object_id) {
    return `object ${event.stripe_object_id}`;
  }

  return "object —";
}

export function isGrantActive(grant: GrantRow, now = Date.now()): boolean {
  if (grant.revoked_at) return false;
  if (!grant.expires_at) return true;

  return new Date(grant.expires_at).getTime() > now;
}

export function getSelectedJoinedAt(
  selected: MemberRow,
  memberDetails: SelectedMemberDetails | null,
): string {
  return memberDetails?.created_at ?? selected.created_at;
}
