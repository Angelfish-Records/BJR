// web/app/home/MiniPlayer.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function fmtTime(sec: number) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// NOTE: defined OUTSIDE render to avoid “Cannot create components during render”
function IconBtn(props: {
  label: string
  title?: string
  onClick?: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  const {label, title, onClick, disabled, children} = props
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: 36,
        height: 36,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(255,255,255,0.05)',
        color: 'rgba(255,255,255,0.92)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 0.9,
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  )
}

function PlayPauseIcon({playing}: {playing: boolean}) {
  return playing ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  )
}

function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="2" height="12" />
      <polygon points="18,7 10,12 18,17" />
    </svg>
  )
}

function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="16" y="6" width="2" height="12" />
      <polygon points="6,7 14,12 6,17" />
    </svg>
  )
}

function VolumeIcon({muted}: {muted: boolean}) {
  return muted ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 7 8.5 9H6v6h2.5L11 17V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 9l5 5M21 9l-5 5" stroke="currentColor" strokeWidth="2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 7 8.5 9H6v6h2.5L11 17V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 9.5c.9.9.9 4.1 0 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 7c2 2 2 8 0 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  )
}

export default function MiniPlayer(props: {onExpand?: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  // Progress UI is “visual only” for now (until real audio plumbing exists)
  const [posSec, setPosSec] = React.useState(0)
  const durSec = Math.max(1, Math.round((p.current?.durationMs ?? 0) / 1000))
  const safePos = clamp(posSec, 0, durSec)

  // Volume: icon + pop slider (local-only for now)
  const [volOpen, setVolOpen] = React.useState(false)
  const [vol, setVol] = React.useState(0.85)
  const muted = vol <= 0.001

  const title = p.current?.title ?? p.current?.id ?? 'Nothing queued'
  const artist = p.current?.artist ?? (p.status === 'blocked' ? 'blocked' : p.status)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        display: 'grid',
        gap: 10,
      }}
    >
      {/* TOP EDGE progress bar (full width) */}
      <div style={{position: 'absolute', left: 0, right: 0, top: 0}}>
        <input
          aria-label="Seek"
          type="range"
          min={0}
          max={durSec}
          value={safePos}
          onChange={(e) => setPosSec(Number(e.target.value))}
          style={{
            width: '100%',
            height: 18,
            margin: 0,
            background: 'transparent',
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
        />
        <style>{`
          /* Range styling (kept local to avoid global CSS drift) */
          input[type="range"]::-webkit-slider-runnable-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.18);
          }
          input[type="range"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 10px;
            height: 10px;
            border-radius: 999px;
            margin-top: -3px;
            background: color-mix(in srgb, var(--accent) 75%, white 10%);
            box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
          }
          input[type="range"]::-moz-range-track {
            height: 4px;
            border-radius: 999px;
            background: rgba(255,255,255,0.18);
          }
          input[type="range"]::-moz-range-thumb {
            width: 10px;
            height: 10px;
            border: 0;
            border-radius: 999px;
            background: color-mix(in srgb, var(--accent) 75%, white 10%);
            box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
          }
        `}</style>
      </div>

      {/* Main row: controls + meta + actions (responsive without overlap) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 12,
          paddingTop: 14, // leave room for the top-edge slider
        }}
      >
        {/* Left controls */}
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <IconBtn label="Previous" onClick={() => { /* wire later */ }}>
            <PrevIcon />
          </IconBtn>

          <IconBtn
            label={p.status === 'playing' ? 'Pause' : 'Play'}
            onClick={() => (p.status === 'playing' ? p.pause() : p.play())}
          >
            <PlayPauseIcon playing={p.status === 'playing'} />
          </IconBtn>

          <IconBtn label="Next" onClick={() => { /* wire later */ }}>
            <NextIcon />
          </IconBtn>
        </div>

        {/* Middle meta */}
        <div style={{minWidth: 0}}>
          <div
            style={{
              fontSize: 13,
              opacity: 0.92,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              lineHeight: 1.25,
            }}
          >
            {title}
          </div>
          <div style={{fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
            {artist}
          </div>
        </div>

        {/* Right actions */}
        <div style={{display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end'}}>
          {/* Time (compact) */}
          <div style={{fontSize: 12, opacity: 0.65, whiteSpace: 'nowrap'}}>
            {fmtTime(safePos)} <span style={{opacity: 0.45}}>/</span> {fmtTime(durSec)}
          </div>

          {/* Volume icon + pop slider */}
          <div style={{position: 'relative'}}>
            <IconBtn
              label="Volume"
              onClick={() => setVolOpen((v) => !v)}
              title="Volume"
            >
              <VolumeIcon muted={muted} />
            </IconBtn>

            {volOpen ? (
  <div
    style={{
      position: 'absolute',
      right: 0,
      bottom: 44,
      width: 48,
      height: 150,
      borderRadius: 14,
      border: '1px solid rgba(255,255,255,0.12)',
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(10px)',
      padding: 10,
      boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
      display: 'grid',
      justifyItems: 'center',
      alignItems: 'center',
    }}
  >
    <input
      aria-label="Volume slider"
      type="range"
      min={0}
      max={1}
      step={0.01}
      value={vol}
      onChange={(e) => setVol(Number(e.target.value))}
      style={{
        width: 120, // becomes the vertical length after rotation
        transform: 'rotate(-90deg)',
        transformOrigin: 'center',
        background: 'transparent',
      }}
    />
  </div>
) : null}

          </div>

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
                opacity: 0.9,
              }}
            >
              Open
            </button>
          ) : null}
        </div>
      </div>

      {/* Mobile tightening (no overlap): stack meta under controls, keep top slider */}
      <style>{`
        @media (max-width: 520px) {
          /* Turn main row into two rows: controls + actions, then meta */
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] {
            grid-template-columns: 1fr auto;
            grid-auto-rows: auto;
            row-gap: 10px;
          }
          /* Meta spans full width below */
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] > div:nth-child(2) {
            grid-column: 1 / -1;
            order: 3;
          }
          /* Left controls stay first */
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] > div:nth-child(1) {
            order: 1;
          }
          /* Right actions stay top-right */
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] > div:nth-child(3) {
            order: 2;
          }
        }
      `}</style>
    </div>
  )
}
