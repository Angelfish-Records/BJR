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
 * grant_source = 'stripe_subscription'
 * grant_source_ref = subscription.id
 *
 * We intentionally DO NOT use ON CONFLICT, because your schema may not (and need not)
 * have the exact unique constraints Postgres requires for inference.
 */
export async function reconcileStripeSubscription(params: {
  stripe: Stripe
  subscription: Stripe.Subscription
}): Promise<void> {
  const {stripe, subscription: sub} = params

  const customerId =
    typeof sub.customer === 'string' ? sub.customer : (sub.customer?.id ?? '')
  if (!customerId) return

  // 1) Resolve member by stripe_customer_id; else ensure by email and attach.
  const memberByCustomer = await sql`
    select id
    from members
    where stripe_customer_id = ${customerId}
    limit 1
  `
  let memberId = (memberByCustomer.rows[0]?.id as string | undefined) ?? null

  if (!memberId) {
    const customer = await stripe.customers.retrieve(customerId)
    if (customer.deleted) return

    const email = normalizeEmail(customer.email ?? '')
    if (!email) return

    const ensured = await ensureMemberByEmail({
      email,
      source: 'stripe',
      sourceDetail: {stripe_customer_id: customerId},
      marketingOptIn: true,
    })
    memberId = ensured.id
  }

  await attachStripeCustomerId(memberId, customerId)

  // 2) Collect subscription item price IDs + per-item period ends
  const items = sub.items?.data ?? []
  const priceIds = items.map((it) => it.price?.id).filter(Boolean) as string[]

  // 3) Terminal statuses expire immediately
  const status = (sub.status ?? '').toString()
  const expireNow =
    status === 'canceled' || status === 'incomplete_expired' || status === 'unpaid'

  if (priceIds.length === 0) {
    // No items: expire all currently-active grants tied to this subscription
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

  // 4) Map prices -> entitlements (single query)
  const mapped = await sql`
    select price_id, entitlement_key, scope_id, scope_meta
    from stripe_price_entitlements
    where price_id in (
      select jsonb_array_elements_text(${JSON.stringify(priceIds)}::jsonb)
    )
  `
  const desiredRows = mapped.rows as PriceEntitlementRow[]
  const desiredKeys = new Set(desiredRows.map((r) => keyOf(r.entitlement_key, r.scope_id)))

  // If the mapping is empty, treat it as “this subscription grants nothing”:
  // expire any existing grants tied to this subscription so nothing lingers.
  if (desiredRows.length === 0) {
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

  // 5) Insert desired grants if not already active for this (member,key,scope,source,ref)
  for (const r of desiredRows) {
    const expiry = expireNow ? new Date() : (endByPriceId.get(r.price_id) ?? null)

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
        ${r.entitlement_key},
        ${r.scope_id},
        ${JSON.stringify(r.scope_meta ?? {})}::jsonb,
        'system',
        'stripe_subscription_reconciled',
        'stripe_subscription',
        ${sub.id},
        ${expiry ? expiry.toISOString() : null}::timestamptz
      where not exists (
        select 1
        from entitlement_grants eg
        where eg.member_id = ${memberId}::uuid
          and eg.entitlement_key = ${r.entitlement_key}
          and coalesce(eg.scope_id,'') = coalesce(${r.scope_id ?? ''},'')
          and eg.grant_source = 'stripe_subscription'
          and eg.grant_source_ref = ${sub.id}
          and eg.revoked_at is null
          and (eg.expires_at is null or eg.expires_at > now())
      )
    `
  }

  // 6) Expire stale grants tied to this subscription that are no longer desired
  const activeGrantsForSub = await sql`
    select entitlement_key, scope_id
    from entitlement_grants
    where member_id = ${memberId}::uuid
      and grant_source = 'stripe_subscription'
      and grant_source_ref = ${sub.id}
      and revoked_at is null
      and (expires_at is null or expires_at > now())
  `

  for (const row of activeGrantsForSub.rows as Array<{entitlement_key: string; scope_id: string | null}>) {
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
