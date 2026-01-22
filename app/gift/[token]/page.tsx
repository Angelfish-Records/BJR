// web/app/gift/[token]/page.tsx
import 'server-only'
import React from 'react'
import crypto from 'crypto'
import {notFound} from 'next/navigation'
import {auth, currentUser} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import ActivationGate from '@/app/home/ActivationGate'
import {normalizeEmail} from '@/lib/members'

export const runtime = 'nodejs'

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

function safeStr(v: unknown): string {
  return (typeof v === 'string' ? v : '').trim()
}

export default async function GiftClaimPage(props: {params: {token: string}}) {
  const token = safeStr(props.params?.token)
  if (!token) notFound()

  const tokenHash = sha256Hex(token)

  // Read gift row (server-only). Keep fields minimal; don’t leak recipient email in UI.
  const g = await sql`
    select id, album_slug, entitlement_key, status, recipient_email, claimed_at, paid_at
    from gifts
    where token_hash = ${tokenHash}
    limit 1
  `
  const row = g.rows[0] as
    | {
        id: string
        album_slug: string
        entitlement_key: string
        status: string
        recipient_email: string
        claimed_at: string | null
        paid_at: string | null
      }
    | undefined

  if (!row) notFound()

  const giftStatus = safeStr(row.status)

  // Gate 1: if not paid/claimed yet, show a neutral holding state (no recipient info).
  if (giftStatus !== 'paid' && giftStatus !== 'claimed') {
    return (
      <div style={{padding: 18, maxWidth: 760, margin: '0 auto'}}>
        <div style={{fontSize: 14, opacity: 0.9}}>Gift link</div>
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.78, lineHeight: 1.55}}>
          This gift isn’t active yet. If you’re expecting a gift, check with the sender that payment completed.
        </div>
      </div>
    )
  }

  // Gate 2: require login for claim (use your existing site-wide auth UI).
  const {userId} = await auth()
  if (!userId) {
    return (
      <div style={{padding: 18, maxWidth: 760, margin: '0 auto'}}>
        <div style={{fontSize: 14, opacity: 0.9}}>You’ve been sent a gift</div>
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.78, lineHeight: 1.55}}>
          Please sign in to claim it. You must sign in using the email address the sender used.
        </div>

        <div style={{marginTop: 14}}>
          <ActivationGate>
  <div style={{fontSize: 13, opacity: 0.78, lineHeight: 1.55}}>
    Confirm email to claim your gift.
  </div>
</ActivationGate>


        </div>
      </div>
    )
  }

  // Gate 3: enforce recipient email match (after login).
  const u = await currentUser()
  const authedEmailRaw =
    u?.primaryEmailAddress?.emailAddress ?? u?.emailAddresses?.[0]?.emailAddress ?? ''
  const authedEmail = normalizeEmail(authedEmailRaw)
  const recipientEmail = normalizeEmail(row.recipient_email)

  if (!authedEmail || authedEmail !== recipientEmail) {
    return (
      <div style={{padding: 18, maxWidth: 760, margin: '0 auto'}}>
        <div style={{fontSize: 14, opacity: 0.9}}>Wrong account</div>
        <div style={{marginTop: 10, fontSize: 13, opacity: 0.78, lineHeight: 1.55}}>
          You’re signed in as <span style={{opacity: 0.92}}>{authedEmail || 'unknown'}</span>, but this gift
          is tied to a different email address. Sign out and sign in with the recipient email to claim.
        </div>
      </div>
    )
  }

  // Logged in + email matches: show claim CTA (POSTs to API route).
  // We keep the mutation behind a deliberate click rather than auto-claiming on page load.
  return (
    <div style={{padding: 18, maxWidth: 760, margin: '0 auto'}}>
      <div style={{fontSize: 14, opacity: 0.9}}>Gift ready</div>
      <div style={{marginTop: 10, fontSize: 13, opacity: 0.78, lineHeight: 1.55}}>
        This gift is ready to claim. Once claimed, it will be attached to your account.
      </div>

      <form
        action={`/api/gifts/claim`}
        method="post"
        style={{marginTop: 14, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}
      >
        <input type="hidden" name="token" value={token} />
        <button
          type="submit"
          style={{
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            padding: '10px 14px',
            fontSize: 13,
            opacity: 0.95,
            cursor: 'pointer',
          }}
        >
          Claim gift
        </button>

        {giftStatus === 'claimed' ? (
          <span style={{fontSize: 12, opacity: 0.72}}>Already claimed — safe to proceed.</span>
        ) : null}
      </form>

      <div style={{marginTop: 14, fontSize: 12, opacity: 0.7}}>
        After claiming, you’ll be redirected to your portal.
      </div>
    </div>
  )
}
