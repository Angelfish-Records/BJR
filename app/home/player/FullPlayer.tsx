'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

export default function FullPlayer() {
  const p = usePlayer()

  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid rgba(255,255,255,0.10)',
        background: 'rgba(255,255,255,0.04)',
        padding: 16,
        minWidth: 0,
      }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12}}>
        <div style={{minWidth: 0}}>
          <div style={{fontSize: 12, opacity: 0.7}}>Now playing (full)</div>
          <div style={{fontSize: 15, opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
            {p.current?.title ?? p.current?.id ?? 'Nothing queued'}
          </div>
          <div style={{fontSize: 12, opacity: 0.65}}>
            {p.status === 'blocked' ? 'blocked' : p.status}
            {p.current?.artist ? ` · ${p.current.artist}` : ''}
          </div>
        </div>

        <div style={{display: 'flex', gap: 8}}>
          <button
            type="button"
            onClick={() => (p.status === 'playing' ? p.pause() : p.play())}
            style={{
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)',
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              opacity: 0.9,
            }}
          >
            {p.status === 'playing' ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            onClick={() => p.enqueue({id: `track_${Math.random().toString(16).slice(2, 8)}`, title: 'Queued track'})}
            style={{
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)',
              padding: '8px 12px',
              fontSize: 13,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            + Queue
          </button>
        </div>
      </div>

      {p.lastError ? (
        <div
          style={{
            marginTop: 12,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(0,0,0,0.22)',
            padding: '10px 12px',
            fontSize: 12,
            opacity: 0.85,
            lineHeight: 1.45,
          }}
        >
          {p.lastError}
        </div>
      ) : null}
    </div>
  )
}
