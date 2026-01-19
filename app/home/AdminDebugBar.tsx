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
    padding: '8px 10px',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.14)',
    background: 'rgba(0,0,0,0.22)',
    color: 'rgba(255,255,255,0.90)',
    fontSize: 12,
    cursor: 'pointer',
  }

  return (
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end'}}>
      <span style={{fontSize: 12, opacity: 0.7, alignSelf: 'center'}}>Debug</span>

      <button style={btn} onClick={() => setDebug({force: 'AUTH_REQUIRED'})}>Force AUTH_REQUIRED</button>
      <button style={btn} onClick={() => setDebug({force: 'ENTITLEMENT_REQUIRED'})}>Force ENTITLEMENT_REQUIRED</button>
      <button style={btn} onClick={() => setDebug({force: 'ANON_CAP_REACHED'})}>Force ANON_CAP</button>
      <button style={btn} onClick={() => setDebug({force: 'EMBARGOED'})}>Force EMBARGOED</button>
      <button style={btn} onClick={() => setDebug({force: 'none'})}>Clear force</button>

      <button style={btn} onClick={() => clearDebug()}>Reset</button>
    </div>
  )
}
