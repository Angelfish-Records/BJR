// web/app/api/stripe/create-album-checkout-session/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {auth, currentUser} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {getAlbumOffer} from '../../../../lib/albumOffers'
import {normalizeEmail, ensureMemberByEmail} from '../../../../lib/members'

export const runtime = 'nodejs'

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

  const stripWww = (h: string) => h.replace(/^www\./, '')
  if (stripWww(o.hostname) === stripWww(app.hostname) && o.protocol === app.protocol) return true

  if (o.hostname.endsWith('.vercel.app')) return true
  return false
}

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = must(process.env.STRIPE_SECRET_KEY ?? '', 'STRIPE_SECRET_KEY')
  const APP_URL = must(process.env.NEXT_PUBLIC_APP_URL ?? '', 'NEXT_PUBLIC_APP_URL')

  if (!sameOriginOrAllowed(req, APP_URL)) {
    return NextResponse.json({ok: false, error: 'Bad origin'}, {status: 403})
  }

  const body = (await req.json().catch(() => null)) as null | {albumSlug?: unknown; email?: unknown}
  const albumSlug = (body?.albumSlug ?? '').toString().trim().toLowerCase()
  if (!albumSlug) return NextResponse.json({ok: false, error: 'Missing albumSlug'}, {status: 400})

  const offer = getAlbumOffer(albumSlug)
  if (!offer) return NextResponse.json({ok: false, error: 'Unknown albumSlug'}, {status: 400})

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  const {userId} = await auth()
  const user = userId ? await currentUser() : null
  const emailFromClerk =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? ''
  const emailFromBody = typeof body?.email === 'string' ? body.email : ''
  const email = normalizeEmail(emailFromClerk || emailFromBody)

  // Logged-out buyers: require an email so the purchase can be reconciled deterministically.
  if (!userId && !email) {
    return NextResponse.json({ok: false, error: 'Email required when logged out'}, {status: 400})
  }

  // Pre-create member for logged-out path (makes webhook linking less brittle)
  if (!userId && email) {
    await ensureMemberByEmail({
      email,
      source: 'album_checkout',
      sourceDetail: {intent: 'stripe_album_checkout', albumSlug: offer.albumSlug},
      marketingOptIn: true,
    })
  }

  // Logged-in: reuse existing customer if linked to avoid duplicate Stripe customers
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

  const success_url = `${APP_URL}/home?checkout=success&panel=portal`
  const cancel_url = `${APP_URL}/home?checkout=cancel&panel=portal`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{price: offer.stripePriceId, quantity: 1}],
    allow_promotion_codes: true,

    success_url,
    cancel_url,

    client_reference_id: userId ?? undefined,
    customer,
    customer_email: !userId && email ? email : undefined,

    metadata: {albumSlug: offer.albumSlug, offer: 'digital_album'},
  })

  return NextResponse.json({ok: true, url: session.url})
}
