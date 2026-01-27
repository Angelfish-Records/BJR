// web/app/api/gifts/create/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import Stripe from 'stripe'
import {sql} from '@vercel/postgres'
import {auth, currentUser} from '@clerk/nextjs/server'

import {getAlbumOffer} from '@/lib/albumOffers'
import {assertLooksLikeEmail, normalizeEmail} from '@/lib/members'
import {newCorrelationId} from '@/lib/events'

export const runtime = 'nodejs'

type Req = {
  albumSlug: string
  recipientEmail: string
  message?: string
}

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function safeOrigin(req: NextRequest): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim()
  if (env) return env.replace(/\/$/, '')
  return req.nextUrl.origin
}

export async function POST(req: NextRequest) {
  const correlationId = newCorrelationId()

  const body = (await req.json().catch(() => null)) as Req | null
  if (!body?.albumSlug || !body?.recipientEmail) {
    return NextResponse.json({ok: false, error: 'MISSING_FIELDS'}, {status: 400})
  }

  const albumSlug = String(body.albumSlug).trim().toLowerCase()
  const offer = getAlbumOffer(albumSlug)
  if (!offer) return NextResponse.json({ok: false, error: 'UNKNOWN_ALBUM'}, {status: 404})

  const recipientEmail = normalizeEmail(String(body.recipientEmail))
  try {
    assertLooksLikeEmail(recipientEmail)
  } catch {
    return NextResponse.json({ok: false, error: 'INVALID_RECIPIENT_EMAIL'}, {status: 400})
  }

  const message = body.message ? String(body.message).slice(0, 1200) : null

  // Optional sender context (anon allowed)
  const {userId} = await auth()
  let senderMemberId: string | null = null
  let senderEmail: string | null = null

  if (userId) {
    const u = await currentUser()
    senderEmail =
      normalizeEmail(
        u?.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
          u?.emailAddresses?.[0]?.emailAddress ??
          ''
      ) || null

    const senderRes = await sql`
      select id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `
    senderMemberId = (senderRes.rows[0]?.id as string | undefined) ?? null
  }

  // Create gift row BEFORE Stripe so we can anchor everything on giftId (Pattern B)
  const ins = await sql`
    insert into gifts (
      album_slug,
      entitlement_key,
      recipient_email,
      recipient_member_id,
      sender_member_id,
      message,
      status,
      sender_email
    )
    values (
      ${albumSlug},
      ${offer.entitlementKey},
      ${recipientEmail},
      null,
      ${senderMemberId}::uuid,
      ${message},
      'pending_payment'::gift_status,
      ${senderEmail}
    )
    returning id
  `
  const giftId = (ins.rows[0]?.id as string | undefined) ?? null
  if (!giftId) {
    return NextResponse.json({ok: false, error: 'GIFT_CREATE_FAILED'}, {status: 500})
  }

  const STRIPE_SECRET_KEY = must(process.env.STRIPE_SECRET_KEY ?? '', 'STRIPE_SECRET_KEY')
  const stripe = new Stripe(STRIPE_SECRET_KEY)

  const origin = safeOrigin(req)
  const success_url = `${origin}/home?gift=success&panel=portal`
  const cancel_url = `${origin}/home?gift=cancel&panel=portal`

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [{price: offer.stripePriceId, quantity: 1}],
    allow_promotion_codes: true,
    success_url,
    cancel_url,

    // Best-effort linkage/debug only
    client_reference_id: userId ?? undefined,
    customer_email: senderEmail ?? undefined,

    metadata: {
      kind: 'gift',
      giftId, // primary anchor now
      albumSlug,
      entitlementKey: offer.entitlementKey,
      recipientEmail,
      senderMemberId: senderMemberId ?? '',
      correlationId,
    },
  })

  await sql`
    update gifts
    set stripe_checkout_session_id = ${session.id}
    where id = ${giftId}::uuid
  `

  return NextResponse.json({
    ok: true,
    giftId,
    albumSlug,
    recipientEmail,
    checkoutUrl: session.url,
    stripeCheckoutSessionId: session.id,
    correlationId,
    note: 'Gift claim email will be sent after payment completes.',
  })
}
