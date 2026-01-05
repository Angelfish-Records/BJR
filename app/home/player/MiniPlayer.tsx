'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

export default function MiniPlayer(props: {onExpand?: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  return (
    <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
      <div style={{minWidth: 0}}>
        <div style={{fontSize: 12, opacity: 0.7}}>Dock</div>
        <div style={{fontSize: 13, opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
          {p.current?.title ?? p.current?.id ?? 'No track'}
          <span style={{marginLeft: 10, fontSize: 12, opacity: 0.65}}>
            {p.status === 'blocked' ? 'blocked' : p.status}
          </span>
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
            padding: '8px 10px',
            fontSize: 13,
            cursor: 'pointer',
            opacity: 0.9,
          }}
        >
          {p.status === 'playing' ? 'Pause' : 'Play'}
        </button>

        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            style={{
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.9)',
              padding: '8px 10px',
              fontSize: 13,
              cursor: 'pointer',
              opacity: 0.85,
            }}
          >
            Open
          </button>
        ) : null}
      </div>
    </div>
  )
}
