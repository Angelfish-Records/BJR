import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {ensureMemberByEmail, normalizeEmail, assertLooksLikeEmail} from '@/lib/members'
import {grantEntitlement} from '@/lib/entitlementOps'
import {logMemberCreated, newCorrelationId} from '@/lib/events'
import {ENTITLEMENTS, EVENT_SOURCES} from '@/lib/vocab'

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)

  const email = normalizeEmail((body?.email ?? '').toString())
  const honey = (body?.company ?? '').toString().trim()

  if (honey) return NextResponse.json({ok: true})

  try {
    assertLooksLikeEmail(email)
  } catch {
    return NextResponse.json({ok: false}, {status: 400})
  }

  const correlationId = newCorrelationId()

  const {id: memberId, created} = await ensureMemberByEmail({
    email,
    source: 'landing_form',
    sourceDetail: {path: '/'},
    marketingOptIn: true,
  })

  // Append-only marketing opt-in fact (idempotent, to avoid noise on repeat submissions)
  await sql`
    insert into member_consents (
      member_id,
      consent_type,
      consent_value,
      consent_version,
      source
    )
    select
      ${memberId}::uuid,
      'marketing',
      'opt_in',
      'landing_list_v1',
      'landing_form'
    where not exists (
      select 1
      from member_consents mc
      where mc.member_id = ${memberId}::uuid
        and mc.consent_type = 'marketing'
        and mc.consent_value = 'opt_in'
        and mc.consent_version = 'landing_list_v1'
        and mc.source = 'landing_form'
    )
  `

  // Baseline entitlement (FREE_MEMBER). Side-effects (home page view, theme default)
  // should be handled inside grantEntitlement now.
  await grantEntitlement({
    memberId,
    entitlementKey: ENTITLEMENTS.FREE_MEMBER,
    grantedBy: 'system',
    grantReason: 'initial signup',
    grantSource: 'landing_form',
    correlationId,
    eventSource: EVENT_SOURCES.LANDING_FORM,
  })

  // Log member_created once (DB index enforces at-most-one)
  if (created) {
    await logMemberCreated({
      memberId,
      source: EVENT_SOURCES.LANDING_FORM,
      correlationId,
      payload: {via: 'early_access'},
    })
  }

  return NextResponse.json({ok: true})
}
