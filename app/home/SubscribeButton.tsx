// web/app/home/SubscribeButton.tsx
'use client'

import React from 'react'

type Props = {
  loggedIn: boolean
  variant?: 'link' | 'button'
  label?: string
  // NEW: select subscription tier (defaults to patron for backward compat)
  tier?: 'patron' | 'partner'
}

export default function SubscribeButton(props: Props) {
  const {loggedIn, variant = 'button', label = 'Become a Patron', tier = 'patron'} = props

  async function go() {
    // Keep it dead simple: server decides which Stripe Price/Checkout to use.
    // You likely already have /api/stripe/create-checkout-session; we just pass tier.
    const res = await fetch('/api/stripe/create-checkout-session', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({tier}),
    })
    const data = (await res.json()) as {url?: string}
    if (data?.url) window.location.assign(data.url)
  }

  if (!loggedIn) return null

  if (variant === 'link') {
    return (
      <button
        type="button"
        onClick={go}
        style={{
          appearance: 'none',
          border: 0,
          background: 'transparent',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          color: 'rgba(255,255,255,0.84)',
          textDecoration: 'underline',
          textUnderlineOffset: 3,
          textDecorationColor: 'rgba(255,255,255,0.28)',
        }}
      >
        {label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={go}
      style={{
        height: 32,
        padding: '0 14px',
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(255,255,255,0.08)',
        color: 'rgba(255,255,255,0.92)',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
