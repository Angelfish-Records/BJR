// web/app/home/ActivationGate.tsx
'use client'

import {useEffect, useMemo, useState} from 'react'
import {useAuth, useSignIn} from '@clerk/nextjs'
import {useRouter} from 'next/navigation'

type Phase = 'idle' | 'code'

function getClerkErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Something went wrong'
  // Clerk often throws { errors: [{ message: string }] }
  const e = err as {errors?: Array<{message?: unknown}>; message?: unknown}
  const first = e.errors?.[0]?.message
  if (typeof first === 'string' && first.trim()) return first
  if (typeof e.message === 'string' && e.message.trim()) return e.message
  return 'Something went wrong'
}

export default function ActivationGate(props: {children: React.ReactNode}) {
  const {children} = props
  const router = useRouter()

  const {isSignedIn} = useAuth()
  const {signIn, isLoaded} = useSignIn()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const emailValid = useMemo(
    () => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    [email]
  )

  // If already signed in, skip the ritual entirely
  useEffect(() => {
    if (!isSignedIn) return
    router.refresh()
  }, [isSignedIn, router])

  async function startEmailCode() {
    if (!isLoaded || !signIn) return
    if (!emailValid) return

    setError(null)
    setCode('')

    try {
      await signIn.create({
        identifier: email,
        strategy: 'email_code',
      })
      setPhase('code')
    } catch (err) {
      setError(getClerkErrorMessage(err))
    }
  }

  async function verifyCode() {
    if (!isLoaded || !signIn) return
    if (code.length !== 6) return

    setError(null)
    setIsVerifying(true)

    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      })

      if (result.status === 'complete') {
        router.refresh()
        return
      }

      setError('Verification incomplete')
    } catch (err) {
      setError(getClerkErrorMessage(err))
    } finally {
      setIsVerifying(false)
    }
  }

  // Nice UX: auto-verify as soon as we have 6 digits
  useEffect(() => {
    if (phase !== 'code') return
    if (code.length !== 6) return
    void verifyCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, phase])

  // Once signed in, render authenticated UI
  if (isSignedIn) return <>{children}</>

  const toggleArmed = phase === 'idle' && emailValid && isLoaded

  return (
    <div style={{display: 'grid', gap: 12, justifyItems: 'center'}}>
      {phase !== 'code' ? (
        <>
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            style={{
              width: 260,
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.35)',
              color: 'white',
              outline: 'none',
              opacity: 0.9,
            }}
          />

          <button
            disabled={!toggleArmed}
            onClick={startEmailCode}
            style={{
              width: 56,
              height: 30,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.22)',
              background: toggleArmed
                ? 'color-mix(in srgb, var(--accent) 45%, transparent)'
                : 'rgba(255,255,255,0.08)',
              cursor: toggleArmed ? 'pointer' : 'not-allowed',
              transition: 'all 160ms ease',
            }}
            aria-label="Activate access"
          />
        </>
      ) : (
        <>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            style={{
              width: 180,
              padding: '10px 12px',
              letterSpacing: 6,
              textAlign: 'center',
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.35)',
              color: 'white',
            }}
            disabled={isVerifying}
          />

          <button
            disabled={code.length !== 6 || isVerifying}
            onClick={verifyCode}
            style={{
              padding: '8px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'color-mix(in srgb, var(--accent) 35%, transparent)',
              cursor: code.length === 6 && !isVerifying ? 'pointer' : 'not-allowed',
              opacity: isVerifying ? 0.8 : 1,
            }}
          >
            {isVerifying ? 'Verifying…' : 'Confirm'}
          </button>
        </>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.75,
            color: '#ffb4b4',
            maxWidth: 320,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
