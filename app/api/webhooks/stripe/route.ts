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

async function getMemberIdByClerkUserId(clerkUserId: string): Promise<string | null> {
  const res = await sql`
    select id
    from members
    where clerk_user_id = ${clerkUserId}
    limit 1
  `
  return (res.rows[0]?.id as string | undefined) ?? null
}

async function attachStripeCustomerId(memberId: string, customerId: string) {
  if (!customerId) return
  await sql`
    update members
    set stripe_customer_id = ${customerId}
    where id = ${memberId}::uuid
      and (stripe_customer_id is null or stripe_customer_id = ${customerId})
  `
}

function safeErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
  const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  // Missing env vars is a server misconfig; return 500 so you notice.
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ok: false, error: 'Missing Stripe env vars'}, {status: 500})
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    // Signature missing is a bad request; return 400.
    return NextResponse.json({ok: false, error: 'Missing stripe-signature'}, {status: 400})
  }

  const body = await req.text()
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    // Invalid signature should be a 400; Stripe will not keep retrying forever.
    const msg = e instanceof Error ? e.message : 'Invalid signature'
    return NextResponse.json({ok: false, error: msg}, {status: 400})
  }

  // From here on: never 500 to Stripe. Log + 200 so retries don't become “business logic”.
  try {
    // ---- Subscription lifecycle (authoritative for subscription entitlements) ----
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription
      await reconcileStripeSubscription({stripe, subscription: sub})
      return NextResponse.json({ok: true})
    }

    // ---- Checkout session completed (useful for one-off purchases) ----
    if (event.type !== 'checkout.session.completed') {
      return NextResponse.json({ok: true})
    }

    const session = event.data.object as Stripe.Checkout.Session

    // Resolve member via Clerk if present; otherwise via email (logged-out purchases)
    const clerkUserId = (session.client_reference_id ?? '').toString().trim()
    let memberId: string | null = null

    if (clerkUserId) {
      memberId = await getMemberIdByClerkUserId(clerkUserId)
    }

    if (!memberId) {
      const emailRaw =
        (session.customer_details?.email ?? session.customer_email ?? '').toString().trim()
      const email = normalizeEmail(emailRaw)
      if (email) {
        const ensured = await ensureMemberByEmail({
          email,
          source: 'stripe',
          sourceDetail: {checkout_session_id: session.id},
          marketingOptIn: true,
        })
        memberId = ensured.id
      }
    }

    if (!memberId) {
      // Can't safely attribute to a member; acknowledge to avoid Stripe retries
      return NextResponse.json({ok: true})
    }

    // Attach customer id if available (helps future subscription linking)
    const customerId =
      (typeof session.customer === 'string' ? session.customer : session.customer?.id) ?? ''
    if (customerId) await attachStripeCustomerId(memberId, customerId)

    const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {limit: 100})

    const priceIds = lineItems.data.map((li) => li.price?.id).filter((v): v is string => !!v)
    if (priceIds.length === 0) return NextResponse.json({ok: true})

    // Batch fetch mappings (driver-safe array handling)
    const priceIdsJson = JSON.stringify(priceIds)
    const mapped = await sql`
      select price_id, entitlement_key, scope_id, scope_meta
      from stripe_price_entitlements
      where price_id in (
        select jsonb_array_elements_text(${priceIdsJson}::jsonb)
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
    // IMPORTANT: acknowledge anyway so Stripe doesn't retry forever.
    return NextResponse.json({ok: true})
  }
}
