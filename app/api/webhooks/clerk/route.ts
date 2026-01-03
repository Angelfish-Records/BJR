import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {Webhook} from 'svix'

type ClerkEmailAddress = {id: string; email_address: string}
type ClerkUser = {
  id: string
  primary_email_address_id?: string | null
  email_addresses?: ClerkEmailAddress[]
}

type ClerkEvent = {
  type: 'user.created' | 'user.updated' | 'user.deleted' | string
  data: unknown
}

function isClerkUser(x: unknown): x is ClerkUser {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  return typeof o.id === 'string'
}

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET ?? ''
  if (!secret) return NextResponse.json({ok: false, error: 'Missing CLERK_WEBHOOK_SECRET'}, {status: 500})

  const payload = await req.text()
  const headers = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }

  let evt: ClerkEvent
  try {
    evt = new Webhook(secret).verify(payload, headers) as ClerkEvent
  } catch {
    return NextResponse.json({ok: false, error: 'Invalid signature'}, {status: 400})
  }

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    if (!isClerkUser(evt.data)) return NextResponse.json({ok: true})

    const u = evt.data
    const emails = u.email_addresses ?? []
    const primaryId = u.primary_email_address_id ?? null
    const primary =
      (primaryId ? emails.find((e) => e.id === primaryId) : null) ?? emails[0] ?? null
    const email = primary?.email_address ?? null

    if (email) {
      await sql`
        update members
        set email = lower(trim(${email}))
        where clerk_user_id = ${u.id}
      `
    }
  }

  if (evt.type === 'user.deleted') {
    if (!isClerkUser(evt.data)) return NextResponse.json({ok: true})
    const u = evt.data
    await sql`
      update members
      set clerk_user_id = null
      where clerk_user_id = ${u.id}
    `
  }

  return NextResponse.json({ok: true})
}
