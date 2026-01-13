// web/lib/members.ts
import 'server-only'
import {sql} from '@vercel/postgres'
import {grantEntitlement} from '@/lib/entitlementOps'
import {ENTITLEMENTS, EVENT_SOURCES} from '@/lib/vocab'
import {newCorrelationId} from '@/lib/events'

export function normalizeEmail(input: string): string {
  return (input ?? '').toString().trim().toLowerCase()
}

export function assertLooksLikeEmail(email: string): void {
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!ok) throw new Error('Invalid email')
}

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

async function ensureBaselineEntitlements(memberId: string, reason: string) {
  if (!uuidOk(memberId)) return

  // Idempotent: grantEntitlement won't create duplicates for an active, non-expiring grant.
  const correlationId = newCorrelationId()

  await grantEntitlement({
    memberId,
    entitlementKey: ENTITLEMENTS.FREE_MEMBER,
    grantedBy: 'system',
    grantReason: reason,
    grantSource: 'clerk',
    correlationId,
    eventSource: EVENT_SOURCES.CLERK,
  })
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
 * Canonical Clerk bridge.
 *
 * Policy:
 * 1) Prefer canonical lookup by clerk_user_id. If found, update email + consent_latest_at + source_detail.
 * 2) Else claim existing row by email ONLY if unclaimed (clerk_user_id is null).
 * 3) If email exists but is already claimed by another clerk_user_id, throw loud.
 * 4) Else insert a new member row with clerk_user_id + email.
 *
 * Provisioning contract:
 * - Any member returned from this function must have baseline FREE_MEMBER entitlement.
 *
 * Returns {id, created} where created=true only for fresh inserts.
 */
export async function ensureMemberByClerk(params: {
  clerkUserId: string
  email: string
  source?: string
  sourceDetail?: Record<string, unknown>
  marketingOptIn?: boolean
}): Promise<{id: string; created: boolean}> {
  const clerkUserId = (params.clerkUserId ?? '').toString().trim()
  if (!clerkUserId) throw new Error('Missing clerkUserId')

  const email = normalizeEmail(params.email)
  assertLooksLikeEmail(email)

  const source = params.source ?? 'clerk'
  const sourceDetail = params.sourceDetail ?? {}
  const marketingOptIn = params.marketingOptIn ?? true

  // 1) Prefer canonical lookup by clerk_user_id
  const byClerk = await sql`
    select id
    from members
    where clerk_user_id = ${clerkUserId}
    limit 1
  `
  if (byClerk.rows[0]?.id) {
    const id = byClerk.rows[0].id as string
    await sql`
      update members
      set email = ${email},
          consent_latest_at = now(),
          marketing_opt_in = ${marketingOptIn},
          source_detail = members.source_detail || ${JSON.stringify(sourceDetail)}::jsonb
      where id = ${id}
    `
    await ensureBaselineEntitlements(id, 'clerk login (existing member)')
    return {id, created: false}
  }

  // 2) Claim by email if unclaimed
  const claimed = await sql`
    update members
      set clerk_user_id = ${clerkUserId},
          consent_latest_at = now(),
          marketing_opt_in = ${marketingOptIn},
          source_detail = members.source_detail || ${JSON.stringify(sourceDetail)}::jsonb
    where email = ${email}
      and clerk_user_id is null
    returning id
  `
  if (claimed.rows[0]?.id) {
    const id = claimed.rows[0].id as string
    await ensureBaselineEntitlements(id, 'clerk login (email claim)')
    return {id, created: false}
  }

  // 3) If email exists but is claimed by someone else, fail loud
  const emailRow = await sql`
    select id
    from members
    where email = ${email}
    limit 1
  `
  if (emailRow.rows[0]?.id) {
    throw new Error('Email already claimed by a different Clerk user')
  }

  // 4) Insert new canonical row
  const inserted = await sql`
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
    values (
      ${email},
      ${clerkUserId},
      ${source},
      ${JSON.stringify(sourceDetail)}::jsonb,
      now(),
      now(),
      null,
      ${marketingOptIn}
    )
    returning id, (xmax = 0) as created
  `

  const id = inserted.rows[0].id as string
  const created = inserted.rows[0].created as boolean

  await ensureBaselineEntitlements(id, 'clerk signup (new member)')

  return {id, created}
}

/**
 * Idempotent upsert by email. Returns {id, created}.
 *
 * NOTE: We intentionally avoid ON CONFLICT inference here because your schema currently
 * has a members_email_key object that Postgres will not accept as the arbiter for
 * ON CONFLICT (email). This version is robust regardless of whether uniqueness is
 * enforced by a constraint, expression index, or is temporarily absent.
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

  try {
    const ins = await sql`
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
      returning id
    `
    return {id: ins.rows[0].id as string, created: true}
  } catch (err: unknown) {
    const e = err as {code?: string; message?: string}

    // Duplicate (unique/index) violation — treat as upsert
    if (e?.code === '23505') {
      const upd = await sql`
        update members
        set consent_latest_at = now(),
            marketing_opt_in = ${marketingOptIn},
            source_detail = members.source_detail || ${JSON.stringify(sourceDetail)}::jsonb
        where email = ${email}
        returning id
      `

      if (upd.rows[0]?.id) {
        return {id: upd.rows[0].id as string, created: false}
      }

      // Extremely rare: duplicate was raised on a uniqueness rule not matching `where email = ...`
      // Fall back to lookup.
      const sel = await sql`
        select id
        from members
        where email = ${email}
        limit 1
      `
      if (sel.rows[0]?.id) return {id: sel.rows[0].id as string, created: false}

      throw new Error(`ensureMemberByEmail: duplicate detected but member not found for ${email}`)
    }

    // Bubble anything else
    throw err
  }
}
