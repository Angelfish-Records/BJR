// web/app/gift/[giftId]/page.tsx
import 'server-only'
import {redirect} from 'next/navigation'
import {sql} from '@vercel/postgres'
import {auth} from '@clerk/nextjs/server'


export const runtime = 'nodejs'

function appOrigin(): string {
  const v = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim()
  return v ? v.replace(/\/$/, '') : ''
}

function signInPath(): string {
  const v = (process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? '').trim()
  // common values: "/sign-in" or "https://accounts...." (we'll handle both)
  return v || '/sign-in'
}

function buildSignInRedirect(returnBackUrl: string): string {
  const base = signInPath()

  // If it's an absolute URL, just append redirect_url.
  if (/^https?:\/\//i.test(base)) {
    const u = new URL(base)
    u.searchParams.set('redirect_url', returnBackUrl)
    return u.toString()
  }

  // Otherwise it's a local path like "/sign-in"
  const origin = appOrigin()
  if (origin) {
    const u = new URL(base, origin)
    u.searchParams.set('redirect_url', returnBackUrl)
    return u.pathname + u.search // keep it relative for Next redirect()
  }

  // No origin known; still OK to redirect relative with query.
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}redirect_url=${encodeURIComponent(returnBackUrl)}`
}


function safeUuid(v: unknown): string {
  const s = (typeof v === 'string' ? v : '').trim()
  // cheap UUID sanity (not perfect, but avoids obvious garbage)
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) return ''
  return s
}

export default async function GiftLandingPage(props: {params: {giftId: string}}) {
  const giftId = safeUuid(props.params?.giftId)
  if (!giftId) redirect('/home?gift=missing')

  const {userId} = await auth()
if (!userId) {
  redirect(buildSignInRedirect(`/gift/${giftId}`))
}

  // Resolve member for this clerk user (and pull member email for matching).
  const m = await sql`
    select id, email
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  const memberId = (m.rows[0]?.id as string | undefined) ?? null
  const memberEmail = (m.rows[0]?.email as string | undefined) ?? null
  if (!memberId) redirect('/home?gift=missing')

  // Load gift
  const g = await sql`
    select id, status, recipient_member_id, recipient_email
    from gifts
    where id = ${giftId}::uuid
    limit 1
  `
  const row = g.rows[0] as
    | {
        id: string
        status: string
        recipient_member_id: string | null
        recipient_email: string | null
      }
    | undefined

  if (!row) redirect('/home?gift=missing')

  // Not paid yet -> no drama, just a clear message.
  if (row.status === 'pending_payment' || row.status === 'draft') {
    redirect('/home?gift=not_paid')
  }

  // Determine “intended recipient”
  const intendedById =
    row.recipient_member_id != null && row.recipient_member_id === memberId

  const intendedByEmail =
    !!row.recipient_email &&
    !!memberEmail &&
    row.recipient_email.toLowerCase() === memberEmail.toLowerCase()

  const intended = intendedById || intendedByEmail

  if (!intended) {
    // This handles “I clicked on a gift meant for a different email”
    // (and also “sender clicked their own gift link”).
    redirect('/home?gift=wrong_account')
  }

  // Optional: acknowledge claim. This is idempotent and never blocks access.
  // (Entitlement already granted by Stripe webhook.)
  await sql`
    update gifts
    set status = 'claimed'::gift_status,
        claimed_at = coalesce(claimed_at, now()),
        recipient_member_id = coalesce(recipient_member_id, ${memberId}::uuid)
    where id = ${giftId}::uuid
      and status in ('paid'::gift_status, 'claimed'::gift_status)
  `

  // Land them in the portal tab. Your existing portal param logic treats panel=portal as “download”.
  redirect('/home?gift=ready&panel=portal')
}
