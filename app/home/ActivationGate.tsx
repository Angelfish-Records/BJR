// web/app/home/ActivationGate.tsx
'use client'

import React, {useEffect, useMemo, useRef, useState} from 'react'
import {useAuth, useSignIn, useSignUp, useUser} from '@clerk/nextjs'
import {useRouter, useSearchParams} from 'next/navigation'
import {PatternPillUnderlay} from '@/app/home/player/VisualizerPattern'


type Phase = 'idle' | 'code'
type Flow = 'signin' | 'signup' | null

type Props = {
  children: React.ReactNode
  /**
   * Optional override copy when we *already* know we should spotlight activation.
   * If null, we’ll use a default message.
   */
  attentionMessage?: string | null
}

const PENDING_KEY = 'angelfish_pending_purchase_activation'

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
        background: checked ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.10)',
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
        overflow: 'hidden',
      }}
    >
      {/* ALWAYS-ON patterned border ring (does not depend on checked) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 999,
          pointerEvents: 'none',
          overflow: 'hidden',
          // show only the border area
          WebkitMaskImage:
            'radial-gradient(circle, transparent 0, transparent calc(100% - 2px), #000 calc(100% - 1px))',
          maskImage:
            'radial-gradient(circle, transparent 0, transparent calc(100% - 2px), #000 calc(100% - 1px))',
          opacity: 0.95,
        }}
      >
        <PatternPillUnderlay active opacity={0.38} seed={888} />
        {/* crisp edge so it reads as a border even when pattern is subtle */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 999,
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18)',
            pointerEvents: 'none',
          }}
        />
      </div>

      {/* pattern interior ONLY when checked */}
      <PatternPillUnderlay active={checked} opacity={0.32} seed={777} />

      {/* specular layer */}
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

      {/* knob */}
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
          transition: 'transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 180ms ease',
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
              onChange(normalizeDigits(arr.join('')))
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

