// web/app/home/AdminDebugBar.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === '1'

async function setDebug(state: {tier?: string; force?: string}) {
  await fetch('/api/admin/debug', {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(state),
  })
  window.location.reload()
}

async function clearDebug() {
  await fetch('/api/admin/debug', {method: 'DELETE'})
  window.location.reload()
}

type ForceOpt = {id: string; label: string}

const FORCE_OPTS: ForceOpt[] = [
  {id: 'none', label: 'None'},
  {id: 'AUTH_REQUIRED', label: 'AUTH_REQUIRED'},
  {id: 'ENTITLEMENT_REQUIRED', label: 'ENTITLEMENT_REQUIRED'},
  {id: 'ANON_CAP_REACHED', label: 'ANON_CAP'},
  {id: 'EMBARGOED', label: 'EMBARGOED'},
]

export default function AdminDebugBar() {
  // Hooks must always run, even if we return null later.
  const [force, setForce] = React.useState<string>('none')
  const [tokensOpen, setTokensOpen] = React.useState(false)
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  // ESC to close + lock scroll while modal open
  React.useEffect(() => {
    if (!tokensOpen) return

    const prevOverflow = document.documentElement.style.overflow
    document.documentElement.style.overflow = 'hidden'

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTokensOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.documentElement.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [tokensOpen])

  if (!ENABLED) return null

  const btn: React.CSSProperties = {
    padding: '6px 10px',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(0,0,0,0.22)',
    color: 'rgba(255,255,255,0.90)',
    fontSize: 12,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  const selectStyle: React.CSSProperties = {
    ...btn,
    appearance: 'none',
    paddingRight: 28,
    position: 'relative',
  }

  const modal =
    mounted && tokensOpen
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share tokens admin"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setTokensOpen(false)
            }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              zIndex: 100000,
              display: 'grid',
              placeItems: 'center',
              padding: 16,
            }}
          >
            <div
              style={{
                width: 'min(1040px, 100%)',
                height: 'min(78vh, 760px)',
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(10,10,12,0.85)',
                boxShadow: '0 22px 70px rgba(0,0,0,0.55)',
                overflow: 'hidden',
                display: 'grid',
                gridTemplateRows: 'auto 1fr',
              }}
            >
              <div
                style={{
                  padding: '10px 12px',
                  borderBottom: '1px solid rgba(255,255,255,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{minWidth: 0}}>
                  <div style={{fontSize: 12, fontWeight: 650, opacity: 0.92}}>Admin — Share tokens</div>
                  <div style={{fontSize: 11, opacity: 0.62}}>Inline modal shell (server page inside iframe)</div>
                </div>

                <button
                  type="button"
                  onClick={() => setTokensOpen(false)}
                  aria-label="Close"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.90)',
                    cursor: 'pointer',
                    lineHeight: 0,
                  }}
                >
                  ×
                </button>
              </div>

              <iframe
                title="Share tokens admin"
                // optional: you can later add ?embed=1 and simplify the server page chrome for iframe mode
                src="/admin/access?embed=1"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 0,
                  background: 'transparent',
                }}
              />
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div
      id="af-admin-debugbar" 
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          width: '100%',
          minHeight: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '6px 12px',
          background: 'rgba(10,10,14,0.88)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        {/* Left: label */}
        <div
          style={{
            fontSize: 12,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            opacity: 0.6,
            userSelect: 'none',
          }}
        >
          Admin debug
        </div>

        {/* Right: controls */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          <button style={btn} onClick={() => setTokensOpen(true)}>
            Access dashboard
          </button>


          <span
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: 'rgba(255,255,255,0.18)',
              margin: '0 4px',
            }}
          />

          {/* Force state dropdown (collapsed) */}
          <div style={{position: 'relative', display: 'grid'}}>
            <select
              aria-label="Force state"
              value={force}
              onChange={(e) => setForce(e.currentTarget.value)}
              style={selectStyle}
            >
              {FORCE_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  Force: {o.label}
                </option>
              ))}
            </select>

            <div
              aria-hidden
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                pointerEvents: 'none',
                opacity: 0.8,
                fontSize: 10,
              }}
            >
              ▼
            </div>
          </div>

          <button
            style={btn}
            onClick={() => {
              void setDebug({force})
            }}
          >
            Apply
          </button>

          <button style={btn} onClick={() => void setDebug({force: 'none'})}>
            Clear force
          </button>

          <button style={btn} onClick={clearDebug}>
            Reset
          </button>
        </div>
      </div>

      {modal}
    </>
  )
}
