// web/app/home/player/stage/LyricsOverlay.tsx
'use client'

import React from 'react'
import {mediaSurface} from '../mediaSurface'

export type LyricCue = {tMs: number; text: string; endMs?: number}

function findActiveIndex(cues: LyricCue[], tMs: number) {
  let lo = 0
  let hi = cues.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const v = cues[mid]?.tMs ?? 0
    if (v <= tMs) {
      best = mid
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  return best
}

export default function LyricsOverlay(props: {
  cues: LyricCue[] | null
  offsetMs?: number
  onSeek?: (tMs: number) => void
  variant?: 'inline' | 'stage'
}) {
  const {cues, offsetMs = 0, onSeek, variant = 'stage'} = props

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const rafRef = React.useRef<number | null>(null)

  const [activeIdx, setActiveIdx] = React.useState(-1)
  const activeIdxRef = React.useRef(-1)

  const userScrollUntilRef = React.useRef(0)

  const isInline = variant === 'inline'

  /* ---------------- Track active lyric ---------------- */

  React.useEffect(() => {
    if (!cues || cues.length === 0) return

    const step = () => {
      const tMs = mediaSurface.getTimeMs() + offsetMs
      const idx = findActiveIndex(cues, tMs)
      if (idx !== activeIdxRef.current) {
        activeIdxRef.current = idx
        setActiveIdx(idx)
      }
      rafRef.current = requestAnimationFrame(step)
    }

    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [cues, offsetMs])

  /* ---------------- Auto-follow ---------------- */

  React.useLayoutEffect(() => {
    if (!cues || activeIdx < 0) return
    if (Date.now() < userScrollUntilRef.current) return

    const sc = scrollerRef.current
    const vp = viewportRef.current
    if (!sc || !vp) return

    const el = sc.querySelector<HTMLElement>(`[data-lyric-idx="${activeIdx}"]`)
    if (!el) return

    const vh = vp.clientHeight
    const target =
      el.offsetTop + el.offsetHeight / 2 - vh * (isInline ? 0.35 : 0.4)

    sc.scrollTo({
      top: Math.max(0, target),
      behavior: 'smooth',
    })
  }, [activeIdx, cues, isInline])

  /* ---------------- Empty state ---------------- */

  if (!cues || cues.length === 0) {
    return null
  }

  /* ---------------- Typography ---------------- */

  const fontSize = isInline
    ? 'clamp(12px, 2.4vw, 15px)'
    : 'clamp(18px, 2.2vw, 26px)'

  const lineHeight = isInline ? '24px' : '34px'
  const padTop = isInline ? 96 : 150
  const padBottom = isInline ? 120 : 180

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        padding: 18,
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={viewportRef}
        style={{
          position: 'relative',
          width: '100%',
          height: isInline ? 'min(420px, 55vh)' : 'min(560px, 70vh)',
          overflow: 'hidden',
          borderRadius: 18,
          background: 'rgba(0,0,0,0.16)',
          border: '1px solid rgba(255,255,255,0.10)',
          backdropFilter: 'blur(10px)',
        }}
      >
        {/* Scroll container */}
        <div
          ref={scrollerRef}
          onScroll={() => {
            userScrollUntilRef.current = Date.now() + 1400
          }}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
            padding: `${padTop}px 20px ${padBottom}px`,
            display: 'grid',
            gap: isInline ? 10 : 12,

            /* hide scrollbars */
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {cues.map((cue, idx) => {
            const isActive = idx === activeIdx
            const dist = activeIdx >= 0 ? Math.abs(idx - activeIdx) : 999
            const opacity = isActive ? 1 : dist <= 1 ? 0.65 : dist <= 3 ? 0.4 : 0.22

            return (
              <button
                key={`${cue.tMs}-${idx}`}
                data-lyric-idx={idx}
                type="button"
                onClick={() => {
                  if (!onSeek) return
                  userScrollUntilRef.current = Date.now() + 900
                  onSeek(cue.tMs)
                }}
                style={{
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  textAlign: 'center',
                  cursor: onSeek ? 'pointer' : 'default',
                  color: 'rgba(255,255,255,0.92)',
                  fontSize,
                  lineHeight,
                  fontWeight: isActive ? 750 : 650,
                  opacity,
                  transition: 'opacity 140ms ease, transform 140ms ease',
                  transform: isActive ? 'scale(1.02)' : 'scale(1)',
                  whiteSpace: isInline ? 'nowrap' : 'normal',
                  overflow: isInline ? 'hidden' : 'visible',
                  textOverflow: isInline ? 'ellipsis' : 'clip',
                  userSelect: 'none',
                }}
                title={isInline ? cue.text : undefined}
              >
                {cue.text}
              </button>
            )
          })}
        </div>

        {/* fades */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: isInline ? 90 : 130,
            background: 'linear-gradient(rgba(0,0,0,0.75), transparent)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: isInline ? 110 : 160,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.78))',
            pointerEvents: 'none',
          }}
        />

        <style>{`
          /* WebKit scrollbar hide */
          div::-webkit-scrollbar { width: 0; height: 0; }
        `}</style>
      </div>
    </div>
  )
}
