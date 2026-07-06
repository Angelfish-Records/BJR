// web/lib/badgeFeature.ts
import "server-only";

/**
 * Badges are intentionally opt-in. An absent or malformed environment value
 * leaves the full badge system inactive.
 */
export function areBadgesEnabled(): boolean {
  return (process.env.BADGES_ENABLED ?? "").trim().toLowerCase() === "true";
}