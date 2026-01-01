import 'server-only'
import {sql} from '@vercel/postgres'

export function normalizeEmail(input: string): string {
  return (input ?? '').toString().trim().toLowerCase()
}

export function assertLooksLikeEmail(email: string): void {
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!ok) throw new Error('Invalid email')
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
