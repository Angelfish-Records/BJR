import "server-only";

import BadgeDashboardClient from "./BadgeDashboardClient";
import { getActiveBadgeDefinitions } from "@/lib/badges";

export default async function Page(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await props.searchParams) ?? {};
  const embed = typeof sp.embed === "string" && sp.embed === "1";

  const badgeDefinitions = await getActiveBadgeDefinitions();

  return (
    <BadgeDashboardClient
      embed={embed}
      badgeDefinitions={badgeDefinitions.map((badge) => ({
        entitlementKey: badge.entitlementKey,
        title: badge.title,
        description: badge.description,
        displayOrder: badge.displayOrder,
        imageUrl: badge.imageUrl,
        featured: badge.featured,
        shareable: badge.shareable,
      }))}
    />
  );
}