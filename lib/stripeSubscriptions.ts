// web/lib/stripeSubscriptions.ts
import 'server-only'
import {sql} from '@vercel/postgres'
import Stripe from 'stripe'
import {ensureMemberByEmail, normalizeEmail} from './members'

type PriceEntitlementRow = {
  price_id: string
  entitlement_key: string
  scope_id: string | null
  scope_meta: unknown
}

function toDateFromUnixSeconds(s: number | null | undefined): Date | null {
  if (!s || s <= 0) return null
  return new Date(s * 1000)
}

function keyOf(entitlementKey: string, scopeId: string | null): string {
  return `${entitlementKey}::${scopeId ?? ''}`
}

async function attachStripeCustomerId(memberId: string, customerId: string): Promise<void> {
  if (!memberId || !customerId) return
  await sql`
    update members
    set stripe_customer_id = ${customerId}
    where id = ${memberId}::uuid
      and (stripe_customer_id is null or stripe_customer_id = ${customerId})
  `
}

/**
 * Reconcile entitlements for a Stripe subscription into entitlement_grants.
 *
 * Conventions:
 * - grant_source = 'stripe_subscription'
 * - grant_source_ref = subscription.id
 *
 * Behaviour:
 * - For all entitlements implied by subscription items, upsert a grant row whose expires_at
 *   equals the item's current_period_end (or now() on cancel/delete).
 * - For entitlements previously associated with this subscription but no longer implied, expire them now.
 */
export async function reconcileStripeSubscription(params: {
  stripe: Stripe
  subscription: Stripe.Subscription
}): Promise<void> {
  const {stripe, subscription: sub} = params

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? '')
  if (!customerId) return

  // 1) Resolve member by stripe_customer_id; if missing, claim/create by customer email then attach.
  const existing = await sql`
    select id
    from members
    where stripe_customer_id = ${customerId}
    limit 1
  `
  let memberId = (existing.rows[0]?.id as string | undefined) ?? null

  if (!memberId) {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) return

    const emailRaw = (customer.email ?? '').toString().trim()
    const email = normalizeEmail(emailRaw)
    if (!email) return

    const ensured = await ensureMemberByEmail({
      email,
      source: 'stripe',
      sourceDetail: {stripe_customer_id: customerId},
      marketingOptIn: true,
    })
    memberId = ensured.id
  }

  // BULLETPROOFING: once we have a memberId, always attach the customer id (idempotent).
  await attachStripeCustomerId(memberId, customerId)

  // 2) Derive price IDs + per-item period ends
  const items = sub.items?.data ?? []
  const priceIds = items.map((it) => it.price?.id).filter((v): v is string => !!v)

  if (priceIds.length === 0) {
    await sql`
      update entitlement_grants
      set expires_at = now()
      where member_id = ${memberId}::uuid
        and grant_source = 'stripe_subscription'
        and grant_source_ref = ${sub.id}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    `
    return
  }

  const endByPriceId = new Map<string, Date | null>()
  for (const it of items) {
    const pid = it.price?.id
    if (!pid) continue
    endByPriceId.set(pid, toDateFromUnixSeconds(it.current_period_end ?? null))
  }

  // 3) Map prices -> entitlements (single query) using JSONB expansion (driver-safe)
  const priceIdsJson = JSON.stringify(priceIds)
  const mapped = await sql`
    select price_id, entitlement_key, scope_id, scope_meta
    from stripe_price_entitlements
    where price_id in (
      select jsonb_array_elements_text(${priceIdsJson}::jsonb)
    )
  `
  const entRows = mapped.rows as PriceEntitlementRow[]

  // 4) Compute "expire now" for terminal statuses
  const status = (sub.status ?? '').toString()
  const expireNow =
    status === 'canceled' || status === 'incomplete_expired' || status === 'unpaid'

  // Build stable key set of desired entitlements (for stale-expiry step)
  const desiredKeys = new Set(entRows.map((r) => keyOf(r.entitlement_key, r.scope_id)))

  // 5) Upsert desired entitlement grants per entitlement row
  for (const r of entRows) {
    const scopeMetaJson = JSON.stringify(r.scope_meta ?? {})
    const itemExpiry = expireNow ? new Date() : (endByPriceId.get(r.price_id) ?? null)

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
  values (
    ${memberId}::uuid,
    ${r.entitlement_key},
    ${r.scope_id},
    ${scopeMetaJson}::jsonb,
    'system',
    'stripe_subscription_reconciled',
    'stripe_subscription',
    ${sub.id},
    ${itemExpiry ? itemExpiry.toISOString() : null}::timestamptz
  )
  on conflict on constraint entitlement_grants_unique_stripe_subscription
  do update set
    scope_meta = excluded.scope_meta,
    expires_at = excluded.expires_at,
    grant_reason = excluded.grant_reason
`;


  }

  // 6) Expire stale entitlements tied to this subscription that are no longer implied
  const existingSubEnts = await sql`
    select entitlement_key, scope_id
    from entitlement_grants
    where member_id = ${memberId}::uuid
      and grant_source = 'stripe_subscription'
      and grant_source_ref = ${sub.id}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  `

  for (const row of existingSubEnts.rows as Array<{entitlement_key: string; scope_id: string | null}>) {
    const k = keyOf(row.entitlement_key, row.scope_id)
    if (desiredKeys.has(k)) continue

    await sql`
      update entitlement_grants
      set expires_at = now()
      where member_id = ${memberId}::uuid
        and entitlement_key = ${row.entitlement_key}
        and coalesce(scope_id,'') = coalesce(${row.scope_id ?? ''},'')
        and grant_source = 'stripe_subscription'
        and grant_source_ref = ${sub.id}
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    `
  }
}
