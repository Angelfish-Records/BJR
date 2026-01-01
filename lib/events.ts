import 'server-only'
import {sql} from '@vercel/postgres'

export type EventType =
  | 'member_created'
  | 'marketing_opt_in'
  | 'marketing_opt_out'
  | 'entitlement_granted'
  | 'entitlement_revoked'
  | 'access_allowed'
  | 'access_denied'
  | 'debug'

export type EventSource =
  | 'landing_form'
  | 'server'
  | 'admin'
  | 'stripe' // future
  | 'clerk'  // future
  | 'mux'    // future
  | 'unknown'

export type EventPayload = Record<string, unknown>

export async function logMemberEvent(params: {
  memberId?: string | null
  eventType: EventType | string
  source?: EventSource | string
  payload?: EventPayload
  occurredAt?: Date
}): Promise<void> {
  const {
    memberId = null,
    eventType,
    source = 'unknown',
    payload = {},
    occurredAt,
  } = params

  // Fail-closed and never break the main flow because logging failed.
  // (You’ll still see errors in server logs.)
  try {
    await sql`
      insert into member_events (member_id, event_type, occurred_at, source, payload)
      values (
        ${memberId ? (memberId as string) : null}::uuid,
        ${eventType},
        ${occurredAt ? occurredAt.toISOString() : null}::timestamptz,
        ${source},
        ${JSON.stringify(payload)}::jsonb
      )
    `
  } catch (err) {
    console.error('member_events insert failed', {eventType, source, memberId, err})
  }
}
