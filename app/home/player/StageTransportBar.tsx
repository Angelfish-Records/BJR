// web/app/home/player/StageTransportBar.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

/**
 * Keep this in sync with the paddingBottom we apply to the LyricsOverlay wrapper.
 * This is the “claimed footer zone” height (excluding safe-area inset).
 */
export const STAGE_TRANSPORT_FOOTER_PX = 140

const BTN = 72 // ~2x the old 44px
const ICON = 28

const IconBtn = React.forwardRef<
  HTMLButtonElement,
  {label: string; title?: string; onClick?: () => void; disabled?: boolean; children: React.ReactNode}
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
        width: BTN,
        height: BTN,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.16)',
        background: 'rgba(0,0,0,0.34)',
        color: 'rgba(255,255,255,0.94)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 0.95,
        userSelect: 'none',
        transform: 'translateZ(0)',
        boxShadow: '0 18px 50px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {children}
    </button>
  )
})

function PlayPauseIcon({playing}: {playing: boolean}) {
  return playing ? (
    <svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ) : (
    <svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  )
}
function PrevIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="2" height="12" />
      <polygon points="18,7 10,12 18,17" />
    </svg>
  )
}
function NextIcon() {
  return (
    <svg width={ICON} height={ICON} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="16" y="6" width="2" height="12" />
      <polygon points="6,7 14,12 6,17" />
    </svg>
  )
}

export default function StageTransportBar() {
  const p = usePlayer()

  const playingish = p.status === 'playing' || p.status === 'loading' || p.intent === 'play'

  const curId = p.current?.id ?? ''
  const idx = curId ? p.queue.findIndex((t) => t.id === curId) : -1
  const atStart = idx <= 0
  const atEnd = idx >= 0 && idx === p.queue.length - 1

  const [transportLock, setTransportLock] = React.useState(false)
  const lockFor = (ms: number) => {
    setTransportLock(true)
    window.setTimeout(() => setTransportLock(false), ms)
  }

  const prevDisabled = !p.current || transportLock || atStart
  const nextDisabled = !p.current || transportLock || atEnd
  const playDisabled = (!p.current && p.queue.length === 0) || transportLock

  return (
    <div
      data-af-stage-transport
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 8,

        // This is the “claimed footer zone” the lyrics should not occupy.
        height: `calc(${STAGE_TRANSPORT_FOOTER_PX}px + env(safe-area-inset-bottom, 0px))`,

        paddingLeft: `calc(14px + env(safe-area-inset-left, 0px))`,
        paddingRight: `calc(14px + env(safe-area-inset-right, 0px))`,
        paddingBottom: `calc(14px + env(safe-area-inset-bottom, 0px))`,
        paddingTop: 12,

        pointerEvents: 'none',
      }}
    >
      {/* smooth fade so the footer reads, but it’s not a “floating overlay” anymore */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          top: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.00), rgba(0,0,0,0.60))',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          pointerEvents: 'auto',
          height: '100%',
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          gap: 18,
        }}
      >
        <IconBtn
          label="Previous"
          onClick={() => {
            lockFor(320)
            window.dispatchEvent(new Event('af:play-intent'))
            p.prev()
          }}
          disabled={prevDisabled}
        >
          <PrevIcon />
        </IconBtn>

        <IconBtn
          label={playingish ? 'Pause' : 'Play'}
          onClick={() => {
            lockFor(180)
            if (playingish) {
              window.dispatchEvent(new Event('af:pause-intent'))
              p.setIntent('pause')
              p.pause()
            } else {
              const t = p.current ?? p.queue[0]
              if (!t) return
              window.dispatchEvent(new Event('af:play-intent'))
              p.setIntent('play')
              p.play(t)
            }
          }}
          disabled={playDisabled}
        >
          <PlayPauseIcon playing={playingish} />
        </IconBtn>

        <IconBtn
          label="Next"
          onClick={() => {
            lockFor(320)
            window.dispatchEvent(new Event('af:play-intent'))
            p.next()
          }}
          disabled={nextDisabled}
        >
          <NextIcon />
        </IconBtn>
      </div>
    </div>
  )
}
