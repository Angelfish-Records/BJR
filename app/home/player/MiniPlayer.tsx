// web/app/home/player/MiniPlayer.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import {createPortal} from 'react-dom'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

// NOTE: defined OUTSIDE render
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
      <path d="M11 7 8.5 9H6v6h2.5L11 17V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M16 9l5 5M21 9l-5 5" stroke="currentColor" strokeWidth="2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M11 7 8.5 9H6v6h2.5L11 17V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14.5 9.5c.9.9.9 4.1 0 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M17 7c2 2 2 8 0 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M5 7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M5 17h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

function VolBtnBinder(props: {onBind: (btn: HTMLButtonElement | null) => void}) {
  const {onBind} = props

  React.useEffect(() => {
    // Find the most recent "Volume" button in this component subtree.
    // We do this because IconBtn doesn't forwardRef.
    const btn = document.querySelector('button[aria-label="Volume"]') as HTMLButtonElement | null
    onBind(btn)
    return () => onBind(null)
  }, [onBind])

  return null
}


export default function MiniPlayer(props: {onExpand?: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  const [posSec, setPosSec] = React.useState(0)
  const durSec = Math.max(1, Math.round((p.current?.durationMs ?? 0) / 1000))
  const safePos = clamp(posSec, 0, durSec)

  const [volOpen, setVolOpen] = React.useState(false)
  const [vol, setVol] = React.useState(0.85)
  const muted = vol <= 0.001
  const volBtnRef = React.useRef<HTMLButtonElement | null>(null)
const [volAnchor, setVolAnchor] = React.useState<{x: number; y: number} | null>(null)

React.useEffect(() => {
  if (!volOpen) {
    setVolAnchor(null)
    return
  }

  const el = volBtnRef.current
  if (!el) return

  const compute = () => {
    const r = el.getBoundingClientRect()
    // anchor point: horizontally centered above the button
    setVolAnchor({x: r.left + r.width / 2, y: r.top})
  }

  compute()
  window.addEventListener('scroll', compute, true)
  window.addEventListener('resize', compute)

  return () => {
    window.removeEventListener('scroll', compute, true)
    window.removeEventListener('resize', compute)
  }
}, [volOpen])


  const title = p.current?.title ?? p.current?.id ?? 'Nothing queued'
  const artist = p.current?.artist ?? (p.status === 'blocked' ? 'blocked' : p.status)

  const DOCK_PAD_TOP = 10

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        display: 'grid',
        gap: 10,
        marginTop: -DOCK_PAD_TOP,
        paddingTop: DOCK_PAD_TOP,
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
      </div>

      <style>{`
        /* Seek range styling */
        input[aria-label="Seek"]::-webkit-slider-runnable-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,0.18);
        }
        input[aria-label="Seek"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 10px;
          height: 10px;
          border-radius: 999px;
          margin-top: -3px;
          background: color-mix(in srgb, var(--accent) 75%, white 10%);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
        }
        input[aria-label="Seek"]::-moz-range-track {
          height: 4px;
          border-radius: 999px;
          background: rgba(255,255,255,0.18);
        }
        input[aria-label="Seek"]::-moz-range-thumb {
          width: 10px;
          height: 10px;
          border: 0;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 75%, white 10%);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
        }

        /* Volume slider (rotate reliably everywhere) */
        .volSlider {
          -webkit-appearance: none;
          appearance: none;
          width: 130px; /* becomes vertical length after rotate */
          height: 18px; /* becomes thickness */
          background: transparent;
          transform: rotate(-90deg);
          transform-origin: center;
        }
        .volSlider::-webkit-slider-runnable-track {
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.18);
        }
        .volSlider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 999px;
          margin-top: -5px; /* centers thumb on 6px track */
          background: color-mix(in srgb, var(--accent) 75%, white 10%);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
        }
        .volSlider::-moz-range-track {
          height: 6px;
          border-radius: 999px;
          background: rgba(255,255,255,0.18);
        }
        .volSlider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          border: 0;
          border-radius: 999px;
          background: color-mix(in srgb, var(--accent) 75%, white 10%);
          box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
        }
      `}</style>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: 12,
          paddingTop: 14,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 8}}>
          <IconBtn label="Previous" onClick={() => {}}>
            <PrevIcon />
          </IconBtn>

          <IconBtn
            label={p.status === 'playing' ? 'Pause' : 'Play'}
            onClick={() => (p.status === 'playing' ? p.pause() : p.play())}
          >
            <PlayPauseIcon playing={p.status === 'playing'} />
          </IconBtn>

          <IconBtn label="Next" onClick={() => {}}>
            <NextIcon />
          </IconBtn>
        </div>

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
          </div>
        </div>

        <div style={{display: 'flex', alignItems: 'center', gap: 8, justifySelf: 'end'}}>
          {/* Volume icon + pop slider */}
{/* Volume icon + pop slider (ported to body for reliable positioning) */}
<div style={{display: 'grid', justifyItems: 'center'}}>
  <IconBtn
    label="Volume"
    onClick={() => setVolOpen((v) => !v)}
    title="Volume"
  >
    {/* Wrap IconBtn so we can attach a ref to the actual button */}
    <span
      // This span does nothing visually; it's just to let us capture the button node reliably.
      // We'll set the ref on the parent button via a callback below.
      aria-hidden
    >
      <VolumeIcon muted={muted} />
    </span>
  </IconBtn>

  {/* Attach the ref to the *actual* IconBtn button via DOM query */}
  <span
    style={{display: 'none'}}
    ref={() => {
      // no-op element; we use layout effect below to grab the previous button
    }}
  />

  {/*
    We need the real button element for getBoundingClientRect().
    Since IconBtn doesn't forwardRef, we grab the closest button after render.
  */}
  <VolBtnBinder onBind={(btn) => (volBtnRef.current = btn)} />

  {volOpen && volAnchor
    ? createPortal(
        <>
          <div
            style={{
              position: 'fixed',
              left: volAnchor.x,
              top: volAnchor.y,
              transform: 'translate(-50%, calc(-100% - 10px))', // above the button
              width: 56,
              height: 170,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(10px)',
              padding: 10,
              boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              zIndex: 99999,
            }}
          >
            <input
              className="volRange"
              aria-label="Volume slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={vol}
              onChange={(e) => setVol(Number(e.target.value))}
              style={{
                width: 140, // becomes vertical length after rotate
                height: 18,
                transform: 'rotate(-90deg)',
                transformOrigin: 'center',
                background: 'transparent',
                margin: 0,
                padding: 0,
              }}
            />
          </div>

          <style>{`
            .volRange {
              -webkit-appearance: none;
              appearance: none;
            }
            .volRange::-webkit-slider-runnable-track {
              height: 6px;
              border-radius: 999px;
              background: rgba(255,255,255,0.22);
            }
            .volRange::-webkit-slider-thumb {
              -webkit-appearance: none;
              appearance: none;
              width: 16px;
              height: 16px;
              border-radius: 999px;
              margin-top: -5px; /* centers thumb on 6px track */
              background: color-mix(in srgb, var(--accent) 75%, white 10%);
              box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
            }
            .volRange::-moz-range-track {
              height: 6px;
              border-radius: 999px;
              background: rgba(255,255,255,0.22);
            }
            .volRange::-moz-range-thumb {
              width: 16px;
              height: 16px;
              border: 0;
              border-radius: 999px;
              background: color-mix(in srgb, var(--accent) 75%, white 10%);
              box-shadow: 0 0 0 3px rgba(0,0,0,0.35);
            }
          `}</style>
        </>,
        document.body
      )
    : null}
</div>



          {onExpand ? (
            <IconBtn label="Open player" title="Open player" onClick={onExpand}>
              <MenuIcon />
            </IconBtn>
          ) : null}
        </div>
      </div>

      <style>{`
        @media (max-width: 520px) {
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] {
            grid-template-columns: 1fr auto;
            grid-auto-rows: auto;
            row-gap: 10px;
          }
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] > div:nth-child(2) {
            grid-column: 1 / -1;
            order: 3;
          }
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] > div:nth-child(1) {
            order: 1;
          }
          div[style*="grid-template-columns: auto minmax(0, 1fr) auto"] > div:nth-child(3) {
            order: 2;
          }
        }
      `}</style>
    </div>
  )
}
