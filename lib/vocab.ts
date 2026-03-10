import "server-only";
import { ENT, entKey, type StructuredEntitlementKey } from "./entitlementVocab";

export const ENTITLEMENTS = {
  // permissions (capabilities)
  PLAY_ALBUM: "play_album",
  TRACK_SHARE_GRANT: "track_share_grant",
  ALBUM_SHARE_GRANT: "album_share_grant",

  // admin
  ADMIN: "admin",

  // human tiers (membership)
  TIER_FRIEND: "tier_friend",
  TIER_PATRON: "tier_patron",
  TIER_PARTNER: "tier_partner",
} as const;

// Canonical scope IDs
export const SCOPE_CATALOGUE = "catalogue" as const;

export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS];

export const EVENT_TYPES = {
  MEMBER_CREATED: "member_created",
  MARKETING_OPT_IN: "marketing_opt_in",
  MARKETING_OPT_OUT: "marketing_opt_out",
  ENTITLEMENT_GRANTED: "entitlement_granted",
  ENTITLEMENT_REVOKED: "entitlement_revoked",
  GIFT_CREATED: "gift_created",
  GIFT_CLAIMED: "gift_claimed",
  ACCESS_ALLOWED: "access_allowed",
  ACCESS_DENIED: "access_denied",
  IDENTITY_LINKED: "identity_linked",

  // Playback audit / telemetry
  TRACK_PLAY_COMPLETED: "track_play_completed",
  PLAYBACK_TELEMETRY_PLAY: "playback_telemetry_play",
  PLAYBACK_TELEMETRY_PROGRESS: "playback_telemetry_progress",
  PLAYBACK_TELEMETRY_COMPLETE: "playback_telemetry_complete",

  DEBUG: "debug",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export const EVENT_SOURCES = {
  LANDING_FORM: "landing_form",
  SERVER: "server",
  ADMIN: "admin",
  STRIPE: "stripe",
  CLERK: "clerk",
  GIFT: "gift",
  MUX: "mux",
  UNKNOWN: "unknown",
} as const;

export type EventSource = (typeof EVENT_SOURCES)[keyof typeof EVENT_SOURCES];

export const ACCESS_ACTIONS = {
  SIGNUP: "signup",
  PLAYBACK_TOKEN_ISSUE: "playback_token_issue",
  SHARE_TOKEN_REDEEM: "share_token_redeem",
  ACCESS_CHECK: "access_check",
} as const;

export type AccessAction = (typeof ACCESS_ACTIONS)[keyof typeof ACCESS_ACTIONS];

/**
 * ---- Structured entitlement keys (still strings) ----
 * Goal: granular semantics without ever leaving “string keys” as the canonical storage type.
 */

export { ENT, entKey };
export type { StructuredEntitlementKey };

export type Tier = "none" | "friend" | "patron" | "partner";

export function deriveTier(keys: string[]): Tier {
  const s = new Set(keys);
  if (s.has(ENTITLEMENTS.TIER_PARTNER)) return "partner";
  if (s.has(ENTITLEMENTS.TIER_PATRON)) return "patron";
  if (s.has(ENTITLEMENTS.TIER_FRIEND)) return "friend";
  return "none";
}
