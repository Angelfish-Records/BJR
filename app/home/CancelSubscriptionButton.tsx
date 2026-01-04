'use client'

import React from 'react'

export default function CancelSubscriptionButton(props: {disabled?: boolean}) {
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<string | null>(null)

  async function onCancel() {
    setMsg(null)
    setBusy(true)
    try {
      const res = await fetch('/api/stripe/cancel-subscription', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({}),
      })

      const data = (await res.json().catch(() => null)) as
        | {ok?: boolean; error?: string; canceled?: string[]; note?: string}
        | null

      if (!res.ok || !data?.ok) {
        setMsg(data?.error ?? 'Cancellation failed')
        return
      }

      setMsg(
        data.canceled?.length
          ? 'Cancelled. If entitlements don’t update immediately, refresh once (webhooks can lag).'
          : data.note ?? 'No active subscription found.'
      )

      // Give Stripe a moment; then refresh for server-derived entitlements.
      setTimeout(() => {
        window.location.reload()
      }, 1200)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Cancellation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{display: 'grid', justifyItems: 'center', gap: 8}}>
      <button
        onClick={onCancel}
        disabled={busy || props.disabled}
        style={{
          padding: '11px 16px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.22)',
          background: 'rgba(255,255,255,0.06)',
          color: 'rgba(255,255,255,0.90)',
          cursor: busy || props.disabled ? 'not-allowed' : 'pointer',
          fontSize: 14,
          opacity: busy || props.disabled ? 0.6 : 1,
        }}
      >
        {busy ? 'Cancelling…' : 'Cancel subscription (now)'}
      </button>

      {msg ? (
        <div style={{fontSize: 12, opacity: 0.75, maxWidth: 640, textAlign: 'center'}}>
          {msg}
        </div>
      ) : null}
    </div>
  )
}
