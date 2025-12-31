'use client'

import {useState} from 'react'

export default function EarlyAccessForm() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'err'>('idle')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('loading')

    const res = await fetch('/api/early-access', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({email, company: ''}),
    })

    if (res.ok) {
      setStatus('ok')
      setEmail('')
    } else {
      setStatus('err')
    }
  }

  return (
    <div style={{marginTop: 18}}>
      <form
        onSubmit={onSubmit}
        style={{
          display: 'flex',
          gap: 10,
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="you@domain.com"
          required
          style={{
            width: 280,
            padding: '12px 14px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.22)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.92)',
            outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          style={{
            padding: '12px 16px',
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.28)',
            background: 'rgba(255,255,255,0.12)',
            color: 'rgba(255,255,255,0.92)',
            cursor: 'pointer',
          }}
        >
          {status === 'loading' ? 'Submitting…' : 'Request early access'}
        </button>
      </form>

      {status === 'ok' && (
        <div style={{marginTop: 10, opacity: 0.85, fontSize: 14}}>
          You’re on the list.
        </div>
      )}
      {status === 'err' && (
        <div style={{marginTop: 10, opacity: 0.85, fontSize: 14}}>
          Something went wrong. Try again.
        </div>
      )}
    </div>
  )
}
