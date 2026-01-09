// web/lib/events.ts
import 'server-only'
import crypto from 'crypto'
import {sql} from '@vercel/postgres'
import {EVENT_SOURCES, EVENT_TYPES, type AccessAction, type EventSource, type EventType} from './vocab'

export type EventPayload = Record<string, unknown>

export function newCorrelationId(): string {
  return crypto.randomUUID()
}

export async function logMemberEvent(params: {
  memberId?: string | null
  eventType: EventType | string
  source?: EventSource | string
  payload?: EventPayload
  occurredAt?: Date
  correlationId?: string | null
}): Promise<void> {
  const {
    memberId = null,
    eventType,
    source = EVENT_SOURCES.UNKNOWN,
    payload = {},
    occurredAt,
    correlationId = null,
  } = params

  try {
    if (occurredAt) {
      await sql`
        insert into member_events (member_id, event_type, occurred_at, source, payload, correlation_id)
        values (
          ${memberId ? (memberId as string) : null}::uuid,
          ${eventType},
          ${occurredAt.toISOString()}::timestamptz,
          ${source},
          ${JSON.stringify(payload)}::jsonb,
          ${correlationId}::uuid
        )
      `
    } else {
      await sql`
        insert into member_events (member_id, event_type, source, payload, correlation_id)
        values (
          ${memberId ? (memberId as string) : null}::uuid,
          ${eventType},
          ${source},
          ${JSON.stringify(payload)}::jsonb,
          ${correlationId}::uuid
        )
      `
    }
  } catch (err) {
    console.error('member_events insert failed', {eventType, source, memberId, err})
  }
}

/* ---- semantic wrappers (keep your event stream consistent) ---- */

export async function logMemberCreated(params: {
  memberId: string
  source?: EventSource | string
  correlationId?: string | null
  payload?: EventPayload
}) {
  return logMemberEvent({
    memberId: params.memberId,
    eventType: EVENT_TYPES.MEMBER_CREATED,
    source: params.source ?? EVENT_SOURCES.SERVER,
    correlationId: params.correlationId ?? null,
    payload: params.payload ?? {},
  })
}

export async function logEntitlementGranted(params: {
  memberId: string
  entitlementKey: string
  scopeId?: string | null
  source?: EventSource | string
  correlationId?: string | null
  payload?: EventPayload
}) {
  return logMemberEvent({
    memberId: params.memberId,
    eventType: EVENT_TYPES.ENTITLEMENT_GRANTED,
    source: params.source ?? EVENT_SOURCES.SERVER,
    correlationId: params.correlationId ?? null,
    payload: {
      entitlement_key: params.entitlementKey,
      scope_id: params.scopeId ?? null,
      ...(params.payload ?? {}),
    },
  })
}

export async function logEntitlementRevoked(params: {
  memberId: string
  entitlementKey: string
  scopeId?: string | null
  source?: EventSource | string
  correlationId?: string | null
  payload?: EventPayload
}) {
  return logMemberEvent({
    memberId: params.memberId,
    eventType: EVENT_TYPES.ENTITLEMENT_REVOKED,
    source: params.source ?? EVENT_SOURCES.SERVER,
    correlationId: params.correlationId ?? null,
    payload: {
      entitlement_key: params.entitlementKey,
      scope_id: params.scopeId ?? null,
      ...(params.payload ?? {}),
    },
  })
}

export async function logAccessDecision(params: {
  memberId: string
  allowed: boolean
  action: AccessAction | string
  resource: {kind: string; id?: string | null}
  requiredEntitlements: string[]
  matchedEntitlement?: {key: string; scope_id: string | null} | null
  reason?: string | null
  source?: EventSource | string
  correlationId?: string | null
}) {
  return logMemberEvent({
    memberId: params.memberId,
    eventType: params.allowed ? EVENT_TYPES.ACCESS_ALLOWED : EVENT_TYPES.ACCESS_DENIED,
    source: params.source ?? EVENT_SOURCES.SERVER,
    correlationId: params.correlationId ?? null,
    payload: {
      action: params.action,
      resource: params.resource,
      required_entitlements: params.requiredEntitlements,
      matched_entitlement: params.matchedEntitlement ?? null,
      reason: params.reason ?? null,
    },
  })
}