function safeGetPendingFlag(): boolean {
  try {
    return window.localStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

function safeSetPendingFlag(): void {
  try {
    window.localStorage.setItem(PENDING_KEY, '1')
  } catch {
    // ignore
  }
}

function safeClearPendingFlag(): void {
  try {
    window.localStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}

export default function ActivationGate(props: Props) {
  const {children, attentionMessage = null} = props
  const router = useRouter()
  const searchParams = useSearchParams()

  const {isSignedIn} = useAuth()
  const {user} = useUser()

  const {signIn, setActive: setActiveSignIn, isLoaded: signInLoaded} = useSignIn()
  const {signUp, setActive: setActiveSignUp, isLoaded: signUpLoaded} = useSignUp()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [flow, setFlow] = useState<Flow>(null)
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isActive = !!isSignedIn
  const clerkLoaded = signInLoaded && signUpLoaded

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email])

  const displayEmail =
    (user?.primaryEmailAddress?.emailAddress ??
      user?.emailAddresses?.[0]?.emailAddress ??
      '') || email

  // Only treat as “needs activation spotlight” if:
  // - we returned from Stripe checkout success while signed out, OR
  // - we previously returned from checkout success while signed out (persisted flag)
  const checkoutSuccess = searchParams?.get('checkout') === 'success'

  const [pendingPurchase, setPendingPurchase] = useState(false)

  useEffect(() => {
    // On first mount, load any persisted pending flag.
    setPendingPurchase(safeGetPendingFlag())
  }, [])

  useEffect(() => {
    // If we land on checkout success and are signed out, persist the pending flag.
    if (!isActive && checkoutSuccess) {
      safeSetPendingFlag()
      setPendingPurchase(true)
    }
  }, [checkoutSuccess, isActive])

  useEffect(() => {
    // Once activated, clear the pending flag so the page doesn’t “nag” forever.
    if (isActive) {
      safeClearPendingFlag()
      setPendingPurchase(false)
      router.refresh()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  const EMAIL_W = 320
  const needsAttention = !isActive && (checkoutSuccess || pendingPurchase || !!attentionMessage)
  const shouldShowBox = !isActive && (needsAttention || phase === 'code')

  const toggleClickable = !isActive && phase === 'idle' && emailValid && clerkLoaded

  async function startEmailCode() {
    if (!clerkLoaded || !emailValid) return
    if (!signIn || !signUp) return

    setError(null)
    setCode('')
    setFlow(null)
    setIsVerifying(false)
    setIsSending(true)

    setPhase('code')

    try {
      await signIn.create({identifier: email, strategy: 'email_code'})
      setFlow('signin')
      setIsSending(false)
      return
    } catch (err) {
      if (!looksLikeNoAccountError(err)) {
        setError(getClerkErrorMessage(err))
        setIsSending(false)
        setPhase('idle')
        return
      }
    }

    try {
      await signUp.create({emailAddress: email})
      await signUp.prepareEmailAddressVerification({strategy: 'email_code'})
      setFlow('signup')
      setIsSending(false)
    } catch (err) {
      setError(getClerkErrorMessage(err))
      setIsSending(false)
      setPhase('idle')
    }
  }

  async function verifyCode(submitCode: string) {
    if (!clerkLoaded || submitCode.length !== 6) return
    if (!flow) return

    setError(null)
    setIsVerifying(true)

    try {
      if (flow === 'signin') {
        if (!signIn || !setActiveSignIn) throw new Error('Sign-in not ready')
        const result = await signIn.attemptFirstFactor({
          strategy: 'email_code',
          code: submitCode,
        })
        if (result.status === 'complete') {
          const sid = (result as unknown as {createdSessionId?: string}).createdSessionId
          if (sid) await setActiveSignIn({session: sid})
          router.refresh()
          return
        }
        setError('Verification incomplete')
        return
      }

      if (!signUp || !setActiveSignUp) throw new Error('Sign-up not ready')
      const result = await signUp.attemptEmailAddressVerification({code: submitCode})
      if (result.status === 'complete') {
        const sid = (result as unknown as {createdSessionId?: string}).createdSessionId
        if (sid) await setActiveSignUp({session: sid})
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
    void verifyCode(code)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, phase])

  const message =
    attentionMessage ??
    (pendingPurchase || checkoutSuccess ? 'Sign in to access your purchased content.' : null)

  return (
    <div style={{position: 'relative', display: 'grid', gap: 12, justifyItems: 'center'}}>
      <style>{`
        @keyframes boxDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0px); }
        }
      `}</style>

      {/* Full-page soft dim + blur when we specifically need to spotlight activation */}
      {!isActive && needsAttention ? (
        <div
          aria-hidden
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 40,
          }}
        />
      ) : null}

      <div style={{position: 'relative', zIndex: 41, display: 'grid', gap: 12, justifyItems: 'center'}}>
        <div
  style={{
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    minWidth: 0,            // allow children to shrink
    justifyContent: 'center',
  }}
>
  <div style={{flex: '1 1 auto', minWidth: 0, maxWidth: EMAIL_W}}>
    {!isActive ? (
      <input
        type="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value.trim())}
        style={{
          width: '100%',      // fill wrapper
          minWidth: 0,        // critical for flex shrink
          padding: '11px 14px',
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.18)',
          background: 'rgba(0,0,0,0.35)',
          color: 'rgba(255,255,255,0.92)',
          outline: 'none',
          textAlign: 'left',
          boxShadow: needsAttention
            ? `0 0 0 3px color-mix(in srgb, var(--accent) 32%, transparent),
               0 0 26px color-mix(in srgb, var(--accent) 40%, transparent),
               0 14px 30px rgba(0,0,0,0.22)`
            : '0 14px 30px rgba(0,0,0,0.22)',
          transition: 'box-shadow 220ms ease',
        }}
      />
    ) : (
      <button
        type="button"
        style={{
          width: '100%',      // fill wrapper
          minWidth: 0,        // critical for flex shrink
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
  </div>

  <div style={{flex: '0 0 auto'}}>
    <Toggle checked={isActive} disabled={!toggleClickable} onClick={startEmailCode} />
  </div>
</div>


        {!isActive && shouldShowBox && (
          <div
            style={{
              width: 'min(100%, 320px)',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(0,0,0,0.28)',
              padding: 12,
              animation: 'boxDown 160ms ease-out',
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              position: 'relative',
              overflow: 'hidden',
              minHeight: 72,
            }}
          >
            {/* Message layer */}
            <div
              style={{
                position: 'absolute',
                inset: 12,
                display: 'grid',
                placeItems: 'center',
                textAlign: 'center',
                fontSize: 13,
                opacity: phase !== 'code' && message ? 0.92 : 0,
                pointerEvents: phase !== 'code' && message ? 'auto' : 'none',
                transition: 'opacity 180ms ease',
              }}
            >
              {message}
            </div>

            {/* OTP layer */}
            <div
              style={{
                opacity: phase === 'code' ? 1 : 0,
                transform: phase === 'code' ? 'translateY(0px)' : 'translateY(-4px)',
                transition: 'opacity 180ms ease, transform 180ms ease',
                pointerEvents: phase === 'code' ? 'auto' : 'none',
                display: 'grid',
                gap: 10,
                justifyItems: 'center',
              }}
            >
              <OtpBoxes
                width={Math.min(EMAIL_W - 2, 320 - 2)}
                value={code}
                onChange={(next) => setCode(normalizeDigits(next))}
                disabled={isVerifying}
              />

              {(isSending || !flow) && <div style={{fontSize: 12, opacity: 0.7}}>Sending code…</div>}
              {isVerifying && <div style={{fontSize: 12, opacity: 0.7}}>Verifying…</div>}

              {error && (
                <div style={{fontSize: 12, opacity: 0.88, color: '#ffb4b4', textAlign: 'center'}}>
                  {error}
                </div>
              )}
            </div>
          </div>
        )}

        {isActive && <>{children}</>}
      </div>
    </div>
  )
}
