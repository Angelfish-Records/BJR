// web/app/api/webhooks/stripe/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import Stripe from 'stripe'
import {ensureMemberByEmail, normalizeEmail} from '../../../../lib/members'
import {grantEntitlement} from '../../../../lib/entitlementOps'
import {reconcileStripeSubscription} from '../../../../lib/stripeSubscriptions'

export const runtime = 'nodejs'

type PriceEntitlementRow = {
  price_id: string
  entitlement_key: string
  scope_id: string | null
  scope_meta: unknown
}

function safeErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

async function getMemberIdByClerkUserId(clerkUserId: string): Promise<string | null> {
  if (!clerkUserId) return null
  const res = await sql`
    select id
    from members
    where clerk_user_id = ${clerkUserId}
    limit 1
  `
  return (res.rows[0]?.id as string | undefined) ?? null
}

async function getMemberIdByStripeCustomerId(customerId: string): Promise<string | null> {
  if (!customerId) return null
  const res = await sql`
    select id
    from members
    where stripe_customer_id = ${customerId}
    limit 1
  `
  return (res.rows[0]?.id as string | undefined) ?? null
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

async function resolveMemberIdFromSession(session: Stripe.Checkout.Session): Promise<{
  memberId: string | null
  customerId: string
}> {
  const customerId =
    (typeof session.customer === 'string' ? session.customer : session.customer?.id) ?? ''

  // 1) Best: already linked by customer id
  if (customerId) {
    const byCustomer = await getMemberIdByStripeCustomerId(customerId)
    if (byCustomer) return {memberId: byCustomer, customerId}
  }

  // 2) Next: Clerk user id in client_reference_id
  const clerkUserId = (session.client_reference_id ?? '').toString().trim()
  if (clerkUserId) {
    const byClerk = await getMemberIdByClerkUserId(clerkUserId)
    if (byClerk) return {memberId: byClerk, customerId}
  }

  // 3) Last: email
  const emailRaw = (session.customer_details?.email ?? session.customer_email ?? '').toString().trim()
  const email = normalizeEmail(emailRaw)
  if (email) {
    const ensured = await ensureMemberByEmail({
      email,
      source: 'stripe',
      sourceDetail: {checkout_session_id: session.id},
      marketingOptIn: true,
    })
    return {memberId: ensured.id, customerId}
  }

  return {memberId: null, customerId}
}

async function finalizeGiftPurchase(session: Stripe.Checkout.Session): Promise<void> {
  const md = (session.metadata ?? {}) as Record<string, string>

  const tokenHash = (md.giftTokenHash ?? '').trim()
  const recipientEmail = normalizeEmail((md.recipientEmail ?? '').trim())
  const entitlementKey = (md.entitlementKey ?? '').trim()
  const albumSlug = (md.albumSlug ?? '').trim()

  if (!tokenHash || !recipientEmail || !entitlementKey) return

  // Resolve gift row (by hash; session id is also stored but may be absent if a session was created elsewhere)
  const g = await sql`
    select id, status
    from gifts
    where token_hash = ${tokenHash}
    limit 1
  `
  const giftId = (g.rows[0]?.id as string | undefined) ?? null
  if (!giftId) return

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : null
  const currency = (session.currency ?? '').toString() || null

  // Transition to paid only from draft/pending_payment (idempotent)
  const upd = await sql`
    update gifts
    set status = 'paid'::gift_status,
        paid_at = coalesce(paid_at, now()),
        stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${session.id}),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${paymentIntentId}),
        amount_total_cents = coalesce(amount_total_cents, ${amountTotal}),
        currency = coalesce(currency, ${currency})
    where id = ${giftId}::uuid
      and status in ('draft'::gift_status, 'pending_payment'::gift_status)
    returning id
  `
  if (upd.rowCount === 0) return // already paid/claimed/etc.

  // Ensure recipient member and attach to gift row
  const ensured = await ensureMemberByEmail({
    email: recipientEmail,
    source: 'gift_paid',
    sourceDetail: {album_slug: albumSlug, stripe_session_id: session.id},
    marketingOptIn: true,
  })

  await sql`
    update gifts
    set recipient_member_id = ${ensured.id}::uuid
    where id = ${giftId}::uuid
      and recipient_member_id is null
  `

  // Grant entitlement to recipient (canonical)
  await grantEntitlement({
    memberId: ensured.id,
    entitlementKey,
    grantedBy: 'system',
    grantReason: `gift_paid:${albumSlug || 'unknown'}`,
    grantSource: 'stripe_gift',
    grantSourceRef: session.id,
    expiresAt: null,
    correlationId: session.id,
    eventSource: 'server',
  })
}

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ok: false, error: 'Missing Stripe env vars'}, {status: 500})
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json({ok: false, error: 'Missing stripe-signature'}, {status: 400})
  }

  const body = await req.text()
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid signature'
    return NextResponse.json({ok: false, error: msg}, {status: 400})
  }

  // --- Idempotency: dedupe webhook deliveries by Stripe event.id ---
  const dedupe = await sql`
    insert into stripe_webhook_events (event_id, type)
    values (${event.id}, ${event.type})
    on conflict (event_id) do nothing
    returning event_id
  `
  if (dedupe.rowCount === 0) {
    return NextResponse.json({ok: true, deduped: true})
  }

  try {
    // ---- Subscription lifecycle ----
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription
      await reconcileStripeSubscription({stripe, subscription: sub})
      return NextResponse.json({ok: true})
    }

    // ---- Checkout session completed ----
    if (event.type !== 'checkout.session.completed') {
      return NextResponse.json({ok: true})
    }

    const session = event.data.object as Stripe.Checkout.Session

    // Gift purchases: finalize against gifts ledger + grant to recipient, not purchaser.
    const md = (session.metadata ?? {}) as Record<string, string>
    if ((md.kind ?? '') === 'gift' || (md.giftTokenHash ?? '').trim()) {
      await finalizeGiftPurchase(session)
      return NextResponse.json({ok: true})
    }

    // Non-gift checkout continues as before
    const {memberId, customerId} = await resolveMemberIdFromSession(session)
    if (!memberId) return NextResponse.json({ok: true})

    if (customerId) await attachStripeCustomerId(memberId, customerId)

    if (session.mode === 'subscription') {
      if (typeof session.subscription === 'string' && session.subscription) {
        const sub = await stripe.subscriptions.retrieve(session.subscription)
        await reconcileStripeSubscription({stripe, subscription: sub})
      }
      return NextResponse.json({ok: true})
    }

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {limit: 100})
    const priceIds = lineItems.data.map((li) => li.price?.id).filter((v): v is string => !!v)
    if (priceIds.length === 0) return NextResponse.json({ok: true})

    const mapped = await sql`
      select price_id, entitlement_key, scope_id, scope_meta
      from stripe_price_entitlements
      where price_id in (
        select jsonb_array_elements_text(${JSON.stringify(priceIds)}::jsonb)
      )
    `
    const rows = mapped.rows as PriceEntitlementRow[]

    for (const r of rows) {
      await grantEntitlement({
        memberId,
        entitlementKey: r.entitlement_key,
        scopeId: r.scope_id,
        scopeMeta: (r.scope_meta ?? {}) as Record<string, unknown>,
        grantedBy: 'system',
        grantReason: 'stripe_checkout_completed',
        grantSource: 'stripe',
        grantSourceRef: session.id,
        expiresAt: null,
        correlationId: session.id,
        eventSource: 'server',
      })
    }

    return NextResponse.json({ok: true})
  } catch (err) {
    console.error('stripe webhook handler error', {
      eventId: event.id,
      type: event.type,
      message: safeErrMessage(err),
    })
    return NextResponse.json({ok: true})
  }
}
