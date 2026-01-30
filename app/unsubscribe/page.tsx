// web/app/unsubscribe/page.tsx
import 'server-only'
import React from 'react'
import {headers} from 'next/headers'
import {verifyUnsubscribeToken, maskEmail} from '@/lib/unsubscribe'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

function cardStyle(): React.CSSProperties {
  return {
    maxWidth: 560,
    width: '100%',
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.04)',
    padding: 18,
    boxShadow: '0 18px 40px rgba(0,0,0,0.35)',
  }
}

export default async function UnsubscribePage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  headers()

  const sp = (await props.searchParams) ?? {}
  const token = typeof sp.t === 'string' ? sp.t : ''
  const done = typeof sp.done === 'string' ? sp.done : null

  if (done === '1') {
    return (
      <main
        style={{
          minHeight: '100svh',
          display: 'grid',
          placeItems: 'center',
          padding: 24,
          background: '#050506',
          color: 'rgba(255,255,255,0.92)',
          fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
        }}
      >
        <section style={cardStyle()}>
          <h1 style={{margin: 0, fontSize: 20}}>You’re unsubscribed</h1>
          <p style={{marginTop: 10, opacity: 0.85, lineHeight: 1.55, fontSize: 13}}>
            You won’t receive future marketing emails from Brendan John Roch. Transactional emails (e.g. gifts, receipts) may still be sent when required.
          </p>
        </section>
      </main>
    )
  }

  const vr = token ? verifyUnsubscribeToken(token) : ({ok: false, error: 'MISSING'} as const)

  const isValid = vr.ok
  const masked = isValid ? maskEmail(vr.payload.email) : null

  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#050506',
        color: 'rgba(255,255,255,0.92)',
        fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
      }}
    >
      <section style={cardStyle()}>
        <div style={{fontSize: 12, opacity: 0.7}}>Email preferences</div>

        <h1 style={{margin: '6px 0 0', fontSize: 20}}>Confirm unsubscribe</h1>

        {!isValid ? (
          <p style={{marginTop: 12, opacity: 0.85, lineHeight: 1.55, fontSize: 13}}>
            This unsubscribe link is invalid or expired.
          </p>
        ) : (
          <>
            <p style={{marginTop: 12, opacity: 0.85, lineHeight: 1.55, fontSize: 13}}>
              You’re about to unsubscribe <b>{masked}</b> from future marketing emails.
            </p>

            <form action="/api/unsubscribe" method="post" style={{marginTop: 14}}>
              <input type="hidden" name="t" value={token} />
              <button
                type="submit"
                style={{
                  padding: '10px 14px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(186,156,103,0.18)',
                  color: 'rgba(255,255,255,0.92)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Unsubscribe
              </button>
            </form>

            <p style={{marginTop: 12, opacity: 0.65, lineHeight: 1.55, fontSize: 12}}>
              This action affects marketing only. Transactional emails (gifts, receipts, security messages) may still be sent when needed.
            </p>
          </>
        )}
      </section>
    </main>
  )
}
