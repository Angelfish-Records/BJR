// web/app/home/AdminDebugBar.tsx
'use client'

import React from 'react'

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
  // Hooks must always run, even if the component returns null later.
  const [force, setForce] = React.useState<string>('none')

  // Optional: reflect currently-set force from cookie/server later if you want.
  // For now we keep it simple and deterministic.

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

  return (
    <div
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

      <div
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        {/* Force state dropdown (collapsed controls) */}
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

          {/* caret */}
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

        <span
          aria-hidden
          style={{
            width: 1,
            height: 18,
            background: 'rgba(255,255,255,0.18)',
            margin: '0 4px',
          }}
        />

        <button style={btn} onClick={() => void setDebug({force: 'none'})}>
          Clear force
        </button>

        <button style={btn} onClick={clearDebug}>
          Reset
        </button>
      </div>
    </div>
  )
}
