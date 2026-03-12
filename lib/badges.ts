// web/lib/badges.ts
import "server-only";

import { cache } from "react";
import { client } from "@/sanity/lib/client";

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
};

type BadgeDefinitionQueryRow = {
  _id: string;
  title?: string | null;
  entitlementKey?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  displayOrder?: number | null;
  featured?: boolean | null;
  shareable?: boolean | null;
  undisclosed?: boolean | null;
  active?: boolean | null;
};

const BADGE_DEFINITIONS_QUERY = `
  *[_type == "badgeDefinition" && coalesce(active, true) == true]{
    _id,
    title,
    entitlementKey,
    description,
    "imageUrl": image.asset->url,
    displayOrder,
    featured,
    shareable,
    undisclosed,
    active
  }
`;

function coerceBadgeDefinition(
  row: BadgeDefinitionQueryRow,
): BadgeDefinition | null {
  const entitlementKey =
    typeof row.entitlementKey === "string" ? row.entitlementKey.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";

  if (!entitlementKey || !title) return null;
  if (!entitlementKey.startsWith("badge_")) return null;

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
  };
}

export const getActiveBadgeDefinitions = cache(
  async (): Promise<BadgeDefinition[]> => {
    const result = await client.fetch(BADGE_DEFINITIONS_QUERY);

    const rows = Array.isArray(result)
      ? (result as BadgeDefinitionQueryRow[])
      : [];

    return rows
      .map((row: BadgeDefinitionQueryRow) => coerceBadgeDefinition(row))
      .filter((row): row is BadgeDefinition => row !== null);
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
