// web/app/home/ActivationGate.tsx
'use client'

import React, {useEffect, useMemo, useRef, useState} from 'react'
import {useAuth, useSignIn, useSignUp, useUser} from '@clerk/nextjs'
import {useRouter} from 'next/navigation'
import SubscribeButton from '@/app/home/SubscribeButton'
import CancelSubscriptionButton from '@/app/home/CancelSubscriptionButton'
import {PatternPillUnderlay, VisualizerSnapshotCanvas} from '@/app/home/player/VisualizerPattern'

type Phase = 'idle' | 'code'
type Flow = 'signin' | 'signup' | null

type Props = {
  children: React.ReactNode
  attentionMessage?: string | null
  canManageBilling?: boolean
  hasGold?: boolean
  tier?: string | null
}

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

/**
 * Very subtle edge texture (NOT a second outline).
 * We intentionally do not draw a crisp stroke here — the button border is the single outline.
 */
function PatternPillBorder(props: {radius?: number; opacity?: number; seed?: number}) {
  const {radius = 999, opacity = 0.14, seed = 888} = props

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: radius,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <VisualizerSnapshotCanvas
        opacity={opacity}
        fps={12}
        sourceRect={{mode: 'random', seed, scale: 0.6}}
        style={{filter: 'contrast(1.05) saturate(1.05)'}}
        active
      />
    </div>
  )
}

