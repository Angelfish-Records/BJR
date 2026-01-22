// web/app/api/gifts/claim/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import crypto from 'crypto'
import {sql} from '@vercel/postgres'
import {auth, currentUser} from '@clerk/nextjs/server'
import {normalizeEmail} from '@/lib/members'

export const runtime = 'nodejs'

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function safeStr(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim()
}

export async function POST(req: NextRequest) {
  // Accept both JSON and form posts (page uses <form>)
  const ct = req.headers.get('content-type') ?? ''
  let token = ''

  if (ct.includes('application/json')) {
    const body = (await req.json().catch(() => null)) as {token?: unknown} | null
    token = safeStr(body?.token)
  } else {
    const fd = await req.formData().catch(() => null)
    token = safeStr(fd?.get('token'))
  }

  if (!token) return NextResponse.json({ok: false, error: 'MISSING_TOKEN'}, {status: 400})

  const {userId} = await auth()
  if (!userId) return NextResponse.json({ok: false, error: 'AUTH_REQUIRED'}, {status: 401})

  const u = await currentUser()
  const authedEmailRaw =
    u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress ?? ''
  const authedEmail = normalizeEmail(authedEmailRaw)
  if (!authedEmail) return NextResponse.json({ok: false, error: 'EMAIL_REQUIRED'}, {status: 400})

  const tokenHash = sha256Hex(token)

  // Lookup gift row
  const g = await sql`
    select id, status, recipient_email, album_slug
    from gifts
    where token_hash = ${tokenHash}
    limit 1
  `
  const row = g.rows[0] as
    | {id: string; status: string; recipient_email: string; album_slug: string}
    | undefined
  if (!row) return NextResponse.json({ok: false, error: 'NOT_FOUND'}, {status: 404})

  const status = safeStr(row.status)
  if (status !== 'paid' && status !== 'claimed') {
    return NextResponse.json({ok: false, error: 'NOT_ACTIVE'}, {status: 409})
  }

  const recipientEmail = normalizeEmail(row.recipient_email)
  if (!recipientEmail || recipientEmail !== authedEmail) {
    return NextResponse.json({ok: false, error: 'EMAIL_MISMATCH'}, {status: 403})
  }

  // Resolve canonical member by clerk_user_id (strict — don’t “ensure” here)
  const m = await sql`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  const memberId = (m.rows[0]?.id as string | undefined) ?? null
  if (!memberId) return NextResponse.json({ok: false, error: 'MEMBER_NOT_IN_LEDGER'}, {status: 403})

  // Mark claimed idempotently:
  // - if already claimed, allow
  // - if paid, transition to claimed + attach recipient_member_id
  const upd = await sql`
    update gifts
    set status = 'claimed'::gift_status,
        claimed_at = coalesce(claimed_at, now()),
        recipient_member_id = coalesce(recipient_member_id, ${memberId}::uuid)
    where id = ${row.id}::uuid
      and status in ('paid'::gift_status, 'claimed'::gift_status)
      and recipient_email = ${recipientEmail}::citext
    returning album_slug
  `
  if (upd.rowCount === 0) {
    return NextResponse.json({ok: false, error: 'CLAIM_FAILED'}, {status: 409})
  }

  // Redirect to portal (or album) after claim.
  const origin = req.nextUrl.origin
  const redirectTo = `${origin}/home?panel=portal&gift=claimed`
  return NextResponse.redirect(redirectTo, {status: 303})
}
