'use client'

import React from 'react'

type Props = {
  albumTitle: string
  albumSlug: string
  ctaLabel?: string
  className?: string
}

function buildGiftMailto(args: {albumTitle: string; albumUrl: string; toEmail: string; note: string}) {
  const subject = `A gift for you: ${args.albumTitle}`
  const lines: string[] = [
    `Hey — I wanted you to have this: ${args.albumTitle}`,
    '',
    `Link: ${args.albumUrl}`,
    '',
    args.note.trim() ? `Note: ${args.note.trim()}` : '',
    '',
    `If the page shows “Buy digital album”, you can purchase it there.`,
  ].filter(Boolean)

  const body = lines.join('\n')

  const params = new URLSearchParams()
  params.set('subject', subject)
  params.set('body', body)

  // recipient goes in the mailto target
  return `mailto:${encodeURIComponent(args.toEmail)}?${params.toString()}`
}

export default function GiftAlbumButton(props: Props) {
  const {albumTitle, albumSlug, ctaLabel = 'Send as gift', className} = props

  const [open, setOpen] = React.useState(false)
  const [toEmail, setToEmail] = React.useState('')
  const [note, setNote] = React.useState('')

  const albumUrl = React.useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/albums/${encodeURIComponent(albumSlug)}`
  }, [albumSlug])

  const canGenerate = toEmail.trim().length >= 3 && toEmail.includes('@') && albumUrl.length > 0

  const onBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) setOpen(false)
  }

  const onGenerate = () => {
    if (!canGenerate) return
    const href = buildGiftMailto({
      albumTitle,
      albumUrl,
      toEmail: toEmail.trim(),
      note,
    })
    window.location.href = href
    setOpen(false)
  }

  return (
    <div style={{display: 'inline-block'}}>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
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
            }}
          >
            <div style={{display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12}}>
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
                  opacity: 0.8,
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>

            <div style={{marginTop: 10, fontSize: 13, opacity: 0.78, lineHeight: 1.5}}>
              This generates an email in your mail app with a link to <span style={{opacity: 0.9}}>{albumTitle}</span>.
              (Phase 2 will make this a real paid “gift purchase + redeem”.)
            </div>

            <div style={{marginTop: 14, display: 'grid', gap: 10}}>
              <label style={{display: 'grid', gap: 6}}>
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
                    outline: 'none',
                  }}
                />
              </label>

              <label style={{display: 'grid', gap: 6}}>
                <div style={{fontSize: 12, opacity: 0.7}}>Note (optional)</div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="A short message…"
                  rows={4}
                  style={{
                    width: '100%',
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.03)',
                    padding: '10px 12px',
                    color: 'white',
                    outline: 'none',
                    resize: 'vertical',
                  }}
                />
              </label>
            </div>

            <div style={{marginTop: 14, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap'}}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.10)',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '10px 14px',
                  fontSize: 13,
                  opacity: 0.85,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                disabled={!canGenerate}
                onClick={onGenerate}
                style={{
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: canGenerate ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
                  padding: '10px 14px',
                  fontSize: 13,
                  opacity: canGenerate ? 0.95 : 0.5,
                  cursor: canGenerate ? 'pointer' : 'not-allowed',
                }}
              >
                Generate email
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
