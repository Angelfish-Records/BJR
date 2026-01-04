// web/app/api/stripe/cancel-subscription/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import Stripe from 'stripe'
import {auth} from '@clerk/nextjs/server'

export const runtime = 'nodejs'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '' // used only for same-origin guard

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function safeOrigin(req: Request): string | null {
  const o = req.headers.get('origin')
  return o ? o.toString() : null
}

function appOrigin(): string | null {
  try {
    return new URL(APP_URL).origin
  } catch {
    return null
  }
}

function sameOriginOrAllowed(req: Request): boolean {
  const o = safeOrigin(req)
  const a = appOrigin()
  if (!o || !a) return true // don't brick yourself if env is weird; auth still protects this
  return o === a
}

type MemberStripeRow = {member_id: string; stripe_customer_id: string | null}

export async function POST(req: Request) {
  must(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY')
  must(APP_URL, 'NEXT_PUBLIC_APP_URL')

  // Optional: same-origin guard (auth is the real gate).
  if (!sameOriginOrAllowed(req)) {
    return NextResponse.json({ok: false, error: 'Bad origin'}, {status: 403})
  }

  const {userId} = await auth()
  if (!userId) {
    return NextResponse.json({ok: false, error: 'Not signed in'}, {status: 401})
  }

  const row = await sql`
    select id as member_id, stripe_customer_id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  const m = (row.rows[0] as MemberStripeRow | undefined) ?? null
  const customerId = (m?.stripe_customer_id ?? '').toString().trim()

  if (!customerId) {
    return NextResponse.json(
      {ok: false, error: 'No stripe_customer_id linked for this member'},
      {status: 400}
    )
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  // Cancel ALL non-terminal subscriptions for this customer (safe default).
  // If you later introduce multiple plans, you can narrow this to a specific price/product.
  const subs = await stripe.subscriptions.list({customer: customerId, status: 'all', limit: 100})

  const cancellable = subs.data.filter((s) =>
    ['active', 'trialing', 'past_due', 'unpaid'].includes((s.status ?? '').toString())
  )

  if (cancellable.length === 0) {
    return NextResponse.json({ok: true, canceled: [], note: 'No active subscriptions found'})
  }

  const canceledIds: string[] = []
  for (const s of cancellable) {
    // Immediate cancellation (no proration, no invoice-now).
    await stripe.subscriptions.cancel(s.id, {prorate: false, invoice_now: false})
    canceledIds.push(s.id)
  }

  // IMPORTANT: do not mutate entitlements here.
  // Webhook (subscription.updated/deleted) will reconcile into entitlement_grants.
  return NextResponse.json({ok: true, canceled: canceledIds})
}
