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

export default function AdminDebugBar() {
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
        <button style={btn} onClick={() => setDebug({force: 'AUTH_REQUIRED'})}>
          AUTH_REQUIRED
        </button>
        <button style={btn} onClick={() => setDebug({force: 'ENTITLEMENT_REQUIRED'})}>
          ENTITLEMENT_REQUIRED
        </button>
        <button style={btn} onClick={() => setDebug({force: 'ANON_CAP_REACHED'})}>
          ANON_CAP
        </button>
        <button style={btn} onClick={() => setDebug({force: 'EMBARGOED'})}>
          EMBARGOED
        </button>
        <button style={btn} onClick={() => setDebug({force: 'none'})}>
          Clear force
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

        <button style={btn} onClick={clearDebug}>
          Reset
        </button>
      </div>
    </div>
  )
}
