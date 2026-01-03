import 'server-only'
import {sql} from '@vercel/postgres'

export function normalizeEmail(input: string): string {
  return (input ?? '').toString().trim().toLowerCase()
}

export function assertLooksLikeEmail(email: string): void {
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!ok) throw new Error('Invalid email')
}

export async function ensureMemberByClerk(params: {
  clerkUserId: string
  email: string
  source?: string
  sourceDetail?: Record<string, unknown>
}): Promise<{id: string; created: boolean}> {
  const clerkUserId = (params.clerkUserId ?? '').toString().trim()
  if (!clerkUserId) throw new Error('Missing clerkUserId')

  const email = normalizeEmail(params.email)
  assertLooksLikeEmail(email)

  const source = params.source ?? 'clerk'
  const sourceDetail = params.sourceDetail ?? {}

  // Strategy:
  // 1) If row exists by clerk_user_id -> update email + source_detail, return
  // 2) Else if row exists by email (early access) and clerk_user_id is null -> claim it (set clerk_user_id), return
  // 3) Else insert new row with clerk_user_id + email, return
  const res = await sql`
    with by_clerk as (
      update members
        set email = ${email},
            source_detail = members.source_detail || ${JSON.stringify(sourceDetail)}::jsonb
      where clerk_user_id = ${clerkUserId}
      returning id, false as created
    ),
    claim_by_email as (
      update members
        set clerk_user_id = ${clerkUserId},
            source_detail = members.source_detail || ${JSON.stringify(sourceDetail)}::jsonb
      where email = ${email}
        and clerk_user_id is null
      returning id, false as created
    ),
    ins as (
      insert into members (
        email,
        clerk_user_id,
        source,
        source_detail,
        consent_first_at,
        consent_latest_at,
        consent_latest_version,
        marketing_opt_in
      )
      select
        ${email},
        ${clerkUserId},
        ${source},
        ${JSON.stringify(sourceDetail)}::jsonb,
        now(),
        now(),
        null,
        true
      where not exists (select 1 from by_clerk)
        and not exists (select 1 from claim_by_email)
      returning id, (xmax = 0) as created
    )
    select * from by_clerk
    union all
    select * from claim_by_email
    union all
    select * from ins
    limit 1
  `

  const row = res.rows[0] as {id: string; created: boolean} | undefined
  if (!row?.id) throw new Error('Failed to ensure member by Clerk')
  return row
}

export async function getMemberIdByEmail(email: string): Promise<string | null> {
  const e = normalizeEmail(email)
  assertLooksLikeEmail(e)

  const res = await sql`
    select id
    from members
    where email = ${e}
    limit 1
  `
  return (res.rows[0]?.id as string | undefined) ?? null
}

/**
 * Idempotent upsert. Returns {id, created}.
 * Postgres trick: xmax = 0 is true for freshly inserted rows.
 */
export async function ensureMemberByEmail(params: {
  email: string
  source?: string
  sourceDetail?: Record<string, unknown>
  marketingOptIn?: boolean
}): Promise<{id: string; created: boolean}> {
  const email = normalizeEmail(params.email)
  assertLooksLikeEmail(email)

  const source = params.source ?? 'unknown'
  const sourceDetail = params.sourceDetail ?? {}
  const marketingOptIn = params.marketingOptIn ?? true

  const res = await sql`
    insert into members (
      email,
      source,
      source_detail,
      consent_first_at,
      consent_latest_at,
      consent_latest_version,
      marketing_opt_in
    )
    values (
      ${email},
      ${source},
      ${JSON.stringify(sourceDetail)}::jsonb,
      now(),
      now(),
      null,
      ${marketingOptIn}
    )
    on conflict (email) do update
      set consent_latest_at = now(),
          marketing_opt_in = ${marketingOptIn},
          source_detail = members.source_detail || ${JSON.stringify(sourceDetail)}::jsonb
    returning id, (xmax = 0) as created
  `

  return {id: res.rows[0].id as string, created: res.rows[0].created as boolean}
}
