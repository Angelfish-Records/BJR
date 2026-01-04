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

function parseOrigin(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

// Allow: exact origin, www ↔ bare swap, and vercel previews
function sameOriginOrAllowed(req: Request): boolean {
  const origin = safeOrigin(req)
  if (!origin) return true

  const o = parseOrigin(origin)
  const app = parseOrigin(APP_URL)
  if (!o || !app) return false

  if (o.origin === app.origin) return true

  const stripWww = (h: string) => h.replace(/^www\./, '')
  if (stripWww(o.hostname) === stripWww(app.hostname) && o.protocol === app.protocol) return true

  if (o.hostname.endsWith('.vercel.app')) return true

  return false
}

// Stripe SDK typings sometimes wrap responses
function unwrapStripeResponse<T>(res: T | Stripe.Response<T>): T {
  const maybe = res as unknown as {data?: T}
  return maybe.data ?? (res as T)
}

// Safe “read number prop” without `any`
function readNumberProp(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== 'object') return null
  if (!(key in obj)) return null
  const v = (obj as Record<string, unknown>)[key]
  return typeof v === 'number' ? v : null
}

type MemberStripeRow = {member_id: string; stripe_customer_id: string | null}

export async function POST(req: Request) {
  must(STRIPE_SECRET_KEY, 'STRIPE_SECRET_KEY')
  must(APP_URL, 'NEXT_PUBLIC_APP_URL')

  // Optional guard; auth is the real gate.
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

  // List subs for this customer
  const subsRes = await stripe.subscriptions.list({customer: customerId, status: 'all', limit: 100})
  const subs = unwrapStripeResponse(subsRes)

  const target = subs.data.filter((s) =>
    ['active', 'trialing', 'past_due', 'unpaid'].includes((s.status ?? '').toString())
  )

  if (target.length === 0) {
    return NextResponse.json({ok: true, updated: [], note: 'No active subscriptions found'})
  }

  const updated: Array<{
    id: string
    cancel_at_period_end: boolean
    current_period_end: number | null
  }> = []

  for (const s of target) {
    // “Cancel now” = stop renewal, keep access until end of paid period
    const res = await stripe.subscriptions.update(s.id, {cancel_at_period_end: true})
    const sub = unwrapStripeResponse(res)

    // Avoid `sub.current_period_end` (your Stripe typings don’t expose it).
    // Pull from first subscription item (present in real payloads) or fall back to a safe prop read.
    const itemEnd =
      sub.items?.data?.[0]?.current_period_end ??
      readNumberProp(sub, 'current_period_end') // fallback if it exists at runtime

    updated.push({
      id: sub.id,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      current_period_end: typeof itemEnd === 'number' ? itemEnd : null,
    })
  }

  // IMPORTANT: do not mutate entitlements here.
  // Webhook (subscription.updated/deleted) will reconcile into entitlement_grants.
  return NextResponse.json({ok: true, updated})
}
