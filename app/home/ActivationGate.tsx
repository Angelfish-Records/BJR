// web/app/home/ActivationGate.tsx
'use client'

import {useEffect, useMemo, useState} from 'react'
import {useAuth, useSignIn} from '@clerk/nextjs'
import {useRouter} from 'next/navigation'

type Phase = 'idle' | 'code'

function getClerkErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Something went wrong'
  const e = err as {errors?: Array<{message?: unknown}>; message?: unknown}
  const first = e.errors?.[0]?.message
  if (typeof first === 'string' && first.trim()) return first
  if (typeof e.message === 'string' && e.message.trim()) return e.message
  return 'Something went wrong'
}

function Toggle(props: {checked: boolean; disabled?: boolean; onClick?: () => void}) {
  const {checked, disabled, onClick} = props

  const w = 56
  const h = 32
  const pad = 3
  const knob = h - pad * 2
  const travel = w - pad * 2 - knob

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-checked={checked}
      role="switch"
      style={{
        width: w,
        height: h,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.18)',
        background: checked
          ? 'color-mix(in srgb, var(--accent) 78%, rgba(0,0,0,0.20))'
          : 'rgba(255,255,255,0.10)',
        position: 'relative',
        padding: 0,
        outline: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition:
          'background 180ms ease, box-shadow 180ms ease, border-color 180ms ease, opacity 180ms ease',
        boxShadow: checked
          ? '0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 10px 26px rgba(0,0,0,0.35)'
          : '0 10px 26px rgba(0,0,0,0.28)',
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: 999,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.16), rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.10))',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: checked ? 0.55 : 0.35,
          transition: 'opacity 180ms ease',
        }}
      />

      <div
        aria-hidden
        style={{
          width: knob,
          height: knob,
          borderRadius: 999,
          position: 'absolute',
          top: pad,
          left: pad,
          transform: `translateX(${checked ? travel : 0}px)`,
          transition:
            'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease',
          background: 'rgba(255,255,255,0.98)',
          boxShadow: checked
            ? '0 10px 22px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.65) inset'
            : '0 10px 22px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.45) inset',
        }}
      />
    </button>
  )
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

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email])

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

  useEffect(() => {
    if (phase !== 'code') return
    if (code.length !== 6) return
    void verifyCode()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, phase])

  const isActive = !!isSignedIn // <-- FIX: coerce boolean|undefined -> boolean

  const toggleClickable = !isActive && phase === 'idle' && emailValid && isLoaded

  return (
    <div style={{display: 'grid', gap: 14, justifyItems: 'center'}}>
      <Toggle checked={isActive} disabled={!toggleClickable} onClick={startEmailCode} />

      {!isActive && (
        <>
          {phase !== 'code' ? (
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value.trim())}
              style={{
                width: 300,
                padding: '11px 14px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.18)',
                background: 'rgba(0,0,0,0.35)',
                color: 'rgba(255,255,255,0.92)',
                outline: 'none',
                textAlign: 'center',
              }}
            />
          ) : (
            <div style={{display: 'grid', gap: 10, justifyItems: 'center'}}>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="••••••"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                style={{
                  width: 200,
                  padding: '11px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'rgba(0,0,0,0.35)',
                  color: 'rgba(255,255,255,0.92)',
                  letterSpacing: 8,
                  textAlign: 'center',
                  outline: 'none',
                }}
                disabled={isVerifying}
              />

              <button
                disabled={code.length !== 6 || isVerifying}
                onClick={verifyCode}
                style={{
                  padding: '9px 14px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.18)',
                  background: 'color-mix(in srgb, var(--accent) 30%, transparent)',
                  color: 'rgba(255,255,255,0.90)',
                  cursor: code.length === 6 && !isVerifying ? 'pointer' : 'not-allowed',
                  opacity: isVerifying ? 0.82 : 1,
                }}
              >
                {isVerifying ? 'Verifying…' : 'Confirm'}
              </button>
            </div>
          )}
        </>
      )}

      {isActive && <>{children}</>}

      {error && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.78,
            color: '#ffb4b4',
            maxWidth: 360,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}
    </div>
  )
}
