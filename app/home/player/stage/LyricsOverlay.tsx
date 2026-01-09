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
  windowLines?: number // kept for API compatibility; no longer slices the list
}) {
  const {cues, offsetMs = 0, onSeek} = props

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const rafRef = React.useRef<number | null>(null)

  const [activeIdx, setActiveIdx] = React.useState(-1)
  const activeIdxRef = React.useRef(-1)

  // user-scroll suppression of auto-follow
  const userScrollingRef = React.useRef(false)
  const userScrollTimerRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    activeIdxRef.current = activeIdx
  }, [activeIdx])

  React.useEffect(() => {
    // reset when cues change
    setActiveIdx(-1)
    activeIdxRef.current = -1
    userScrollingRef.current = false
    if (userScrollTimerRef.current) window.clearTimeout(userScrollTimerRef.current)
    userScrollTimerRef.current = null
    const vp = viewportRef.current
    if (vp) vp.scrollTop = 0
  }, [cues])

  const markUserScrolling = React.useCallback(() => {
    userScrollingRef.current = true
    if (userScrollTimerRef.current) window.clearTimeout(userScrollTimerRef.current)
    userScrollTimerRef.current = window.setTimeout(() => {
      userScrollingRef.current = false
      userScrollTimerRef.current = null
    }, 1200)
  }, [])

  // RAF: compute active index from mediaSurface time
  React.useEffect(() => {
    if (!cues || cues.length === 0) return

    const step = () => {
      const tMs = mediaSurface.getTimeMs() + offsetMs
      const idx = findActiveIndex(cues, tMs)

      if (idx !== activeIdxRef.current) {
        activeIdxRef.current = idx
        setActiveIdx(idx)
      }

      rafRef.current = window.requestAnimationFrame(step)
    }

    rafRef.current = window.requestAnimationFrame(step)
    return () => {
      if (rafRef.current) window.cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
  }, [cues, offsetMs])

  // Auto-follow the active line (unless the user is scrolling)
  React.useLayoutEffect(() => {
    if (!cues || cues.length === 0) return
    if (activeIdx < 0) return
    if (userScrollingRef.current) return

    const vp = viewportRef.current
    if (!vp) return

    const activeEl = vp.querySelector<HTMLElement>(`[data-lyric-idx="${activeIdx}"]`)
    if (!activeEl) return

    const vpH = vp.clientHeight
    if (!vpH || vpH < 10) return

    // place active line at ~42% height
    const targetCenterY = vpH * 0.42
    const elCenterY = activeEl.offsetTop + activeEl.offsetHeight / 2
    const nextScrollTop = Math.max(0, elCenterY - targetCenterY)

    // avoid micro-jitter
    if (Math.abs(vp.scrollTop - nextScrollTop) < 2) return

    vp.scrollTo({top: Math.round(nextScrollTop), behavior: 'smooth'})
  }, [cues, activeIdx])

  if (!cues || cues.length === 0) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          padding: 18,
          color: 'rgba(255,255,255,0.82)',
          textAlign: 'center',
          pointerEvents: 'none',
        }}
      >
        <div style={{maxWidth: 520}}>
          <div style={{fontSize: 14, fontWeight: 650, opacity: 0.95}}>No lyrics yet</div>
          <div style={{fontSize: 12, opacity: 0.7, marginTop: 6}}>
            Wire cues from Sanity (or a sidecar) and this overlay will sync + allow click-to-seek.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        alignItems: 'center',
        justifyItems: 'stretch',
        padding: 18,
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={viewportRef}
        onScroll={markUserScrolling}
        onPointerDown={markUserScrolling}
        style={{
          position: 'relative',
          height: 'min(520px, 70vh)',
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',

          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(0,0,0,0.18)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(60% 40% at 50% 40%, rgba(255,255,255,0.10), rgba(0,0,0,0.00) 60%), linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.08) 30%, rgba(0,0,0,0.45))',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            padding: '180px 20px 180px 20px', // ✅ more top padding (fix #1)
            display: 'grid',
            gap: 10,
          }}
        >
          {cues.map((cue, idx) => {
            const isActive = idx === activeIdx
            const dist = activeIdx >= 0 ? Math.abs(idx - activeIdx) : 999
            const opacity = isActive ? 1 : dist <= 2 ? 0.65 : 0.33

            return (
              <button
                key={`${cue.tMs}-${idx}`}
                type="button"
                data-lyric-idx={idx}
                onClick={() => {
                  if (!onSeek) return
                  // clicking should feel immediate, and re-enable follow
                  userScrollingRef.current = false
                  onSeek(cue.tMs)
                }}
                style={{
                  textAlign: 'center',
                  background: 'transparent',
                  border: 0,
                  padding: '4px 0',
                  cursor: onSeek ? 'pointer' : 'default',

                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 'clamp(14px, 2.2vw, 20px)', // ✅ responsive (fix #3)
                  fontWeight: 650,
                  letterSpacing: 0.2,
                  lineHeight: 1.35,

                  // ✅ keep more lines visible; avoid wrapping in tight inline layouts (fix #3)
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',

                  opacity,
                  transform: isActive ? 'translateZ(0) scale(1.02)' : 'translateZ(0) scale(1)',
                  transition: 'opacity 120ms ease, transform 120ms ease',
                  userSelect: 'none',
                }}
              >
                {cue.text}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
