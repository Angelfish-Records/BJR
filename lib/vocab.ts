import 'server-only'

export const ENTITLEMENTS = {
  FREE_MEMBER: 'free_member',
  PATRON_ACCESS: 'patron_access',
  LIFETIME_ACCESS: 'lifetime_access',
  TRACK_SHARE_GRANT: 'track_share_grant',
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
