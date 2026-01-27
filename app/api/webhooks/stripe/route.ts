// web/app/api/webhooks/stripe/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import Stripe from 'stripe'
import crypto from 'crypto'

import {ensureMemberByEmail, normalizeEmail} from '../../../../lib/members'
import {grantEntitlement} from '../../../../lib/entitlementOps'
import {reconcileStripeSubscription} from '../../../../lib/stripeSubscriptions'
import {Resend} from 'resend'
import {GiftCreatedEmail} from '@/emails'
import {getAlbumEmailMetaBySlug} from '@/lib/albums'

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

function must(v: string | undefined, name: string) {
  const s = (v ?? '').trim()
  if (!s) throw new Error(`Missing ${name}`)
  return s
}

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function appOrigin(): string {
  return must(process.env.NEXT_PUBLIC_APP_URL, 'NEXT_PUBLIC_APP_URL').replace(/\/$/, '')
}

function guessSenderName(senderEmail: string | null): string | null {
  if (!senderEmail) return null
  const local = senderEmail.split('@')[0] ?? ''
  const cleaned = local.replace(/[._-]+/g, ' ').trim()
  if (!cleaned) return null
  // Title-case-ish, but keep it simple.
  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((w) => w.slice(0, 1).toUpperCase() + w.slice(1))
    .join(' ')
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

async function sendGiftCreatedEmail(args: {
  giftId: string
  to: string
  giftUrl: string
  albumTitle: string
  albumArtist?: string
  albumCoverUrl?: string
  personalNote?: string | null
  senderName?: string | null
}) {
  const resend = new Resend(process.env.RESEND_API_KEY ?? 're_dummy')
  const from = must(process.env.RESEND_FROM_GIFTS, 'RESEND_FROM_GIFTS')

  const subject = `🎁 You’ve been gifted ${args.albumTitle || 'a release'}`

  const {data, error} = await resend.emails.send({
    from,
    to: [args.to],
    subject,
    // route.ts is not TSX: avoid JSX.
    react: GiftCreatedEmail({
      appName: 'BJR',
      toEmail: args.to,
      albumTitle: args.albumTitle || 'a release',
      albumArtist: args.albumArtist,
      albumCoverUrl: args.albumCoverUrl,
      personalNote: args.personalNote ?? null,
      senderName: args.senderName ?? null,
      giftUrl: args.giftUrl,
      supportEmail: 'gifts@post.brendanjohnroch.com',
    }),
    tags: [{name: 'kind', value: 'gift'}],
  })

  if (error) throw new Error(error.message)

  await sql`
    update gifts
    set gift_email_sent_at = coalesce(gift_email_sent_at, now()),
        gift_email_resend_id = coalesce(gift_email_resend_id, ${data?.id ?? null})
    where id = ${args.giftId}::uuid
  `
}

async function finalizeGiftPurchase(session: Stripe.Checkout.Session): Promise<void> {
  // Only finalize when Stripe considers it paid.
  // (Prevents async methods from marking paid too early.)
  const paymentStatus = (session.payment_status ?? '').toString()
  if (paymentStatus && paymentStatus !== 'paid') return

  const md = (session.metadata ?? {}) as Record<string, string>

  // Prefer metadata anchors (legacy + current)
  const giftIdFromMd = (md.giftId ?? '').trim()
  const tokenHashFromMd = (md.giftTokenHash ?? '').trim() // legacy support

  // Fallback: resolve by checkout session id (most reliable anchor you already store)
  let resolvedGiftId: string | null = null

  if (giftIdFromMd) {
    const r = await sql`
      select id
      from gifts
      where id = ${giftIdFromMd}::uuid
      limit 1
    `
    resolvedGiftId = (r.rows[0]?.id as string | undefined) ?? null
  } else if (tokenHashFromMd) {
    const r = await sql`
      select id
      from gifts
      where token_hash = ${tokenHashFromMd}
      limit 1
    `
    resolvedGiftId = (r.rows[0]?.id as string | undefined) ?? null
  } else {
    const r = await sql`
      select id
      from gifts
      where stripe_checkout_session_id = ${session.id}
      limit 1
    `
    resolvedGiftId = (r.rows[0]?.id as string | undefined) ?? null
  }

  if (!resolvedGiftId) return

  // Pull canonical gift fields (use these as truth; metadata is best-effort)
  const giftRowRes = await sql`
    select
      id,
      status,
      album_slug,
      entitlement_key,
      recipient_email,
      recipient_member_id,
      message,
      sender_email,
      gift_email_dedupe_hash
    from gifts
    where id = ${resolvedGiftId}::uuid
    limit 1
  `
  const giftRow = giftRowRes.rows[0] as
    | {
        id: string
        status: string
        album_slug: string
        entitlement_key: string
        recipient_email: string
        recipient_member_id: string | null
        message: string | null
        sender_email: string | null
        gift_email_dedupe_hash: string | null
      }
    | undefined

  if (!giftRow) return

  // Determine working values (prefer DB row; fall back to metadata if needed)
  const recipientEmail =
    normalizeEmail((giftRow.recipient_email ?? '').trim()) ||
    normalizeEmail((md.recipientEmail ?? '').trim())

  const entitlementKey = (giftRow.entitlement_key ?? '').trim() || (md.entitlementKey ?? '').trim()
  const albumSlug = (giftRow.album_slug ?? '').trim() || (md.albumSlug ?? '').trim()

  if (!recipientEmail || !entitlementKey) return

  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id ?? null

  const amountTotal = typeof session.amount_total === 'number' ? session.amount_total : null
  const currency = (session.currency ?? '').toString() || null

  // Transition to paid only from draft/pending_payment (idempotent)
  await sql`
    update gifts
    set status = 'paid'::gift_status,
        paid_at = coalesce(paid_at, now()),
        stripe_checkout_session_id = coalesce(stripe_checkout_session_id, ${session.id}),
        stripe_payment_intent_id = coalesce(stripe_payment_intent_id, ${paymentIntentId}),
        amount_total_cents = coalesce(amount_total_cents, ${amountTotal}),
        currency = coalesce(currency, ${currency})
    where id = ${resolvedGiftId}::uuid
      and status in ('draft'::gift_status, 'pending_payment'::gift_status)
  `

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
    where id = ${resolvedGiftId}::uuid
      and recipient_member_id is null
  `

  // Canonical entitlement grant (idempotent in entitlementOps)
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

  // Dedupe gate: mint ONCE so we never send twice.
  const dedupeCode = crypto.randomBytes(32).toString('base64url')
  const dedupeHash = sha256Hex(dedupeCode)

  const gate = await sql`
    update gifts
    set gift_email_dedupe_hash = ${dedupeHash},
        gift_email_created_at = coalesce(gift_email_created_at, now())
    where id = ${resolvedGiftId}::uuid
      and gift_email_dedupe_hash is null
    returning id
  `
  if (gate.rowCount === 0) return

  // Suppression check
  const sup = await sql`
    select 1
    from email_suppressions
    where email::citext = ${recipientEmail}::citext
    limit 1
  `
  if ((sup.rowCount ?? 0) > 0) return

  const giftUrl = `${appOrigin()}/gift/${encodeURIComponent(resolvedGiftId)}`

  let albumTitle = albumSlug || 'a release'
  let albumArtist: string | undefined
  let albumCoverUrl: string | undefined

  try {
    const meta = await getAlbumEmailMetaBySlug(albumSlug)
    if (meta) {
      albumTitle = meta.title
      albumArtist = meta.artist ?? undefined
      albumCoverUrl = meta.artworkUrl ?? undefined
    }
  } catch {
    // cosmetic only
  }

  const personalNote = giftRow.message ?? null
  const senderName = guessSenderName(giftRow.sender_email ?? null)

  await sendGiftCreatedEmail({
    giftId: resolvedGiftId,
    to: recipientEmail,
    giftUrl,
    albumTitle,
    albumArtist,
    albumCoverUrl,
    personalNote,
    senderName,
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

  // Idempotency: dedupe webhook deliveries by Stripe event.id
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
    // Subscription lifecycle
    if (
      event.type === 'customer.subscription.created' ||
      event.type === 'customer.subscription.updated' ||
      event.type === 'customer.subscription.deleted'
    ) {
      const sub = event.data.object as Stripe.Subscription
      await reconcileStripeSubscription({stripe, subscription: sub})
      return NextResponse.json({ok: true})
    }

    // Checkout session completed
    if (event.type !== 'checkout.session.completed') {
      return NextResponse.json({ok: true})
    }

    const session = event.data.object as Stripe.Checkout.Session

    // Gift purchases
    const md = (session.metadata ?? {}) as Record<string, string>
    if ((md.kind ?? '') === 'gift' || (md.giftId ?? '').trim() || (md.giftTokenHash ?? '').trim()) {
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
    // Returning ok avoids Stripe retry storms while you inspect logs.
    return NextResponse.json({ok: true})
  }
}
