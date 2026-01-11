'use client'

import React from 'react'

type Props = {
  disabled?: boolean
  variant?: 'button' | 'link'
  label?: string
}

export default function CancelSubscriptionButton({disabled, variant = 'button', label}: Props) {
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

      setTimeout(() => {
        window.location.reload()
      }, 1200)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Cancellation failed')
    } finally {
      setBusy(false)
    }
  }

  const text = busy ? 'Cancelling…' : (label ?? (variant === 'link' ? 'Cancel subscription' : 'Cancel subscription (now)'))
  const isDisabled = busy || !!disabled

  return (
    <div
      style={{
        display: 'grid',
        gap: variant === 'link' ? 6 : 8,
        justifyItems: variant === 'link' ? 'start' : 'center',
      }}
    >
      <button
        onClick={onCancel}
        disabled={isDisabled}
        style={
          variant === 'link'
            ? {
                padding: 0,
                margin: 0,
                border: 'none',
                background: 'transparent',
                color: 'color-mix(in srgb, var(--accent) 70%, rgba(255,255,255,0.88))',
                fontSize: 12,
                lineHeight: '16px',
                fontWeight: 600,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                opacity: isDisabled ? 0.6 : 0.95,
                textAlign: 'left',
                justifySelf: 'start',
              }
            : {
                padding: '11px 16px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.06)',
                color: 'rgba(255,255,255,0.90)',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: 14,
                opacity: isDisabled ? 0.6 : 1,
              }
        }
        onMouseDown={(e) => {
          if (variant === 'link') e.preventDefault()
        }}
      >
        {text}
      </button>

      {msg ? (
        <div
          style={{
            fontSize: 12,
            opacity: 0.75,
            maxWidth: 640,
            textAlign: variant === 'link' ? 'left' : 'center',
          }}
        >
          {msg}
        </div>
      ) : null}
    </div>
  )
}
