import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)

  const email = (body?.email ?? '').toString().trim().toLowerCase()
  const honey = (body?.company ?? '').toString().trim()

  if (honey) return NextResponse.json({ok: true})
  if (!emailOk(email)) return NextResponse.json({ok: false}, {status: 400})

  const result = await sql`
    insert into members (
      email,
      source,
      consent_first_at,
      consent_latest_at,
      consent_latest_version,
      marketing_opt_in
    )
    values (
      ${email},
      'landing_form',
      now(),
      now(),
      null,
      true
    )
    on conflict (email) do update
      set consent_latest_at = now(),
          marketing_opt_in = true,
          consent_latest_version = null
    returning id
  `

  const memberId = result.rows[0].id

  await sql`
    insert into member_consents (
      member_id,
      consent_type,
      consent_value,
      consent_version,
      source
    )
    values (
      ${memberId},
      'marketing',
      'opt_in',
      'landing_list_v1',
      'landing_form'
    )
  `

  await sql`
    insert into entitlement_grants (
      member_id,
      entitlement_key,
      granted_by,
      grant_reason,
      grant_source
    )
    select
      ${memberId},
      'free_member',
      'system',
      'initial signup',
      'landing_form'
    where not exists (
      select 1
      from entitlement_grants
      where member_id = ${memberId}
        and entitlement_key = 'free_member'
        and revoked_at is null
    )
  `

  return NextResponse.json({ok: true})
}
