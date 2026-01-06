import 'server-only'
import {NextResponse} from 'next/server'
import Stripe from 'stripe'
import {auth, currentUser} from '@clerk/nextjs/server'
import {getAlbumOffer} from '../../../../lib/albumOffers'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? ''
  if (!STRIPE_SECRET_KEY) {
    return NextResponse.json({ok: false, error: 'Missing STRIPE_SECRET_KEY'}, {status: 500})
  }

  const body = (await req.json().catch(() => null)) as null | {albumSlug?: unknown}
  const albumSlug = (body?.albumSlug ?? '').toString().trim().toLowerCase()
  
  if (!albumSlug) return NextResponse.json({ok: false, error: 'Missing albumSlug'}, {status: 400})

  const offer = getAlbumOffer(albumSlug)
  if (!offer) return NextResponse.json({ok: false, error: 'Unknown albumSlug'}, {status: 400})
  if (!offer.stripePriceId) return NextResponse.json({ok: false, error: 'Offer missing stripePriceId'}, {status: 500})

  const stripe = new Stripe(STRIPE_SECRET_KEY)

  const {userId} = await auth()
  const user = userId ? await currentUser() : null
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null

  const origin = req.headers.get('origin') ?? ''
  if (!origin) return NextResponse.json({ok: false, error: 'Missing origin'}, {status: 400})

  // Return user to Portal panel after purchase.
  const success_url = `${origin}/home?checkout=success&panel=portal`
  const cancel_url = `${origin}/home?checkout=cancel&panel=portal`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    // Let Stripe collect email if signed out; if signed in we pass it through.
    customer_email: email ?? undefined,
    // Useful for attribution in your webhook (member resolution)
    client_reference_id: userId ?? undefined,

    line_items: [{price: offer.stripePriceId, quantity: 1}],
    allow_promotion_codes: true,

    success_url,
    cancel_url,

    // Helps you reason about what was bought, without embedding entitlement logic in the session.
    metadata: {albumSlug: offer.albumSlug, offer: 'digital_album'},
  })

  return NextResponse.json({ok: true, url: session.url})
}
