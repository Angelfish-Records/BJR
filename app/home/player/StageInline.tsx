// web/app/home/player/StageInline.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'
import {usePlayer} from './PlayerState'
import StageCore from './StageCore'
import type {LyricCue} from './stage/LyricsOverlay'
import StageTransportBar from './StageTransportBar'

function lockBodyScroll(lock: boolean) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const body = document.body
  if (lock) {
    el.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
  } else {
    el.style.overflow = ''
    body.style.overflow = ''
    body.style.touchAction = ''
  }
}

type CuesByTrackId = Record<string, LyricCue[]>
type OffsetByTrackId = Record<string, number>

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`)
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener?.('change', apply)
    return () => mq.removeEventListener?.('change', apply)
  }, [breakpointPx])

  return isMobile
}

function IconFullscreen(props: {size?: number}) {
  const {size = 18} = props
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 4H5a1 1 0 0 0-1 1v3m0 8v3a1 1 0 0 0 1 1h3m8-16h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconClose(props: {size?: number}) {
  const {size = 18} = props
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function RoundIconButton(props: {
  label: string
  title?: string
  onClick: () => void
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
        width: 40,
        height: 40,
        borderRadius: 999,
        border: '1px solid rgba(255,255,255,0.14)',
        background: 'rgba(0,0,0,0.28)',
        color: 'rgba(255,255,255,0.92)',
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        boxShadow: '0 14px 30px rgba(0,0,0,0.22)',
      }}
    >
      {children}
    </button>
  )
}

export default function StageInline(props: {
  height?: number
  cuesByTrackId?: CuesByTrackId
  offsetByTrackId?: OffsetByTrackId
}) {
  const {height = 300, cuesByTrackId, offsetByTrackId} = props
  const p = usePlayer()

  const isMobile = useIsMobile(640)

  // Mobile-only: make it ~half height so it’s easier to scroll past.
  // Keep a floor so it doesn’t become comically short if someone passes a small height.
  const inlineHeight = isMobile ? Math.max(140, Math.round(height * 0.5)) : height

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    lockBodyScroll(open)
    return () => lockBodyScroll(false)
  }, [open])

  const tryRequestFullscreen = React.useCallback(async () => {
    if (typeof document === 'undefined') return
    const el = document.getElementById('af-stage-overlay')
    if (!el) return
    if (!('requestFullscreen' in el)) return

    const requestFullscreen = (el as Element).requestFullscreen
    if (typeof requestFullscreen !== 'function') return

    try {
      await requestFullscreen.call(el)
    } catch {
      // ignore; overlay is the baseline
    }
  }, [])

  const nothingPlaying = !p.current?.id

  const overlay =
    mounted && open
      ? createPortal(
          <div
            id="af-stage-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Stage"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false)
            }}
            style={{
              position: 'fixed',
              inset: 0,
              width: '100%',
              height: '100dvh',
              zIndex: 200000,
              background: 'rgba(0,0,0,0.80)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              padding: 0,
              display: 'grid',
            }}
          >
            <div style={{position: 'relative', width: '100%', height: '100%', minHeight: 0}}>
              <StageCore
                variant="fullscreen"
                cuesByTrackId={cuesByTrackId}
                offsetByTrackId={offsetByTrackId}
              />

              {/* Bottom transport */}
              <StageTransportBar />

              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 64,
                  background:
                    'linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.00))',
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  position: 'absolute',
                  top: `calc(10px + env(safe-area-inset-top, 0px))`,
                  right: `calc(10px + env(safe-area-inset-right, 0px))`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  pointerEvents: 'auto',
                }}
              >
                <RoundIconButton
                  label="Fullscreen"
                  title="Request fullscreen"
                  onClick={() => void tryRequestFullscreen()}
                >
                  <IconFullscreen />
                </RoundIconButton>

                <RoundIconButton label="Close" title="Close" onClick={() => setOpen(false)}>
                  <IconClose />
                </RoundIconButton>
              </div>
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      <div
        style={{
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.05)',
          overflow: 'hidden',
          height: inlineHeight,
          position: 'relative',
        }}
      >
        <div style={{position: 'absolute', inset: 0}}>
          <StageCore variant="inline" cuesByTrackId={cuesByTrackId} offsetByTrackId={offsetByTrackId} />
        </div>

        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: 56,
            background:
              'linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.00))',
            pointerEvents: 'none',
          }}
        />

        <div style={{position: 'absolute', top: 10, right: 10, pointerEvents: 'auto'}}>
          <RoundIconButton
            label="Open stage fullscreen"
            title={nothingPlaying ? 'Nothing playing' : 'Open fullscreen stage'}
            disabled={nothingPlaying}
            onClick={() => setOpen(true)}
          >
            <IconFullscreen />
          </RoundIconButton>
        </div>
      </div>

      {overlay}
    </>
  )
}
