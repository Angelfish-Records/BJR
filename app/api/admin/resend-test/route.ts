// web/app/api/admin/resend-test/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {Resend} from 'resend'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY ?? 're_dummy')

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

function lowerEmail(s: string): string {
  return s.trim().toLowerCase()
}

// POST /api/admin/resend-test
// Body: { to: string, subject?: string, from?: string, html?: string, text?: string }
export async function POST(req: NextRequest) {
  // Hard gate: require a shared secret header so this can't be abused.
  const adminSecret = must(process.env.ADMIN_TEST_SECRET, 'ADMIN_TEST_SECRET')
  const got = req.headers.get('x-admin-secret') ?? ''
  if (got !== adminSecret) return new NextResponse('Unauthorized', {status: 401})

  const body = (await req.json().catch(() => null)) as null | {
    to?: string
    subject?: string
    from?: string
    html?: string
    text?: string
  }

  const to = body?.to ? lowerEmail(body.to) : ''
  if (!to) return new NextResponse('Missing "to"', {status: 400})

  // Pick a real sending identity you have verified in the BJR Resend account.
  // This does NOT require the inbox to exist; only DNS domain verification matters.
  const from =
    (body?.from && body.from.trim()) ||
    must(process.env.RESEND_FROM_MARKETING, 'RESEND_FROM_MARKETING') // e.g. "BJR <oracle@post.brendanjohnroch.com>"

  const subject = body?.subject?.trim() || `Resend webhook test ${new Date().toISOString()}`

  const text =
    body?.text?.trim() ||
    `Testing Resend webhooks.\n\nExpected: delivered/bounced/complained events depending on recipient.\nSent: ${new Date().toISOString()}`

  const html =
    body?.html?.trim() ||
    `<p><strong>Testing Resend webhooks</strong></p><p>Sent: ${new Date().toISOString()}</p>`

  const result = await resend.emails.send({
    from,
    to: [to],
    subject,
    text,
    html,
    // Optional but useful: tags show up in Resend UI, and can help correlate.
    tags: [{name: 'purpose', value: 'webhook-test'}],
  })

  // Resend returns either {data} or {error}
  // Keep it simple: forward what we got.
  return NextResponse.json(result)
}
