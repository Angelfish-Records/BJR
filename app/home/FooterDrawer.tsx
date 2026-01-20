// web/app/home/FooterDrawer.tsx
'use client'

import React, {useEffect, useMemo, useRef, useState} from 'react'

type FooterKey = 'privacy' | 'terms' | 'rights' | 'ai' | 'licensing' | 'security'

type Item = {
  key: FooterKey
  title: string
  body: React.ReactNode
}

const STORAGE_KEY = 'af_footer_drawer_open_v1'

export default function FooterDrawer(props: {
  emailTo?: string // default: licensing@yourdomain, or just "hello@..."
  licensingHref?: string // recommend: process.env.NEXT_PUBLIC_LABEL_SITE_URL
}) {
  const emailTo = props.emailTo ?? 'hello@angelfishrecords.com'
  const licensingHref = props.licensingHref ?? ''

  const items: Item[] = useMemo(
    () => [
      {
        key: 'privacy',
        title: 'Privacy',
        body: (
          <>
            Identity is email-only (Clerk). Access decisions and playthrough telemetry are stored first-party in
            Postgres (Neon/Vercel Postgres). Streaming is served via Mux with short-lived signed tokens. We
            don’t sell personal data, and we don’t run ad-tracking pixels. We use cookies only for session/auth
            and basic anti-abuse controls. We retain logs only as long as needed for access control, security,
            and accounting.
          </>
        ),
      },
      {
        key: 'terms',
        title: 'Terms',
        body: (
          <>
            Streams and downloads are licensed, not sold, unless explicitly stated. Access is
            entitlement-bound (membership/purchase) and may be revoked for fraud, abuse, or policy violations.
            You may not redistribute, mirror, scrape, or automate access. Sharing links/tokens is permitted
            only where the UI explicitly enables it.
          </>
        ),
      },
      {
        key: 'rights',
        title: 'Rights',
        body: (
          <>
            All recordings, compositions, lyrics, artwork, and audiovisual elements are protected by copyright
            and related rights. No synchronisation, public performance, mechanical reproduction, sampling,
            derivative works, or redistribution without written licence. Unauthorized uploading to third-party
            platforms, content-ID databases, or dataset aggregation is prohibited.
          </>
        ),
      },
      {
        key: 'ai',
        title: 'AI',
        body: (
          <>
            No automated scraping, dataset inclusion, or model training on this site’s content is permitted
            without an express written agreement. This includes text, audio, stems, artwork, video, metadata,
            and fingerprints.
          </>
        ),
      },
      {
        key: 'licensing',
        title: 'Licensing',
        body: (
          <>
            Catalogue available for sync and licensing: controlled rights, clean metadata, and rapid clearance.
            For briefs, placements, or catalogue partnerships, contact the label.{' '}
            {licensingHref ? (
              <a
                href={licensingHref}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  marginLeft: 10,
                  padding: '7px 10px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.16)',
                  background: 'rgba(255,255,255,0.06)',
                  textDecoration: 'none',
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 12,
                  lineHeight: 1,
                  whiteSpace: 'nowrap',
                }}
              >
                Licensing &amp; Sync →
              </a>
            ) : null}
          </>
        ),
      },
      {
        key: 'security',
        title: 'Security',
        body: (
          <>
            If you believe you’ve found a vulnerability or rights issue, report it. We respond quickly and
            prefer private disclosure.{' '}
            <a
              href={`mailto:${emailTo}`}
              style={{
                color: 'rgba(255,255,255,0.92)',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
              }}
            >
              Email us
            </a>
            .
          </>
        ),
      },
    ],
    [emailTo, licensingHref]
  )

  const [openKey, setOpenKey] = useState<FooterKey | null>(null)

  // height animation plumbing (single panel)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [contentHeight, setContentHeight] = useState<number>(0)

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved && items.some((i) => i.key === saved)) setOpenKey(saved as FooterKey)
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      if (openKey) window.localStorage.setItem(STORAGE_KEY, openKey)
    } catch {
      // ignore
    }
  }, [openKey])

  useEffect(() => {
    // measure on openKey changes
    const el = contentRef.current
    if (!el) return
    if (!openKey) {
      setContentHeight(0)
      return
    }
    // Use rAF so the DOM has committed the new content before measuring
    const raf = requestAnimationFrame(() => {
      const next = el.scrollHeight
      setContentHeight(next)
    })
    return () => cancelAnimationFrame(raf)
  }, [openKey])

  const active = openKey ? items.find((i) => i.key === openKey) ?? null : null

  const shellStyle: React.CSSProperties = {
    marginTop: 18,
    borderRadius: 18,
    border: '1px solid rgba(255,255,255,0.10)',
    background: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  }

  const tabRowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'nowrap',
    gap: 6,
    padding: '10px 10px',
    alignItems: 'center',
    justifyContent: 'space-between',
  }

  const tabButtonStyle = (isOpen: boolean): React.CSSProperties => ({
    flex: '1 1 0',
    minWidth: 0,
    appearance: 'none',
    border: '1px solid rgba(255,255,255,0.12)',
    background: isOpen ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
    color: 'rgba(255,255,255,0.86)',
    borderRadius: 999,
    padding: '8px 10px',
    fontSize: 12,
    lineHeight: 1,
    letterSpacing: 0.2,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    transition: 'background 160ms ease, border-color 160ms ease, transform 120ms ease',
  })

  const panelOuterStyle: React.CSSProperties = {
    height: openKey ? contentHeight : 0,
    transition: 'height 200ms ease',
    overflow: 'hidden',
    borderTop: openKey ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(255,255,255,0.00)',
  }

  const panelInnerStyle: React.CSSProperties = {
    padding: '12px 14px 14px',
    fontSize: 13,
    lineHeight: 1.55,
    color: 'rgba(255,255,255,0.78)',
  }

  return (
    <footer style={shellStyle} aria-label="Footer drawer">
      <div style={tabRowStyle}>
        {items.map((it) => {
          const isOpen = openKey === it.key
          return (
            <button
              key={it.key}
              type="button"
              aria-expanded={isOpen}
              aria-controls={`footer-drawer-panel-${it.key}`}
              onClick={() => setOpenKey((prev) => (prev === it.key ? null : it.key))}
              style={tabButtonStyle(isOpen)}
              onMouseDown={(e) => {
                // tiny tactile feel without messing with focus rings
                ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.99)'
                window.setTimeout(() => {
                  try {
                    ;(e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'
                  } catch {}
                }, 90)
              }}
            >
              {it.title}
            </button>
          )
        })}
      </div>

      <div style={panelOuterStyle} aria-hidden={!openKey}>
        <div
          ref={contentRef}
          id={openKey ? `footer-drawer-panel-${openKey}` : undefined}
          style={panelInnerStyle}
        >
          {active ? (
            <>
              <div style={{fontSize: 12, letterSpacing: 0.3, opacity: 0.75, marginBottom: 6}}>
                {active.title}
              </div>
              <div>{active.body}</div>
            </>
          ) : null}
        </div>
      </div>
    </footer>
  )
}
