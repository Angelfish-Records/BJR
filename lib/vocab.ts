import 'server-only'

export const ENTITLEMENTS = {
  FREE_MEMBER: 'free_member',
  PATRON_ACCESS: 'patron_access',
  LIFETIME_ACCESS: 'lifetime_access',
  TRACK_SHARE_GRANT: 'track_share_grant',
  SUBSCRIPTION_GOLD: 'subscription_gold',
} as const

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
  // Pages
  pageView: (page: string) => entKey({kind: 'page_view', page}),

  // Themes / cosmetic accents (display-only today, but still canonical if you choose)
  theme: (name: string) => entKey({kind: 'theme', name}),

  // Media access (Mux later)
  mediaPlay: (trackId: string) => entKey({kind: 'media_play', trackId}),

  // Downloads (later)
  download: (assetId: string) => entKey({kind: 'download', assetId}),

  // Optional explicit tier signals (still derived in code; you can choose whether to grant these)
  tier: (name: 'free' | 'premium' | 'lifetime' | string) => entKey({kind: 'tier', name}),
} as const

export type Tier = 'none' | 'free' | 'premium' | 'lifetime'

/**
 * Derived tier: *never* written as truth; it’s a function of entitlements.
 * Rule: highest wins.
 */
export function deriveTier(keys: string[]): Tier {
  const s = new Set(keys)

  if (s.has(ENTITLEMENTS.LIFETIME_ACCESS) || s.has(ENT.tier('lifetime'))) return 'lifetime'
  if (s.has(ENTITLEMENTS.PATRON_ACCESS) || s.has(ENT.tier('premium'))) return 'premium'
  if (s.has(ENTITLEMENTS.FREE_MEMBER) || s.has(ENT.tier('free'))) return 'free'

  return 'none'
}

/**
 * Cosmetic: pick a deterministic accent based on entitlements.
 * This is intentionally “light touch”: it should feel like recognition, not manipulation.
 */
export function pickAccent(keys: string[]): {accent: string; label: string} {
  const s = new Set(keys)

  if (s.has(ENT.theme('gold'))) return {accent: '#d6b25e', label: 'gold'}
  if (s.has(ENT.theme('ember'))) return {accent: '#ff6a3d', label: 'ember'}

  const tier = deriveTier(keys)
  if (tier === 'lifetime') return {accent: '#6ee7ff', label: 'lifetime'}
  if (tier === 'premium') return {accent: '#a7f3d0', label: 'premium'}
  if (tier === 'free') return {accent: '#8b8bff', label: 'free'}

  return {accent: '#8b8bff', label: 'default'}
}
