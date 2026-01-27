// web/app/api/webhooks/resend/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {Resend} from 'resend'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY ?? 're_dummy')

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

type SvixHeaders = {id: string; timestamp: string; signature: string}

type ResendWebhookEnvelope = {
  type?: string
  created_at?: string
  data?: unknown
}

type ResendEmailEventData = {
  email_id?: string
  from?: string
  to?: string[]
  subject?: string
}

function looksLikeEmailEventData(x: unknown): x is ResendEmailEventData {
  if (!x || typeof x !== 'object') return false
  // we only need a couple fields; keep checks cheap + defensive
  const o = x as Record<string, unknown>
  if ('to' in o && o.to !== undefined && !Array.isArray(o.to)) return false
  return true
}

function lowerEmail(s: string): string {
  return s.trim().toLowerCase()
}

export async function POST(req: NextRequest) {
  const webhookSecret = must(process.env.RESEND_WEBHOOK_SECRET, 'RESEND_WEBHOOK_SECRET')

  // Raw payload is REQUIRED for signature verification.
  const payload = await req.text()

  const svixId = req.headers.get('svix-id') ?? ''
  const svixTimestamp = req.headers.get('svix-timestamp') ?? ''
  const svixSignature = req.headers.get('svix-signature') ?? ''

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new NextResponse('Missing webhook headers', {status: 400})
  }

  const headers: SvixHeaders = {id: svixId, timestamp: svixTimestamp, signature: svixSignature}

  let event: ResendWebhookEnvelope
  try {
    // Resend verifies Svix signature and returns parsed payload.
    const verified = resend.webhooks.verify({payload, headers, webhookSecret})
    event = verified as unknown as ResendWebhookEnvelope
  } catch {
    return new NextResponse('Invalid webhook', {status: 400})
  }

  try {
    const type = typeof event.type === 'string' ? event.type : ''
    const createdAt = event.created_at ? new Date(event.created_at) : new Date()

    const data = event.data
    const isEmailData = looksLikeEmailEventData(data)
    const emailId =
      isEmailData && typeof data.email_id === 'string' && data.email_id.length ? data.email_id : null
    const from = isEmailData && typeof data.from === 'string' && data.from.length ? data.from : null

    // Tweak: always normalize to lower-case before storing (matches citext semantics + stable joins).
    const to0 =
      isEmailData && Array.isArray(data.to) && typeof data.to[0] === 'string' && data.to[0].length
        ? lowerEmail(data.to[0])
        : null

    const subject =
      isEmailData && typeof data.subject === 'string' && data.subject.length ? data.subject : null

    await sql`
      insert into resend_webhook_events (
        svix_id,
        svix_timestamp,
        svix_signature,
        event_type,
        event_created_at,
        email_id,
        email_to,
        email_from,
        subject,
        raw_payload
      )
      values (
        ${svixId},
        ${svixTimestamp},
        ${svixSignature},
        ${type},
        ${createdAt.toISOString()},
        ${emailId},
        ${to0},
        ${from},
        ${subject},
        ${payload}::jsonb
      )
      on conflict (svix_id) do nothing
    `

    if (to0 && (type === 'email.bounced' || type === 'email.complained')) {
      await sql`
        insert into email_suppressions (email, reason, source, first_seen_at, last_seen_at)
        values (${to0}, ${type}, 'resend', now(), now())
        on conflict (email) do update set
          reason = excluded.reason,
          last_seen_at = now()
      `
    }
  } catch {
    // Non-200 ensures Resend retries on transient DB failures.
    return new NextResponse('Webhook processing failed', {status: 500})
  }

  return NextResponse.json({ok: true})
}
