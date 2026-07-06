// web/lib/badgeAwardAnnouncementServer.ts
import "server-only";

import { sql } from "@vercel/postgres";
import type { NewlyAwardedBadge } from "@/lib/badgeAutoAward";
import { areBadgesEnabled } from "@/lib/badgeFeature";

function normalizeEntitlementKeys(badges: NewlyAwardedBadge[]): string[] {
  const unique = new Set<string>();

  for (const badge of badges) {
    const entitlementKey =
      "entitlementKey" in badge && typeof badge.entitlementKey === "string"
        ? badge.entitlementKey.trim()
        : "";

    if (!entitlementKey) continue;
    unique.add(entitlementKey);
  }

  return Array.from(unique);
}

export async function markOverlayAnnouncedForAwardedBadges(params: {
  memberId: string;
  badges: NewlyAwardedBadge[];
}): Promise<void> {
  if (!areBadgesEnabled()) {
    return;
  }

  const { memberId, badges } = params;

  const entitlementKeys = normalizeEntitlementKeys(badges);
  if (entitlementKeys.length === 0) return;

  const entitlementKeysJson = JSON.stringify(entitlementKeys);

  await sql`
    with awarded_keys as (
      select jsonb_array_elements_text(${entitlementKeysJson}::jsonb) as entitlement_key
    )
    update entitlement_grants eg
    set overlay_announced_at = now()
    from awarded_keys ak
    where eg.member_id = ${memberId}::uuid
      and eg.entitlement_key = ak.entitlement_key
      and eg.scope_id is null
      and eg.revoked_at is null
      and (eg.expires_at is null or eg.expires_at > now())
      and eg.overlay_announced_at is null
  `;
}
