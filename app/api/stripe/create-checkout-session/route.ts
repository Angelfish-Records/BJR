import 'server-only'
import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {auth} from '@clerk/nextjs/server'
import {normalizeEmail, ensureMemberByEmail} from '../../../../lib/members'

export const runtime = 'nodejs'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? '' // e.g. https://yourdomain.com
const PRICE_ID = process.env.STRIPE_TEST_SUB_PRICE_ID ?? '' // set this in env

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

export async function POST(req: Request) {
  must(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY')
  must(APP_URL, 'NEXT_PUBLIC_APP_URL')
  must(PRICE_ID, 'STRIPE_TEST_SUB_PRICE_ID')

  const dbg = {
  origin: req.headers.get('origin'),
  host: req.headers.get('host'),
  referer: req.headers.get('referer'),
  appUrl: APP_URL,
  appOrigin: (() => {
    try { return new URL(APP_URL).origin } catch { return 'INVALID_APP_URL' }
  })(),
  url: req.url,
}
return NextResponse.json({ok: false, error: 'DEBUG', dbg}, {status: 403})


  if (!sameOriginOrAllowed(req, APP_URL)) {
  return NextResponse.json({ok: false, error: 'Bad origin'}, {status: 403})
}

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  const {userId} = await auth()
  const body = await req.json().catch(() => ({} as unknown))
  const emailFromBody = typeof (body as {email?: unknown}).email === 'string' ? (body as {email: string}).email : ''
  const email = normalizeEmail(emailFromBody)

  // If logged out, require an email to attach the purchase to a canonical member.
  // (Stripe can collect email too, but being explicit keeps your pipeline deterministic.)
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

function sameOriginOrAllowed(req: Request, appUrl: string): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // non-browser / same-origin fetch edge cases

  let appOrigin = ''
  try {
    appOrigin = new URL(appUrl).origin
  } catch {
    return false
  }

  // Always allow exact match to the configured app origin
  if (origin === appOrigin) return true

  // Allow Vercel preview / deployment domains (common during testing)
  try {
    const o = new URL(origin)
    if (o.hostname.endsWith('.vercel.app')) return true
  } catch {
    return false
  }

  return false
}


  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{price: PRICE_ID, quantity: 1}],
    success_url: `${APP_URL}/home?checkout=success`,
    cancel_url: `${APP_URL}/home?checkout=cancel`,
    // Logged-in path: this is how your existing checkout.session.completed code finds the member.
    client_reference_id: userId ?? undefined,
    // Logged-out path: let Stripe attach/collect email; your webhook + reconcile will link via customer email.
    customer_email: !userId && email ? email : undefined,
    allow_promotion_codes: true,
  })

  return NextResponse.json({ok: true, url: session.url})
}
