// web/app/home/player/StageTransportBar.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

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
        width: 44,
        height: 44,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.28)',
        color: 'rgba(255,255,255,0.92)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 0.92,
        userSelect: 'none',
        transform: 'translateZ(0)',
      }}
    >
      {children}
    </button>
  )
})

function PlayPauseIcon({playing}: {playing: boolean}) {
  return playing ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  )
}
function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="6" y="6" width="2" height="12" />
      <polygon points="18,7 10,12 18,17" />
    </svg>
  )
}
function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="16" y="6" width="2" height="12" />
      <polygon points="6,7 14,12 6,17" />
    </svg>
  )
}

export default function StageTransportBar(props: {
  /** extra bottom inset (e.g. if you want more clearance above safe-area) */
  bottomPadPx?: number
}) {
  const {bottomPadPx = 10} = props
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
        paddingLeft: `calc(12px + env(safe-area-inset-left, 0px))`,
        paddingRight: `calc(12px + env(safe-area-inset-right, 0px))`,
        paddingBottom: `calc(${bottomPadPx}px + env(safe-area-inset-bottom, 0px))`,
        paddingTop: 12,
        pointerEvents: 'none',
      }}
    >
      {/* soft gradient so the buttons read over lyrics */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 120,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.00), rgba(0,0,0,0.55))',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          pointerEvents: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        <IconBtn
          label="Previous"
          onClick={() => {
            lockFor(300)
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
            lockFor(160)
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
            lockFor(300)
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
