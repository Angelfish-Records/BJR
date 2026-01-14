// web/lib/vocab.ts
import 'server-only'

export const ENTITLEMENTS = {
  // permissions (capabilities)
  PLAY_ALBUM: 'play_album',
  TRACK_SHARE_GRANT: 'track_share_grant',

  // ✅ album-level share/press override during embargo
  ALBUM_SHARE_GRANT: 'album_share_grant',

  // human tiers (membership)
  TIER_FRIEND: 'tier_friend',
  TIER_PATRON: 'tier_patron',
  TIER_PARTNER: 'tier_partner',
} as const

// Canonical scope IDs
export const SCOPE_CATALOG = 'catalog' as const

export type EntitlementKey = (typeof ENTITLEMENTS)[keyof typeof ENTITLEMENTS]

export const EVENT_TYPES = {
  MEMBER_CREATED: 'member_created',
  MARKETING_OPT_IN: 'marketing_opt_in',
  MARKETING_OPT_OUT: 'marketing_opt_out',
  ENTITLEMENT_GRANTED: 'entitlement_granted',
  ENTITLEMENT_REVOKED: 'entitlement_revoked',
  ACCESS_ALLOWED: 'access_allowed',
  ACCESS_DENIED: 'access_denied',
  IDENTITY_LINKED: 'identity_linked',
  DEBUG: 'debug',
} as const

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES]

export const EVENT_SOURCES = {
  LANDING_FORM: 'landing_form',
  SERVER: 'server',
  ADMIN: 'admin',
  STRIPE: 'stripe',
  CLERK: 'clerk',
  MUX: 'mux',
  UNKNOWN: 'unknown',
} as const

export type EventSource = (typeof EVENT_SOURCES)[keyof typeof EVENT_SOURCES]

export const ACCESS_ACTIONS = {
  SIGNUP: 'signup',
  PLAYBACK_TOKEN_ISSUE: 'playback_token_issue',
  SHARE_TOKEN_REDEEM: 'share_token_redeem',
  ACCESS_CHECK: 'access_check',
} as const

export type AccessAction = (typeof ACCESS_ACTIONS)[keyof typeof ACCESS_ACTIONS]

/**
 * ---- Structured entitlement keys (still strings) ----
 * Goal: granular semantics without ever leaving “string keys” as the canonical storage type.
 */

export type StructuredEntitlementKey = string

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort()
    return `{${keys
      .map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]))
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function entKey(obj: Record<string, unknown>): StructuredEntitlementKey {
  return stableStringify(obj)
}

/**
 * Canonical structured keys. Add-only. Avoid renames.
 * (These do not replace ENTITLEMENTS; they complement them.)
 */
export const ENT = {
  pageView: (page: string) => entKey({kind: 'page_view', page}),
  theme: (name: string) => entKey({kind: 'theme', name}), // keep only if you still want structured themes later
  mediaPlay: (trackId: string) => entKey({kind: 'media_play', trackId}),
  download: (assetId: string) => entKey({kind: 'download', assetId}),
  downloadAlbum: (slug: string) => `download_album_${slug}`,

  // optional: if you still want a helper for the new tiers
  tier: (name: 'friend' | 'patron' | 'partner') => `tier_${name}`,
} as const

export type Tier = 'none' | 'friend' | 'patron' | 'partner'

export function deriveTier(keys: string[]): Tier {
  const s = new Set(keys)
  if (s.has(ENTITLEMENTS.TIER_PARTNER)) return 'partner'
  if (s.has(ENTITLEMENTS.TIER_PATRON)) return 'patron'
  if (s.has(ENTITLEMENTS.TIER_FRIEND)) return 'friend'
  return 'none'
}
