// web/lib/badges.ts
import "server-only";

import { unstable_cache } from "next/cache";
import { cache } from "react";
import { client } from "@/sanity/lib/client";
import { areBadgesEnabled } from "@/lib/badgeFeature";
import type { BadgeQualificationMode } from "@/lib/badgePreviewModes";

export type BadgeAwardMode = "manual" | "automatic";

export type BadgeAutoAwardConfig = {
  enabled: boolean;
  qualificationMode: BadgeQualificationMode | null;
  minMinutes: number | null;
  minPlayCount: number | null;
  minCompletedCount: number | null;
  minProgressCount: number | null;
  minContributionCount: number | null;
  minVoteCount: number | null;
  joinedOnOrAfter: string | null;
  joinedBefore: string | null;
  activeOnOrAfter: string | null;
  activeBefore: string | null;
  recordingId: string | null;
};

export type BadgeDefinition = {
  _id: string;
  title: string;
  entitlementKey: string;
  description: string | null;
  imageUrl: string | null;
  displayOrder: number;
  featured: boolean;
  shareable: boolean;
  undisclosed: boolean;
  active: boolean;
  awardMode: BadgeAwardMode;
  autoAward: BadgeAutoAwardConfig | null;
};

type BadgeDefinitionQueryRow = {
  _id: string;
  title?: string | null;
  keySuffix?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder?: number | null;
  featured?: boolean | null;
  shareable?: boolean | null;
  undisclosed?: boolean | null;
  active?: boolean | null;
  awardMode?: string | null;
  autoAwardEnabled?: boolean | null;
  autoQualificationMode?: string | null;
  minMinutes?: number | null;
  minPlayCount?: number | null;
  minCompletedCount?: number | null;
  minProgressCount?: number | null;
  minContributionCount?: number | null;
  minVoteCount?: number | null;
  joinedOnOrAfter?: string | null;
  joinedBefore?: string | null;
  activeOnOrAfter?: string | null;
  activeBefore?: string | null;
  recordingId?: string | null;
};

const BADGE_DEFINITIONS_QUERY = `
   *[_type == "badgeDefinition" && coalesce(active, true) == true]{
    _id,
    title,
    keySuffix,
    description,
    "imageUrl": image.asset->url,
    displayOrder,
    featured,
    shareable,
    undisclosed,
    active,
    awardMode,
    autoAwardEnabled,
    autoQualificationMode,
    minMinutes,
    minPlayCount,
    minCompletedCount,
    minProgressCount,
    minContributionCount,
    minVoteCount,
    joinedOnOrAfter,
    joinedBefore,
    activeOnOrAfter,
    activeBefore,
    recordingId
  }
`;

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asQualificationMode(value: unknown): BadgeQualificationMode | null {
  const raw = asTrimmedString(value);

  switch (raw) {
    case "minutes_streamed":
    case "play_count":
    case "complete_count":
    case "joined_within_window":
    case "active_within_window":
    case "recording_minutes_streamed":
    case "recording_play_count":
    case "recording_complete_count":
    case "exegesis_contribution_count":
    case "exegesis_vote_tally":
    case "public_name_unlocked":
      return raw;
    default:
      return null;
  }
}

function coerceBadgeDefinition(
  row: BadgeDefinitionQueryRow,
): BadgeDefinition | null {
  const keySuffix =
    typeof row.keySuffix === "string" ? row.keySuffix.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";

  if (!keySuffix || !title) return null;
  if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(keySuffix)) return null;

  const entitlementKey = `badge_${keySuffix}`;
  const awardMode: BadgeAwardMode =
    row.awardMode === "automatic" ? "automatic" : "manual";

  const qualificationMode = asQualificationMode(row.autoQualificationMode);

  const autoAward: BadgeAutoAwardConfig | null =
    awardMode === "automatic"
      ? {
          enabled: row.autoAwardEnabled !== false,
          qualificationMode,
          minMinutes: asFiniteNumber(row.minMinutes),
          minPlayCount: asFiniteNumber(row.minPlayCount),
          minCompletedCount: asFiniteNumber(row.minCompletedCount),
          minProgressCount: asFiniteNumber(row.minProgressCount),
          minContributionCount: asFiniteNumber(row.minContributionCount),
          minVoteCount: asFiniteNumber(row.minVoteCount),
          joinedOnOrAfter: asTrimmedString(row.joinedOnOrAfter),
          joinedBefore: asTrimmedString(row.joinedBefore),
          activeOnOrAfter: asTrimmedString(row.activeOnOrAfter),
          activeBefore: asTrimmedString(row.activeBefore),
          recordingId: asTrimmedString(row.recordingId),
        }
      : null;

  return {
    _id: row._id,
    title,
    entitlementKey,
    description:
      typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
    imageUrl:
      typeof row.imageUrl === "string" && row.imageUrl.trim()
        ? row.imageUrl.trim()
        : null,
    displayOrder:
      typeof row.displayOrder === "number" && Number.isFinite(row.displayOrder)
        ? row.displayOrder
        : 100,
    featured: row.featured === true,
    shareable: row.shareable === true,
    undisclosed: row.undisclosed === true,
    active: row.active !== false,
    awardMode,
    autoAward,
  };
}

const BADGE_DEFINITIONS_REVALIDATE_SECONDS = 5 * 60;

const getCachedActiveBadgeDefinitions = unstable_cache(
  async (): Promise<BadgeDefinition[]> => {
    const result = await client.fetch(BADGE_DEFINITIONS_QUERY);

    const rows = Array.isArray(result)
      ? (result as BadgeDefinitionQueryRow[])
      : [];

    return rows
      .map((row: BadgeDefinitionQueryRow) => coerceBadgeDefinition(row))
      .filter((row): row is BadgeDefinition => row !== null);
  },
  ["active-badge-definitions-v1"],
  {
    revalidate: BADGE_DEFINITIONS_REVALIDATE_SECONDS,
    tags: ["badgeDefinitions"],
  },
);

export const getActiveBadgeDefinitions = cache(
  async (): Promise<BadgeDefinition[]> => {
    if (!areBadgesEnabled()) {
      return [];
    }

    return getCachedActiveBadgeDefinitions();
  },
);

export const getActiveBadgeDefinitionsByEntitlementKey = cache(
  async (): Promise<Map<string, BadgeDefinition>> => {
    const definitions = await getActiveBadgeDefinitions();
    return new Map(
      definitions.map((definition) => [definition.entitlementKey, definition]),
    );
  },
);

export const getAutoAwardBadgeDefinitions = cache(
  async (): Promise<BadgeDefinition[]> => {
    const definitions = await getActiveBadgeDefinitions();

    return definitions.filter(
      (definition) =>
        definition.awardMode === "automatic" &&
        definition.autoAward !== null &&
        definition.autoAward.enabled &&
        definition.autoAward.qualificationMode !== null,
    );
  },
);
