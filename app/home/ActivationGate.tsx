// web/app/home/ActivationGate.tsx
'use client'

import {useEffect, useMemo, useRef, useState} from 'react'
import {useAuth, useSignIn, useSignUp, useUser} from '@clerk/nextjs'
import {useRouter} from 'next/navigation'

type Phase = 'idle' | 'code'
type Flow = 'signin' | 'signup' | null

function getClerkErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Something went wrong'
  const e = err as {errors?: Array<{message?: unknown; code?: unknown}>; message?: unknown}
  const firstMsg = e.errors?.[0]?.message
  if (typeof firstMsg === 'string' && firstMsg.trim()) return firstMsg
  if (typeof e.message === 'string' && e.message.trim()) return e.message
  return 'Something went wrong'
}

function getClerkFirstErrorCode(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const e = err as {errors?: Array<{code?: unknown}>}
  const c = e.errors?.[0]?.code
  return typeof c === 'string' ? c : null
}

function looksLikeNoAccountError(err: unknown): boolean {
  const msg = getClerkErrorMessage(err).toLowerCase()
  const code = (getClerkFirstErrorCode(err) ?? '').toLowerCase()

  // Clerk error codes can vary by version/config; message check is the pragmatic fallback.
  if (code.includes('not_found') || code.includes('identifier')) return true
  if (msg.includes("couldn't find your account")) return true
  if (msg.includes('could not find your account')) return true
  if (msg.includes('account not found')) return true

  return false
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

function normalizeDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}

function OtpBoxes(props: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  width: number
}) {
  const {value, onChange, disabled, width} = props
  const digits = (value + '______').slice(0, 6).split('')
  const refs = useRef<Array<HTMLInputElement | null>>([])

  function focus(i: number) {
    refs.current[i]?.focus()
  }

  const gap = 10
  const boxW = Math.floor((width - gap * 5) / 6)

  return (
    <div style={{display: 'grid', gap: 10, justifyItems: 'center'}}>
      <div style={{display: 'flex', gap}}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            value={d === '_' ? '' : d}
            disabled={disabled}
            onChange={(e) => {
              const n = normalizeDigits(e.target.value)
              const ch = n.slice(-1)
              const arr = value.split('')
              while (arr.length < 6) arr.push('')
              arr[i] = ch
              const joined = normalizeDigits(arr.join(''))
              onChange(joined)
              if (ch && i < 5) focus(i + 1)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace') {
                const cur = digits[i]
                if (!cur || cur === '_') {
                  if (i > 0) focus(i - 1)
                } else {
                  const arr = value.split('')
                  while (arr.length < 6) arr.push('')
                  arr[i] = ''
                  onChange(normalizeDigits(arr.join('')))
                }
              }
              if (e.key === 'ArrowLeft' && i > 0) focus(i - 1)
              if (e.key === 'ArrowRight' && i < 5) focus(i + 1)
            }}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text') || ''
              const pasted = normalizeDigits(text)
              if (!pasted) return
              e.preventDefault()
              onChange(pasted)
              const idx = Math.min(5, pasted.length - 1)
              setTimeout(() => focus(idx), 0)
            }}
            style={{
              width: boxW,
              height: 48,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(255,255,255,0.92)',
              textAlign: 'center',
              fontSize: 18,
              outline: 'none',
              boxShadow: '0 12px 26px rgba(0,0,0,0.24)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function ActivationGate(props: {children: React.ReactNode}) {
  const {children} = props
  const router = useRouter()

  const {isSignedIn} = useAuth()
  const {user} = useUser()
  const {signIn, isLoaded: signInLoaded} = useSignIn()
  const {signUp, isLoaded: signUpLoaded} = useSignUp()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [flow, setFlow] = useState<Flow>(null) // <--- which Clerk object we’re using for the OTP verification
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActive = !!isSignedIn

  const displayEmail =
    (user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      '') || email

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email])

  // refresh server state once signed in
  useEffect(() => {
    if (!isActive) return
    router.refresh()
  }, [isActive, router])

  const clerkLoaded = signInLoaded && signUpLoaded

  async function startEmailCode() {
    if (!clerkLoaded) return
    if (!emailValid) return
    if (!signIn || !signUp) return

    setError(null)
    setCode('')
    setIsVerifying(false)

    // First, try SIGN-IN. If no account exists, fallback to SIGN-UP.
    try {
      await signIn.create({
        identifier: email,
        strategy: 'email_code',
      })
      setFlow('signin')
      setPhase('code')
      return
    } catch (err) {
      // If it's "no account", initiate sign-up flow instead.
      if (!looksLikeNoAccountError(err)) {
        setError(getClerkErrorMessage(err))
        return
      }
    }

    try {
      await signUp.create({
        emailAddress: email,
      })

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      })

      setFlow('signup')
      setPhase('code')
    } catch (err) {
      setError(getClerkErrorMessage(err))
    }
  }

  async function verifyCode(submitCode: string) {
    if (!clerkLoaded) return
    if (submitCode.length !== 6) return
    if (!flow) return

    setError(null)
    setIsVerifying(true)

    try {
      if (flow === 'signin') {
        if (!signIn) throw new Error('Sign-in not ready')
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: submitCode,
        })
        if (result.status === 'complete') {
          router.refresh()
          return
        }
        setError('Verification incomplete')
        return
      }

      // flow === 'signup'
      if (!signUp) throw new Error('Sign-up not ready')
      const result = await signUp.attemptEmailAddressVerification({
        code: submitCode,
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

  // layout: email + toggle inline
  const EMAIL_W = 320

  const toggleClickable = !isActive && phase === 'idle' && emailValid && clerkLoaded

  // auto-submit once 6 digits entered
  useEffect(() => {
    if (phase !== 'code') return
    if (code.length !== 6) return
    void verifyCode(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, phase])

  return (
    <div style={{display: 'grid', gap: 12, justifyItems: 'center'}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
        {!isActive ? (
          <input
            type="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            style={{
              width: EMAIL_W,
              padding: '11px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(255,255,255,0.92)',
              outline: 'none',
              textAlign: 'left',
              boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
            }}
          />
        ) : (
          <button
            type="button"
            style={{
              width: EMAIL_W,
              padding: '11px 14px',
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.26)',
              color: 'rgba(255,255,255,0.88)',
              textAlign: 'left',
              cursor: 'default',
              boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            aria-label="Signed in identity"
          >
            {displayEmail}
          </button>
        )}

        <Toggle checked={isActive} disabled={!toggleClickable} onClick={startEmailCode} />
      </div>

      {!isActive && phase === 'code' && (
        <div
          style={{
            width: EMAIL_W,
            transform: 'translateY(0px)',
            animation: 'otpSlideDown 180ms ease-out',
          }}
        >
          <style>
            {`
              @keyframes otpSlideDown {
                from { opacity: 0; transform: translateY(-10px); }
                to   { opacity: 1; transform: translateY(0px); }
              }
            `}
          </style>

          <OtpBoxes
            width={EMAIL_W}
            value={code}
            onChange={(next) => setCode(normalizeDigits(next))}
            disabled={isVerifying}
          />

          {isVerifying && (
            <div style={{marginTop: 10, fontSize: 12, opacity: 0.70, textAlign: 'center'}}>
              Verifying…
            </div>
          )}
        </div>
      )}

      {error && (
        <div
          style={{
            fontSize: 12,
            opacity: 0.78,
            color: '#ffb4b4',
            maxWidth: EMAIL_W,
            textAlign: 'center',
          }}
        >
          {error}
        </div>
      )}

      {isActive && <>{children}</>}
    </div>
  )
}
