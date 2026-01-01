import 'server-only'
import {sql} from '@vercel/postgres'
import {ENT, ENTITLEMENTS, EVENT_SOURCES, type EventSource} from './vocab'
import {logEntitlementGranted, logEntitlementRevoked} from './events'

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

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

// Side-effect grants: add-only policy.
// Keep this extremely small and legible.
async function applySideEffectGrants(params: {
  memberId: string
  entitlementKey: string
  correlationId: string | null
  eventSource: EventSource | string
  grantedBy: string
  grantSource: string
  grantSourceRef: string | null
}) {
  const {memberId, entitlementKey, correlationId, eventSource, grantedBy, grantSource, grantSourceRef} =
    params

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

  // Insert only if an active non-expiring grant doesn't already exist for this (member,key,scope)
  await sql`
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
    select
      ${memberId}::uuid,
      ${entitlementKey},
      ${scopeId}::text,
      ${JSON.stringify(scopeMeta)}::jsonb,
      ${grantedBy},
      ${grantReason},
      ${grantSource},
      ${grantSourceRef},
      ${expiresAt ? expiresAt.toISOString() : null}::timestamptz
    where not exists (
      select 1
      from entitlement_grants eg
      where eg.member_id = ${memberId}::uuid
        and eg.entitlement_key = ${entitlementKey}
        and coalesce(eg.scope_id, '') = coalesce(${scopeId}::text, '')
        and eg.revoked_at is null
        and eg.expires_at is null
    )
  `

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

  // Apply implied “side-effect” grants (policy lives here, not in callers).
  await applySideEffectGrants({
    memberId,
    entitlementKey,
    correlationId,
    eventSource,
    grantedBy,
    grantSource,
    grantSourceRef,
  })
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
