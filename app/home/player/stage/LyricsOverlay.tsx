// web/app/home/player/stage/LyricsOverlay.tsx
'use client'

import React from 'react'
import {mediaSurface} from '../mediaSurface'

export type LyricCue = {tMs: number; text: string; endMs?: number}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

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
  windowLines?: number
}) {
  const {cues, offsetMs = 0, onSeek, windowLines = 8} = props

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const listRef = React.useRef<HTMLDivElement | null>(null)
  const rafRef = React.useRef<number | null>(null)

  const [activeIdx, setActiveIdx] = React.useState(-1)
  const activeIdxRef = React.useRef(-1)

  // Derived slice bounds MUST exist before hooks depend on them.
  const safeLen = cues?.length ?? 0
  const safeActive = activeIdx >= 0 ? activeIdx : 0
  const start = safeLen > 0 ? clamp(safeActive - windowLines, 0, safeLen - 1) : 0
  const end = safeLen > 0 ? clamp(safeActive + windowLines, 0, safeLen - 1) : 0

  React.useEffect(() => {
    activeIdxRef.current = activeIdx
  }, [activeIdx])

  // reset when cues change
  React.useEffect(() => {
    setActiveIdx(-1)
    activeIdxRef.current = -1
    const el = listRef.current
    if (el) el.style.transform = 'translate3d(0,0,0)'
  }, [cues])

  // Layout: reposition + style based on active index
  // IMPORTANT: this hook is unconditional (rules-of-hooks safe).
  React.useLayoutEffect(() => {
    if (!cues || cues.length === 0) return
    if (activeIdx < 0) return

    const list = listRef.current
    const viewport = viewportRef.current
    if (!list || !viewport) return

    // Only works if the active element exists in the current slice
    const activeEl = list.querySelector<HTMLElement>(`[data-lyric-idx="${activeIdx}"]`)
    if (!activeEl) return

    const vh = viewport.clientHeight
    if (!vh || vh < 10) return

    // Place active line at ~42% of the viewport height (slightly above center)
    const y = activeEl.offsetTop + activeEl.offsetHeight / 2
    const center = vh * 0.42
    const translateY = center - y
    list.style.transform = `translate3d(0, ${Math.round(translateY)}px, 0)`

    // Fade/scale neighbors
    const kids = list.querySelectorAll<HTMLElement>('[data-lyric-idx]')
    for (const k of kids) {
      const n = Number(k.dataset.lyricIdx)
      const dist = Math.abs(n - activeIdx)
      k.style.opacity = dist === 0 ? '1' : dist <= 2 ? '0.65' : '0.33'
      k.style.transform = dist === 0 ? 'translateZ(0) scale(1.02)' : 'translateZ(0) scale(1)'
    }
  }, [cues, activeIdx, start, end])

  // RAF: compute active index and update state only when it changes
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

  const slice = cues.slice(start, end + 1)

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
        style={{
          position: 'relative',
          height: 'min(520px, 70vh)',
          overflow: 'hidden',
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
          ref={listRef}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            willChange: 'transform',
            transform: 'translate3d(0,0,0)',
            padding: '140px 20px',
            display: 'grid',
            gap: 10,
          }}
        >
          {slice.map((cue, j) => {
            const idx = start + j
            return (
              <button
                key={`${cue.tMs}-${idx}`}
                type="button"
                data-lyric-idx={idx}
                onClick={() => onSeek?.(cue.tMs)}
                style={{
                  textAlign: 'center',
                  background: 'transparent',
                  border: 0,
                  padding: '4px 0',
                  cursor: onSeek ? 'pointer' : 'default',
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: 18,
                  fontWeight: 650,
                  letterSpacing: 0.2,
                  lineHeight: '34px',
                  opacity: 0.33,
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
