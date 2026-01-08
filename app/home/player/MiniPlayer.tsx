// web/app/home/player/MiniPlayer.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'
import {usePlayer} from './PlayerState'

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

const IconBtn = React.forwardRef<
  HTMLButtonElement,
  {
    label: string
    title?: string
    onClick?: () => void
    disabled?: boolean
    children: React.ReactNode
  }
>(function IconBtn(props, ref) {
  const {label, title, onClick, disabled, children} = props
  return (
    <button
      ref={ref}
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
})

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

export default function MiniPlayer(props: {onExpand?: () => void}) {
  const {onExpand} = props
  const p = usePlayer()

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const playingish = p.status === 'playing' || p.status === 'loading'

  /* ---------------- Seek (scrub without fighting timeupdate) ---------------- */

  const durMs = p.current?.durationMs ?? 0
  const durKnown = durMs > 0
  const durSec = Math.max(1, Math.round(durMs / 1000))
  const posSec = Math.round((p.positionMs ?? 0) / 1000)

  // Key change: if duration unknown, don’t “clamp against 1 second” and jump to the end.
  const safePos = durKnown ? clamp(posSec, 0, durSec) : 0

  const [scrubbing, setScrubbing] = React.useState(false)
  const [scrubSec, setScrubSec] = React.useState(0)

  // Reset scrub state when track changes (fixes first-play weirdness).
  React.useEffect(() => {
    setScrubbing(false)
    setScrubSec(0)
  }, [p.current?.id])

  React.useEffect(() => {
    if (!scrubbing) setScrubSec(safePos)
  }, [safePos, scrubbing])

  /* ---------------- Volume popup anchoring ---------------- */

  const [volOpen, setVolOpen] = React.useState(false)
  const vol = p.volume
  const muted = p.muted || p.volume <= 0.001
  const volBtnRef = React.useRef<HTMLButtonElement | null>(null)
  const [volAnchor, setVolAnchor] = React.useState<{x: number; y: number} | null>(null)

  React.useLayoutEffect(() => {
    if (!volOpen) {
      setVolAnchor(null)
      return
    }

    const el = volBtnRef.current
    if (!el) return

    const compute = () => {
      const r = el.getBoundingClientRect()
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

  const dock = (
    <div
      style={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255,255,255,0.10)',
      }}
    >
      <div style={{position: 'relative', width: '100%', display: 'grid', gap: 10}}>
        {/* TOP EDGE progress bar (full width) */}
        <div style={{position: 'absolute', left: 0, right: 0, top: 0}}>
          <input
            aria-label="Seek"
            type="range"
            min={0}
            max={durSec}
            disabled={!durKnown}
            value={scrubbing ? scrubSec : safePos}
            onPointerDown={() => setScrubbing(true)}
            onPointerUp={() => {
              setScrubbing(false)
              if (durKnown) p.seek(scrubSec * 1000)
            }}
            onPointerCancel={() => {
              setScrubbing(false)
            }}
            onChange={(e) => setScrubSec(Number(e.target.value))}
            style={{
              width: '100%',
              height: 18,
              margin: 0,
              background: 'transparent',
              WebkitAppearance: 'none',
              appearance: 'none',
              cursor: durKnown ? 'pointer' : 'default',
              opacity: durKnown ? 1 : 0.5,
            }}
          />
        </div>

        <style>{`
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
            background-color: rgba(245,245,245,0.95);
            border: 0;
            outline: none;
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.35),
              0 4px 10px rgba(0,0,0,0.25);
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
            background-color: rgba(245,245,245,0.95);
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.35),
              0 4px 10px rgba(0,0,0,0.25);
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
            <IconBtn label="Previous" onClick={() => p.prev()} disabled={!p.current}>
              <PrevIcon />
            </IconBtn>

            <IconBtn
              label={playingish ? 'Pause' : 'Play'}
              onClick={() => {
                if (playingish) {
                  window.dispatchEvent(new Event('af:pause-intent'))
                  p.pause()
                } else {
                  const t = p.current ?? p.queue[0]
                  if (!t) return
                  p.play(t)
                  window.dispatchEvent(new Event('af:play-intent'))
                }
              }}
              disabled={!p.current && p.queue.length === 0}
            >
              <PlayPauseIcon playing={playingish} />
            </IconBtn>

            <IconBtn label="Next" onClick={() => p.next()} disabled={!p.current}>
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
            <div style={{display: 'grid', justifyItems: 'center'}}>
              <IconBtn ref={volBtnRef} label="Volume" onClick={() => setVolOpen((v) => !v)} title="Volume">
                <VolumeIcon muted={muted} />
              </IconBtn>

              {volOpen && volAnchor
                ? createPortal(
                    <>
                      <div
                        style={{
                          position: 'fixed',
                          left: volAnchor.x,
                          top: volAnchor.y,
                          transform: 'translate(-50%, calc(-100% - 10px))',
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
                          zIndex: 99999,
                          overflow: 'visible',
                        }}
                      >
                        <div className="volWrap">
                          <input
                            className="volRot"
                            aria-label="Volume slider"
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={vol}
                            onChange={(e) => p.setVolume(Number(e.target.value))}
                          />
                        </div>
                      </div>

                      <style>{`
                        .volWrap{
                          width: 24px;
                          height: 140px;
                          position: relative;
                          display: grid;
                          place-items: center;
                          overflow: visible;
                        }
                        .volRot{
                          -webkit-appearance: none;
                          appearance: none;
                          width: 140px;
                          height: 24px;
                          margin: 0;
                          padding: 0;
                          background: transparent;
                          position: absolute;
                          left: 50%;
                          top: 50%;
                          transform: translate(-50%, -50%) rotate(-90deg);
                          transform-origin: center;
                          outline: none;
                        }
                        .volRot::-webkit-slider-runnable-track{
                          height: 6px;
                          border-radius: 999px;
                          background: rgba(255,255,255,0.22);
                        }
                        .volRot::-webkit-slider-thumb{
                          -webkit-appearance: none;
                          appearance: none;
                          width: 16px;
                          height: 16px;
                          border-radius: 999px;
                          margin-top: -5px;
                          background-color: rgba(245,245,245,0.95);
                          border: 0;
                          outline: none;
                          box-shadow:
                            0 0 0 1px rgba(0,0,0,0.35),
                            0 4px 10px rgba(0,0,0,0.35);
                        }
                        .volRot::-moz-range-track{
                          height: 6px;
                          border-radius: 999px;
                          background: rgba(255,255,255,0.22);
                        }
                        .volRot::-moz-range-thumb{
                          width: 16px;
                          height: 16px;
                          border: 0;
                          border-radius: 999px;
                          background-color: rgba(245,245,245,0.95);
                          box-shadow:
                            0 0 0 1px rgba(0,0,0,0.35),
                            0 4px 10px rgba(0,0,0,0.35);
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
    </div>
  )

  if (!mounted) return null
  return createPortal(dock, document.body)
}
