// web/app/home/modules/GiftAlbumButton.tsx
'use client'

import React from 'react'

type Props = {
  albumTitle: string
  albumSlug: string
  ctaLabel?: string
  className?: string
}

type GiftCreateOk = {
  ok: true
  albumSlug: string
  recipientEmail: string
  claimUrl: string
  subject: string
  body: string
  mailto: string
  checkoutUrl: string
  stripeCheckoutSessionId?: string
  correlationId?: string
}

type GiftCreateErr = {
  ok: false
  error: string
}

/* -------------------------
   Runtime type guards
-------------------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

function isGiftCreateOk(v: unknown): v is GiftCreateOk {
  if (!isRecord(v)) return false
  return (
    v.ok === true &&
    typeof v.albumSlug === 'string' &&
    typeof v.recipientEmail === 'string' &&
    typeof v.claimUrl === 'string' &&
    typeof v.mailto === 'string' &&
    typeof v.checkoutUrl === 'string'
  )
}

function isGiftCreateErr(v: unknown): v is GiftCreateErr {
  if (!isRecord(v)) return false
  return v.ok === false && typeof v.error === 'string'
}

/* -------------------------
   Component
-------------------------- */

export default function GiftAlbumButton(props: Props) {
  const {albumTitle, albumSlug, ctaLabel = 'Send as gift', className} = props

  const [open, setOpen] = React.useState(false)
  const [toEmail, setToEmail] = React.useState('')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [claimUrl, setClaimUrl] = React.useState<string | null>(null)
  const [mailto, setMailto] = React.useState<string | null>(null)

  const canSubmit =
    toEmail.trim().length >= 3 &&
    toEmail.includes('@') &&
    !busy

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setOpen(false)
  }

  async function createGift(): Promise<GiftCreateOk> {
    const res = await fetch('/api/gifts/create', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({
        albumSlug,
        recipientEmail: toEmail.trim(),
        message: note,
      }),
    })

    const raw: unknown = await res.json().catch(() => null)

    if (isGiftCreateOk(raw)) return raw
    if (isGiftCreateErr(raw)) throw new Error(raw.error)

    throw new Error(`HTTP_${res.status}`)
  }

  const onContinueToStripe = async () => {
    if (!canSubmit) return
    setBusy(true)
    setError(null)

    try {
      const created = await createGift()
      setClaimUrl(created.claimUrl)
      setMailto(created.mailto)

      // Best-effort: open email draft (user-initiated click)
      try {
        window.location.href = created.mailto
      } catch {
        // ignore popup blocking
      }

      // Canonical flow: redirect to Stripe
      window.location.href = created.checkoutUrl
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const onCopyClaim = async () => {
    if (!claimUrl) return
    try {
      await navigator.clipboard.writeText(claimUrl)
    } catch {
      window.prompt('Copy gift claim link:', claimUrl)
    }
  }

  const onOpenMailDraft = () => {
    if (mailto) window.location.href = mailto
  }

  return (
    <div style={{display: 'inline-block'}}>
      <button
        type="button"
        className={className}
        onClick={() => {
          setOpen(true)
          setError(null)
          setBusy(false)
          setClaimUrl(null)
          setMailto(null)
        }}
        style={{
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.03)',
          padding: '10px 14px',
          fontSize: 13,
          opacity: 0.92,
          cursor: 'pointer',
        }}
      >
        {ctaLabel}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          onMouseDown={onBackdropMouseDown}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,

            // Android drift guardrails
            overflowX: 'clip',
            maxWidth: '100vw',
          }}
        >
          <div
            style={{
              width: 'min(560px, 100%)',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(20,20,20,0.88)',
              boxShadow: '0 18px 60px rgba(0,0,0,0.55)',
              padding: 16,
              minWidth: 0,
              maxWidth: '100%',
              overflowX: 'clip',
            }}
          >
            <div style={{display: 'flex', justifyContent: 'space-between', gap: 12}}>
              <div style={{fontSize: 14, opacity: 0.92}}>Send as gift</div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '6px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div style={{marginTop: 10, fontSize: 13, opacity: 0.78}}>
              You’ll be sent to Stripe to purchase{' '}
              <span style={{opacity: 0.9}}>{albumTitle}</span> as a gift.
            </div>

            <div style={{marginTop: 14, display: 'grid', gap: 10}}>
              <label>
                <div style={{fontSize: 12, opacity: 0.7}}>Recipient email</div>
                <input
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="name@example.com"
                  inputMode="email"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '10px 12px',
                    color: 'white',
                  }}
                />
              </label>

              <label>
                <div style={{fontSize: 12, opacity: 0.7}}>Note (optional)</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  placeholder="A short message…"
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '10px 12px',
                    color: 'white',
                    resize: 'vertical',
                  }}
                />
              </label>

              {error ? (
                <div
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(255,80,80,0.22)',
                    background: 'rgba(255,80,80,0.08)',
                    padding: '10px 12px',
                    fontSize: 12,
                  }}
                >
                  Gift error: {error}
                </div>
              ) : null}

              {claimUrl ? (
                <div style={{fontSize: 12, opacity: 0.9, wordBreak: 'break-word'}}>
                  Claim link (backup): {claimUrl}
                </div>
              ) : null}
            </div>

            <div style={{marginTop: 14, display: 'flex', gap: 10, justifyContent: 'flex-end'}}>
              {claimUrl ? (
                <>
                  <button type="button" onClick={onCopyClaim}>Copy claim link</button>
                  <button type="button" onClick={onOpenMailDraft}>Open email</button>
                </>
              ) : null}

              <button type="button" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>

              <button
                type="button"
                disabled={!canSubmit}
                onClick={onContinueToStripe}
              >
                {busy ? 'Opening Stripe…' : 'Continue to Stripe'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
