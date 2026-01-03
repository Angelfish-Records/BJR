'use client'

import {useMemo, useState} from 'react'

type Props = {
  loggedIn: boolean
}

export default function SubscribeButton({loggedIn}: Props) {
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)

  const emailOk = useMemo(() => {
    if (loggedIn) return true
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase())
  }, [loggedIn, email])

  async function startCheckout() {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify(loggedIn ? {} : {email}),
      })

      const data = (await res.json()) as {ok: boolean; url?: string; error?: string}
      if (!data.ok || !data.url) throw new Error(data.error ?? 'Failed to create checkout session')

      window.location.assign(data.url)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Checkout failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{display: 'grid', gap: 10, maxWidth: 420}}>
      {!loggedIn && (
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email for your membership"
          autoComplete="email"
          inputMode="email"
          style={{
            padding: 10,
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 10,
            background: 'rgba(0,0,0,0.2)',
            color: 'inherit',
          }}
        />
      )}

      <button
        onClick={startCheckout}
        disabled={loading || !emailOk}
        style={{
          padding: 12,
          borderRadius: 12,
          border: '1px solid rgba(255,255,255,0.35)',
          cursor: loading || !emailOk ? 'not-allowed' : 'pointer',
          background: 'rgba(255,255,255,0.08)',
          color: 'inherit',
          fontWeight: 600,
        }}
      >
        {loading ? 'Redirecting…' : 'Subscribe (test)'}
      </button>

      {error && <div style={{opacity: 0.85}}>⚠️ {error}</div>}
    </div>
  )
}
