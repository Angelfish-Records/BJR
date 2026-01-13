import 'server-only'
import {sql} from '@vercel/postgres'
import {ENT, ENTITLEMENTS, EVENT_SOURCES, type EventSource} from './vocab'
import {logEntitlementGranted, logEntitlementRevoked} from './events'

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

// Keep subscription entitlements as plain text keys (stable, readable, not structured JSON).
// Add-only. Avoid renames once in the wild.
const SUBSCRIPTION = {
  GOLD: 'subscription_gold',
} as const

type GrantParams = {
  memberId: string
  entitlementKey: string
  scopeId?: string | null
  scopeMeta?: Record<string, unknown>
  grantedBy?: string
  grantReason?: string
  grantSource?: string
  grantSourceRef?: string | null
  expiresAt?: Date | null
  correlationId?: string | null
  eventSource?: EventSource | string
}

// Ensure entitlement_types has a row for every key we might grant (incl structured ENT.* keys).
async function ensureEntitlementType(entitlementKey: string, scopeId: string | null) {
  const key = (entitlementKey ?? '').toString().trim()
  if (!key) return

  // Keep it simple: global if no scopeId, scoped otherwise.
  // (If you later add richer scopes, you can evolve this without changing storage keys.)
  const scope = scopeId ? 'scoped' : 'global'

  await sql`
    insert into entitlement_types (key, description, scope)
    values (${key}, ${'auto-registered'}, ${scope})
    on conflict (key) do nothing
  `
}

// Side-effect grants: add-only policy.
// Keep this extremely small and legible.
async function applySideEffectGrants(params: {
  memberId: string
  entitlementKey: string
  expiresAt: Date | null
  correlationId: string | null
  eventSource: EventSource | string
  grantedBy: string
  grantSource: string
  grantSourceRef: string | null
}) {
  const {
    memberId,
    entitlementKey,
    expiresAt,
    correlationId,
    eventSource,
    grantedBy,
    grantSource,
    grantSourceRef,
  } = params

  // FREE_MEMBER implies basic ability to view /home (display-only sandbox today).
  if (entitlementKey === ENTITLEMENTS.FREE_MEMBER) {
    await grantEntitlement({
      memberId,
      entitlementKey: ENT.pageView('home'),
      scopeId: null,
      scopeMeta: {implied_by: ENTITLEMENTS.FREE_MEMBER},
      grantedBy,
      grantReason: 'implied: free member can view home',
      grantSource,
      grantSourceRef,
      expiresAt: null,
      correlationId,
      eventSource,
    })

    // Optional: deterministic default theme. Comment out if you want “no theme unless earned”.
    await grantEntitlement({
      memberId,
      entitlementKey: ENT.theme('default'),
      scopeId: null,
      scopeMeta: {implied_by: ENTITLEMENTS.FREE_MEMBER},
      grantedBy,
      grantReason: 'implied: assign default theme',
      grantSource,
      grantSourceRef,
      expiresAt: null,
      correlationId,
      eventSource,
    })
  }

  // subscription_gold implies premium tier + gold theme.
  // Stripe (or any billing source) should grant ONLY subscription_gold with an expiry.
  // Everything else is derived here as policy — and MUST expire with the subscription.
  if (entitlementKey === SUBSCRIPTION.GOLD) {
    await grantEntitlement({
      memberId,
      entitlementKey: ENT.tier('premium'),
      scopeId: null,
      scopeMeta: {implied_by: SUBSCRIPTION.GOLD},
      grantedBy,
      grantReason: 'implied: gold subscription implies premium tier',
      grantSource,
      grantSourceRef,
      expiresAt, // IMPORTANT: inherit expiry
      correlationId,
      eventSource,
    })

    await grantEntitlement({
      memberId,
      entitlementKey: ENT.theme('gold'),
      scopeId: null,
      scopeMeta: {implied_by: SUBSCRIPTION.GOLD},
      grantedBy,
      grantReason: 'implied: gold subscription grants gold theme',
      grantSource,
      grantSourceRef,
      expiresAt, // IMPORTANT: inherit expiry
      correlationId,
      eventSource,
    })
  }
}

export async function grantEntitlement(params: GrantParams): Promise<void> {
  if (!uuidOk(params.memberId)) throw new Error('Invalid memberId')

  const {
    memberId,
    entitlementKey,
    scopeId = null,
    scopeMeta = {},
    grantedBy = 'system',
    grantReason = null,
    grantSource = 'unknown',
    grantSourceRef = null,
    expiresAt = null,
    correlationId = null,
    eventSource = EVENT_SOURCES.SERVER,
  } = params

  // ✅ Make FK-safe for *all* entitlement keys (incl structured ENT.* keys).
  await ensureEntitlementType(entitlementKey, scopeId)

  // ✅ Idempotent insert via ON CONFLICT.
  // We only log/apply side-effects if a new row was actually inserted.
  const inserted = await sql<{inserted: boolean}>`
    with ins as (
      insert into entitlement_grants (
        member_id,
        entitlement_key,
        scope_id,
        scope_meta,
        granted_by,
        grant_reason,
        grant_source,
        grant_source_ref,
        expires_at
      )
      values (
        ${memberId}::uuid,
        ${entitlementKey},
        ${scopeId}::text,
        ${JSON.stringify(scopeMeta)}::jsonb,
        ${grantedBy},
        ${grantReason},
        ${grantSource},
        ${grantSourceRef},
        ${expiresAt ? expiresAt.toISOString() : null}::timestamptz
      )
      on conflict (member_id, entitlement_key, scope_id) do nothing
      returning 1 as one
    )
    select (exists(select 1 from ins)) as inserted
  `

  const didInsert = inserted.rows?.[0]?.inserted ?? false
  if (!didInsert) return

  await logEntitlementGranted({
    memberId,
    entitlementKey,
    scopeId,
    source: eventSource,
    correlationId,
    payload: {
      granted_by: grantedBy,
      grant_source: grantSource,
      grant_reason: grantReason,
      grant_source_ref: grantSourceRef,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    },
  })

  // Side effects should never prevent the base grant from existing.
  // If a side-effect fails, we want the primary entitlement to remain true.
  try {
    await applySideEffectGrants({
      memberId,
      entitlementKey,
      expiresAt,
      correlationId,
      eventSource,
      grantedBy,
      grantSource,
      grantSourceRef,
    })
  } catch (err) {
    console.error('applySideEffectGrants failed', {memberId, entitlementKey, err})
  }
}

export async function revokeEntitlement(params: {
  memberId: string
  entitlementKey: string
  scopeId?: string | null
  revokedBy?: string
  revokeReason?: string | null
  correlationId?: string | null
  eventSource?: EventSource | string
}): Promise<void> {
  if (!uuidOk(params.memberId)) throw new Error('Invalid memberId')

  const {
    memberId,
    entitlementKey,
    scopeId = null,
    revokedBy = 'system',
    revokeReason = null,
    correlationId = null,
    eventSource = EVENT_SOURCES.SERVER,
  } = params

  await sql`
    update entitlement_grants
    set revoked_at = now(),
        revoked_by = ${revokedBy},
        revoke_reason = ${revokeReason}
    where member_id = ${memberId}::uuid
      and entitlement_key = ${entitlementKey}
      and coalesce(scope_id,'') = coalesce(${scopeId}::text,'')
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  `

  await logEntitlementRevoked({
    memberId,
    entitlementKey,
    scopeId,
    source: eventSource,
    correlationId,
    payload: {revoked_by: revokedBy, revoke_reason: revokeReason},
  })
}
