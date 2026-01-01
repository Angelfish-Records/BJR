import 'server-only'
import {sql} from '@vercel/postgres'
import {EVENT_SOURCES, type EventSource} from './vocab'
import {logEntitlementGranted, logEntitlementRevoked} from './events'

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

export async function grantEntitlement(params: {
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
}): Promise<void> {
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
