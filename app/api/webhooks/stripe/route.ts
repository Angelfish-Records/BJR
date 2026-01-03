// web/app/api/webhooks/stripe/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import Stripe from 'stripe'

export const runtime = 'nodejs'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? ''

const stripeClient = new Stripe(STRIPE_SECRET_KEY)

type PriceEntitlementRow = {
  entitlement_key: string
  scope_id: string | null
  scope_meta: unknown
}

export async function POST(req: Request) {
  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      {ok: false, error: 'Missing Stripe env vars'},
      {status: 500}
    )
  }

  const sig = req.headers.get('stripe-signature')
  if (!sig) {
    return NextResponse.json(
      {ok: false, error: 'Missing stripe-signature'},
      {status: 400}
    )
  }

  const body = await req.text()

  let event: Stripe.Event
  try {
    event = stripeClient.webhooks.constructEvent(body, sig, STRIPE_WEBHOOK_SECRET)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid signature'
    return NextResponse.json({ok: false, error: msg}, {status: 400})
  }

  if (event.type !== 'checkout.session.completed') {
    return NextResponse.json({ok: true})
  }

  const session = event.data.object as Stripe.Checkout.Session

  const clerkUserId = (session.client_reference_id ?? '').toString().trim()
  if (!clerkUserId) return NextResponse.json({ok: true})

  const m = await sql`
    select id
    from members
    where clerk_user_id = ${clerkUserId}
    limit 1
  `
  const memberId = (m.rows[0]?.id as string | undefined) ?? null
  if (!memberId) return NextResponse.json({ok: true})

  const lineItems = await stripeClient.checkout.sessions.listLineItems(session.id, {
    limit: 100,
  })

  for (const li of lineItems.data) {
    const priceId = li.price?.id
    if (!priceId) continue

    const mapped = await sql`
      select entitlement_key, scope_id, scope_meta
      from stripe_price_entitlements
      where price_id = ${priceId}
    `
    const rows = mapped.rows as PriceEntitlementRow[]

    for (const r of rows) {
      await sql`
        insert into entitlement_grants (
          member_id,
          entitlement_key,
          scope_id,
          scope_meta,
          granted_by,
          grant_reason,
          grant_source,
          grant_source_ref
        )
        select
          ${memberId},
          ${r.entitlement_key},
          ${r.scope_id},
          ${JSON.stringify(r.scope_meta ?? {})}::jsonb,
          'system',
          'stripe_checkout_completed',
          'stripe',
          ${session.id}
        where not exists (
          select 1
          from entitlement_grants eg
          where eg.member_id = ${memberId}
            and eg.entitlement_key = ${r.entitlement_key}
            and coalesce(eg.scope_id,'') = coalesce(${r.scope_id ?? ''},'')
            and eg.revoked_at is null
            and (eg.expires_at is null or eg.expires_at > now())
        )
      `
    }
  }

  return NextResponse.json({ok: true})
}