function Toggle(props: {checked: boolean; disabled?: boolean; onClick?: () => void}) {
  const {checked, disabled, onClick} = props

  const w = 56
  const h = 32
  const pad = 3
  const knob = h - pad * 2
  const travel = w - pad * 2 - knob

  const BASE_BG_OFF = 'rgba(255,255,255,0.10)'
  const BASE_BG_ON = 'color-mix(in srgb, var(--accent) 26%, rgba(255,255,255,0.10))'

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
        border: '1px solid rgba(255,255,255,0.18)', // single outline
        background: checked ? BASE_BG_ON : BASE_BG_OFF,
        position: 'relative',
        padding: 0,
        outline: 'none',
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 180ms ease, box-shadow 180ms ease, border-color 180ms ease, opacity 180ms ease',
        boxShadow: checked
          ? '0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent), 0 10px 26px rgba(0,0,0,0.35)'
          : '0 10px 26px rgba(0,0,0,0.28)',
        opacity: disabled ? 0.65 : 1,
        overflow: 'hidden',
        display: 'grid',
        alignItems: 'center',
      }}
    >
      {/* Subtle edge texture only (no extra stroke) */}
      <PatternPillBorder seed={888} opacity={0.12} />

      {/* Interior pattern ONLY when ON */}
      <PatternPillUnderlay active={checked} opacity={0.28} seed={777} />

      {/* specular highlight (no dark scrim) */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 1,
          borderRadius: 999,
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.00))',
          pointerEvents: 'none',
          mixBlendMode: 'screen',
          opacity: checked ? 0.55 : 0.42,
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
  maxWidth?: number
}) {
  const {value, onChange, disabled, maxWidth = 360} = props
  const digits = (value + '______').slice(0, 6).split('')
  const refs = useRef<Array<HTMLInputElement | null>>([])

  function focus(i: number) {
    refs.current[i]?.focus()
  }

  const gap = 10

  return (
    <div style={{width: '100%', display: 'grid', justifyItems: 'center'}}>
      <div
        style={{
          width: '100%',
          maxWidth,
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap,
        }}
      >
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
              width: '100%',
              height: 48,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(0,0,0,0.35)',
              color: 'rgba(255,255,255,0.92)',
              textAlign: 'center',
              fontSize: 18,
              outline: 'none',
              boxShadow: '0 12px 26px rgba(0,0,0,0.24)',
              boxSizing: 'border-box',
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default function ActivationGate(props: Props) {
  const {children, attentionMessage = null, canManageBilling = false, hasGold = false, tier = null} =
    props
  const router = useRouter()

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
    (user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses?.[0]?.emailAddress ?? '') ||
    email

  const EMAIL_W = 360
  const needsAttention = !isActive && !!attentionMessage

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

  // Toggle tracks auth + flow state (and becomes clickable only in the idle/email-valid state).
  const toggleOn = isActive || phase === 'code' || isSending || isVerifying
  const otpOpen = !isActive && phase === 'code'

  // We keep DOM stable: the OTP tray is always mounted (when logged out),
  // and we animate its maxHeight/opacity so the header never “teleports”.
  const OTP_MAX_H = 170 // roomy enough for boxes + messages

  return (
    <div
      style={{
        position: 'relative',
        display: 'grid',
        justifyItems: 'center',
        alignContent: 'end',
      }}
    >
      <div
        style={{
          position: 'relative',
          zIndex: 41,
          width: '100%',
          minWidth: 0,
          maxWidth: EMAIL_W,
          display: 'grid',
          gap: 12,
          justifyItems: 'stretch',
          alignContent: 'end',
        }}
      >
        {/* HEADER ROW */}
        <div
          style={{
            position: 'relative',
            zIndex: 42,
            transform: otpOpen ? 'translateY(-10px)' : 'translateY(0px)', // subtle lift (no flying away)
            transition: 'transform 220ms cubic-bezier(.2,.8,.2,1)',
            willChange: 'transform',
            width: '100%',
            minWidth: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0 12px',
              width: '100%',
              minWidth: 0,
              justifyContent: 'flex-end',
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
                    width: '100%',
                    minWidth: 0,
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
                <div
                  aria-label="Signed in identity"
                  style={{
                    width: '100%',
                    minWidth: 0,
                    height: 32, // match the toggle height
                    display: 'grid',
                    gridTemplateRows: '1fr 1fr',
                    alignItems: 'center',
                    rowGap: 0,
                  }}
                >
                  <div
                    style={{
                      minWidth: 0,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      color: 'rgba(255,255,255,0.82)',
                      fontSize: 12,
                      lineHeight: '16px',
                      letterSpacing: '0.01em',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 999,
                        display: 'grid',
                        placeItems: 'center',
                        background: 'color-mix(in srgb, var(--accent) 55%, rgba(255,255,255,0.10))',
                        boxShadow:
                          '0 10px 18px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(255,255,255,0.18)',
                        flex: '0 0 auto',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          lineHeight: '11px',
                          transform: 'translateY(-0.5px)',
                          color: 'rgba(255,255,255,0.92)',
                        }}
                      >
                        ✓
                      </span>
                    </span>

                    <span
                      style={{
                        minWidth: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={displayEmail}
                    >
                      {displayEmail}
                    </span>
                  </div>

                  <div
                    style={{
                      justifySelf: 'start',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      lineHeight: '16px',
                      minWidth: 0,
                      opacity: 0.95,
                    }}
                  >
                    {tier ? (
                      <>
                        <span style={{opacity: 0.72}} title={tier}>
                          {tier}
                        </span>
                        <span aria-hidden style={{opacity: 0.35}}>
                          |
                        </span>
                      </>
                    ) : null}

                    {canManageBilling ? (
                      hasGold ? (
                        <CancelSubscriptionButton variant="link" label="Cancel subscription" />
                      ) : (
                        <SubscribeButton loggedIn={true} variant="link" label="Become a Patron" />
                      )
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <div style={{flex: '0 0 auto', display: 'grid', alignItems: 'center'}}>
              <Toggle checked={toggleOn} disabled={!toggleClickable} onClick={startEmailCode} />
            </div>
          </div>
        </div>

        {/* OTP TRAY (always mounted when logged out; animated open/close) */}
        {!isActive && (
          <div
            style={{
              width: '100%',
              borderRadius: 16,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(0,0,0,0.28)',
              padding: 12,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              position: 'relative',
              overflow: 'hidden',
              maxHeight: otpOpen ? OTP_MAX_H : 0,
              opacity: otpOpen ? 1 : 0,
              marginTop: otpOpen ? 0 : -12, // helps it feel “under” the header
              transition: 'max-height 240ms cubic-bezier(.2,.8,.2,1), opacity 160ms ease, margin-top 240ms cubic-bezier(.2,.8,.2,1)',
              pointerEvents: otpOpen ? 'auto' : 'none',
              willChange: 'max-height, opacity, margin-top',
            }}
          >
            <div
              style={{
                opacity: otpOpen ? 1 : 0,
                transform: otpOpen ? 'translateY(0px)' : 'translateY(-6px)',
                transition: 'opacity 160ms ease, transform 220ms cubic-bezier(.2,.8,.2,1)',
                display: 'grid',
                gap: 10,
                justifyItems: 'center',
              }}
            >
              <OtpBoxes
                maxWidth={EMAIL_W}
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
