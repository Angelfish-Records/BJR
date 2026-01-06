'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

function fmt(ms: number) {
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

function IconBtn(props: {
  label: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={props.label}
      aria-label={props.label}
      onClick={props.disabled ? undefined : props.onClick}
      disabled={props.disabled}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.92)',
        display: 'grid',
        placeItems: 'center',
        cursor: props.disabled ? 'default' : 'pointer',
        opacity: props.disabled ? 0.45 : 0.9,
      }}
    >
      {props.children}
    </button>
  )
}

export default function MiniPlayer(props: {onExpand?: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  const title = p.current?.title ?? p.current?.id ?? 'Nothing queued'
  const artist = p.current?.artist ?? (p.status === 'idle' ? 'idle' : '')
  const dur = p.current?.durationMs ?? 0
  const pos = p.positionMs ?? 0

  const canSeek = dur > 0 && p.status !== 'blocked'
  const progress = dur > 0 ? Math.max(0, Math.min(1, pos / dur)) : 0

  const repeatLabel =
    p.repeat === 'off' ? 'Repeat off' : p.repeat === 'all' ? 'Repeat all' : 'Repeat 1'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 520px) minmax(0, 1fr)',
        alignItems: 'center',
        gap: 14,
        width: '100%',
      }}
    >
      {/* Left: now playing */}
      <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0}}>
        <div
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            boxShadow: '0 12px 26px rgba(0,0,0,0.25)',
            flex: '0 0 auto',
          }}
        />
        <div style={{minWidth: 0}}>
          <div
            style={{
              fontSize: 13,
              opacity: 0.92,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.65,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {artist}
            {p.lastError ? (
              <span style={{marginLeft: 10, color: '#ffb4b4', opacity: 0.9}}>{p.lastError}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Center: transport + seek */}
      <div style={{display: 'grid', gap: 8, justifyItems: 'center'}}>
        <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
          <IconBtn label="Previous" onClick={p.prev} disabled={p.status === 'blocked'}>
            <span style={{fontSize: 14}}>⏮</span>
          </IconBtn>

          <button
            type="button"
            onClick={() => (p.status === 'playing' ? p.pause() : p.play())}
            disabled={p.status === 'blocked'}
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))',
              color: 'rgba(255,255,255,0.92)',
              cursor: p.status === 'blocked' ? 'default' : 'pointer',
              opacity: p.status === 'blocked' ? 0.45 : 0.95,
              boxShadow:
                '0 0 0 3px color-mix(in srgb, var(--accent) 14%, transparent), 0 14px 30px rgba(0,0,0,0.22)',
            }}
            aria-label={p.status === 'playing' ? 'Pause' : 'Play'}
            title={p.status === 'playing' ? 'Pause' : 'Play'}
          >
            {p.status === 'playing' ? '❚❚' : '▶'}
          </button>

          <IconBtn label="Next" onClick={p.next} disabled={p.status === 'blocked'}>
            <span style={{fontSize: 14}}>⏭</span>
          </IconBtn>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '44px 1fr 44px',
            alignItems: 'center',
            gap: 10,
            width: '100%',
          }}
        >
          <div style={{fontSize: 12, opacity: 0.65, textAlign: 'right'}}>{fmt(pos)}</div>

          <input
            type="range"
            min={0}
            max={dur || 1}
            value={canSeek ? pos : 0}
            disabled={!canSeek}
            onChange={(e) => p.seek(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: 'var(--accent)',
              opacity: canSeek ? 0.95 : 0.4,
            }}
            aria-label="Seek"
          />

          <div style={{fontSize: 12, opacity: 0.65}}>{dur ? fmt(dur) : '—:—'}</div>
        </div>

        <div
          aria-hidden
          style={{
            height: 2,
            width: '100%',
            borderRadius: 999,
            background: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progress * 100}%`,
              background: 'color-mix(in srgb, var(--accent) 70%, white 10%)',
              opacity: canSeek ? 0.7 : 0,
              transition: 'width 120ms linear',
            }}
          />
        </div>
      </div>

      {/* Right: volume + repeat + open */}
      <div style={{display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10}}>
        <IconBtn
          label={p.muted ? 'Unmute' : 'Mute'}
          onClick={p.toggleMute}
          disabled={p.status === 'blocked'}
        >
          <span style={{fontSize: 14}}>{p.muted ? '🔇' : '🔊'}</span>
        </IconBtn>

        <input
          type="range"
          min={0}
          max={100}
          value={Math.round((p.muted ? 0 : p.volume) * 100)}
          disabled={p.status === 'blocked'}
          onChange={(e) => p.setVolume(Number(e.target.value) / 100)}
          style={{
            width: 120,
            accentColor: 'var(--accent)',
            opacity: p.status === 'blocked' ? 0.4 : 0.9,
          }}
          aria-label="Volume"
        />

        <button
          type="button"
          onClick={p.cycleRepeat}
          disabled={p.status === 'blocked'}
          title={repeatLabel}
          aria-label={repeatLabel}
          style={{
            borderRadius: 999,
            border: '1px solid rgba(255,255,255,0.14)',
            background: 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.92)',
            padding: '8px 12px',
            fontSize: 12,
            cursor: p.status === 'blocked' ? 'default' : 'pointer',
            opacity: p.status === 'blocked' ? 0.45 : 0.9,
            whiteSpace: 'nowrap',
          }}
        >
          {p.repeat === 'off' ? 'Repeat' : p.repeat === 'all' ? 'Repeat ∞' : 'Repeat 1'}
        </button>

        {onExpand ? (
          <button
            type="button"
            onClick={onExpand}
            style={{
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.92)',
              padding: '8px 12px',
              fontSize: 12,
              cursor: 'pointer',
              opacity: 0.9,
              whiteSpace: 'nowrap',
            }}
          >
            Open
          </button>
        ) : null}
      </div>
    </div>
  )
}
