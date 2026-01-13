// web/app/api/webhooks/clerk/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {Webhook} from 'svix'
import {ensureMemberByClerk} from '@/lib/members'
import {grantEntitlement} from '@/lib/entitlementOps'
import {logMemberCreated, newCorrelationId, logMemberEvent} from '@/lib/events'
import {ENTITLEMENTS, EVENT_SOURCES, EVENT_TYPES} from '@/lib/vocab'
import {sql} from '@vercel/postgres'

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

function pickPrimaryEmail(u: ClerkUser): string | null {
  const emails = u.email_addresses ?? []
  const primaryId = u.primary_email_address_id ?? null
  const primary = (primaryId ? emails.find((e) => e.id === primaryId) : null) ?? emails[0] ?? null
  return primary?.email_address ?? null
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

  // We’ll correlate everything from this webhook run.
  const correlationId = newCorrelationId()

  if (evt.type === 'user.created' || evt.type === 'user.updated') {
    if (!isClerkUser(evt.data)) return NextResponse.json({ok: true})

    const u = evt.data
    const email = pickPrimaryEmail(u)
    if (!email) return NextResponse.json({ok: true})

    // 1) Ensure canonical member row exists (or claim by email if unclaimed).
    const {id: memberId, created} = await ensureMemberByClerk({
      clerkUserId: u.id,
      email,
      source: 'clerk',
      sourceDetail: {event_type: evt.type},
      marketingOptIn: true,
    })

    // 2) Ensure baseline “Friend” entitlement exists.
    await grantEntitlement({
      memberId,
      entitlementKey: ENTITLEMENTS.FREE_MEMBER,
      grantedBy: 'system',
      grantReason: evt.type,
      grantSource: 'clerk',
      grantSourceRef: u.id,
      expiresAt: null,
      correlationId,
      eventSource: EVENT_SOURCES.CLERK,
    })

    // 3) Log member_created once for truly new rows (optional but nice).
    if (created) {
      await logMemberCreated({
        memberId,
        source: EVENT_SOURCES.CLERK,
        correlationId,
        payload: {via: 'clerk', clerk_user_id: u.id},
      })
    }

    // 4) Optional: record that identity was linked/updated (keeps your stream expressive).
    await logMemberEvent({
      memberId,
      eventType: EVENT_TYPES.IDENTITY_LINKED,
      source: EVENT_SOURCES.CLERK,
      correlationId,
      payload: {clerk_user_id: u.id, email: email.toLowerCase().trim(), event_type: evt.type},
    })

    return NextResponse.json({ok: true})
  }

  if (evt.type === 'user.deleted') {
    if (!isClerkUser(evt.data)) return NextResponse.json({ok: true})
    const u = evt.data

    // Keep the member row; just detach identity.
    await sql`
      update members
      set clerk_user_id = null
      where clerk_user_id = ${u.id}
    `

    return NextResponse.json({ok: true})
  }

  return NextResponse.json({ok: true})
}
