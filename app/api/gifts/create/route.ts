// web/app/api/gifts/create/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import crypto from 'crypto'
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

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function makeToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function encMailto(s: string): string {
  return encodeURIComponent(s).replace(/%20/g, '+')
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

  const origin = safeOrigin(req)

  // Mint token + store only hash
  const token = makeToken()
  const tokenHash = sha256Hex(token)
  const claimUrl = `${origin}/gift/${token}`

  // Insert the gift row as pending payment (no entitlements granted here)
  await sql`
    insert into gifts (
      token_hash,
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
      ${tokenHash},
      ${albumSlug},
      ${offer.entitlementKey},
      ${recipientEmail},
      null,
      ${senderMemberId}::uuid,
      ${message},
      'pending_payment'::gift_status,
      ${senderEmail}
    )
  `

  // Create Stripe Checkout Session for the gift purchase
  const STRIPE_SECRET_KEY = must(process.env.STRIPE_SECRET_KEY ?? '', 'STRIPE_SECRET_KEY')
  const stripe = new Stripe(STRIPE_SECRET_KEY)

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
      albumSlug,
      entitlementKey: offer.entitlementKey,
      giftTokenHash: tokenHash,
      recipientEmail,
      senderMemberId: senderMemberId ?? '',
      correlationId,
    },
  })

  // Persist Stripe session id (unique indexed)
  await sql`
    update gifts
    set stripe_checkout_session_id = ${session.id}
    where token_hash = ${tokenHash}
  `

  // Mailto content (still useful even if you later swap to Resend)
  const subject = `You’ve been gifted: ${offer.title}`
  const bodyText =
    `Someone bought you a copy of "${offer.title}".\n\n` +
    `Claim it here:\n${claimUrl}\n\n` +
    (message ? `Message:\n${message}\n\n` : '') +
    `When you sign in, use this email address: ${recipientEmail}\n\n` +
    `Note: the gift activates after payment completes.`

  const mailto = `mailto:${encMailto(recipientEmail)}?subject=${encMailto(subject)}&body=${encMailto(bodyText)}`

  return NextResponse.json({
    ok: true,
    albumSlug,
    recipientEmail,
    claimUrl,
    subject,
    body: bodyText,
    mailto,
    checkoutUrl: session.url,
    stripeCheckoutSessionId: session.id,
    correlationId,
  })
}
