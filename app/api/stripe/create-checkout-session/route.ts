// web/app/api/stripe/create-checkout-session/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import Stripe from 'stripe'
import {auth} from '@clerk/nextjs/server'
import {normalizeEmail, ensureMemberByEmail} from '../../../../lib/members'

export const runtime = 'nodejs'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '' // e.g. https://www.yourdomain.com
const PRICE_ID = process.env.STRIPE_TEST_SUB_PRICE_ID ?? '' // set this in env

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function sameOriginOrAllowed(req: Request, appUrl: string): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true

  let app: URL
  let o: URL
  try {
    app = new URL(appUrl)
    o = new URL(origin)
  } catch {
    return false
  }

  if (o.origin === app.origin) return true

  // Allow www ↔ bare swap (same protocol)
  const stripWww = (h: string) => h.replace(/^www\./, '')
  if (stripWww(o.hostname) === stripWww(app.hostname) && o.protocol === app.protocol) {
    return true
  }

  // Allow Vercel previews while building
  if (o.hostname.endsWith('.vercel.app')) return true

  return false
}

export async function POST(req: Request) {
  must(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY')
  must(APP_URL, 'NEXT_PUBLIC_APP_URL')
  must(PRICE_ID, 'STRIPE_TEST_SUB_PRICE_ID')

  if (!sameOriginOrAllowed(req, APP_URL)) {
    return NextResponse.json({ok: false, error: 'Bad origin'}, {status: 403})
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  const {userId} = await auth()

  const body = await req.json().catch(() => ({} as unknown))
  const emailFromBody =
    typeof (body as {email?: unknown}).email === 'string' ? (body as {email: string}).email : ''
  const email = normalizeEmail(emailFromBody)

  // If logged out, require an email to attach the purchase to a canonical member.
  if (!userId && !email) {
    return NextResponse.json({ok: false, error: 'Email required when logged out'}, {status: 400})
  }

  // Pre-create/claim member for logged-out flow so you have canonical row immediately.
  if (!userId && email) {
    await ensureMemberByEmail({
      email,
      source: 'checkout',
      sourceDetail: {intent: 'stripe_checkout'},
      marketingOptIn: true,
    })
  }

  // ✅ Logged-in: reuse existing Stripe customer if already linked (prevents duplicate customers)
  let customer: string | undefined
  if (userId) {
    const r = await sql`
      select stripe_customer_id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `
    const cid = (r.rows[0]?.stripe_customer_id as string | null | undefined) ?? null
    if (cid) customer = cid
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{price: PRICE_ID, quantity: 1}],
    success_url: `${APP_URL}/home?checkout=success`,
    cancel_url: `${APP_URL}/home?checkout=cancel`,

    // Logged-in path: webhook can resolve via clerk_user_id
    client_reference_id: userId ?? undefined,

    // ✅ If we already know the customer, reuse it
    customer,

    // Logged-out path: let Stripe attach/collect email
    customer_email: !userId && email ? email : undefined,

    allow_promotion_codes: true,
  })

  return NextResponse.json({ok: true, url: session.url})
}
