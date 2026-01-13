import 'server-only'
import {sql} from '@vercel/postgres'
import {ENT, ENTITLEMENTS, EVENT_SOURCES, type EventSource} from './vocab'
import {logEntitlementGranted, logEntitlementRevoked} from './events'

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

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

async function ensureEntitlementType(entitlementKey: string, scopeId: string | null) {
  const key = entitlementKey?.trim()
  if (!key) return

  const scope = scopeId ? 'scoped' : 'global'

  await sql`
    insert into entitlement_types (key, description, scope)
    select ${key}, 'auto-registered', ${scope}
    where not exists (
      select 1 from entitlement_types et where et.key = ${key}
    )
  `
}

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
  const {memberId, entitlementKey, expiresAt, correlationId, eventSource, grantedBy, grantSource, grantSourceRef} = params

  if (entitlementKey === ENTITLEMENTS.FREE_MEMBER) {
    await grantEntitlement({
      memberId,
      entitlementKey: ENT.pageView('home'),
      scopeMeta: {implied_by: ENTITLEMENTS.FREE_MEMBER},
      grantedBy,
      grantReason: 'implied: free member can view home',
      grantSource,
      grantSourceRef,
      correlationId,
      eventSource,
    })

    await grantEntitlement({
      memberId,
      entitlementKey: ENT.theme('default'),
      scopeMeta: {implied_by: ENTITLEMENTS.FREE_MEMBER},
      grantedBy,
      grantReason: 'implied: assign default theme',
      grantSource,
      grantSourceRef,
      correlationId,
      eventSource,
    })
  }

  if (entitlementKey === SUBSCRIPTION.GOLD) {
    await grantEntitlement({
      memberId,
      entitlementKey: ENT.tier('premium'),
      expiresAt,
      grantedBy,
      grantReason: 'implied: gold subscription implies premium tier',
      grantSource,
      grantSourceRef,
      correlationId,
      eventSource,
    })

    await grantEntitlement({
      memberId,
      entitlementKey: ENT.theme('gold'),
      expiresAt,
      grantedBy,
      grantReason: 'implied: gold subscription grants gold theme',
      grantSource,
      grantSourceRef,
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

  await ensureEntitlementType(entitlementKey, scopeId)

  const inserted = await sql`
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
      ${scopeId},
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
        and coalesce(eg.scope_id,'') = coalesce(${scopeId ?? ''},'')
        and eg.revoked_at is null
        and (eg.expires_at is null or eg.expires_at > now())
    )
    returning 1
  `

  if (!inserted.rowCount) return

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
      and coalesce(scope_id,'') = coalesce(${scopeId ?? ''},'')
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
