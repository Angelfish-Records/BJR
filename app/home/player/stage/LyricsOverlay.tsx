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
  // NEW: lets us tune typography + layout
  variant?: 'inline' | 'stage'
}) {
  const {cues, offsetMs = 0, onSeek, windowLines = 8, variant = 'stage'} = props

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const rafRef = React.useRef<number | null>(null)

  const [activeIdx, setActiveIdx] = React.useState(-1)
  const activeIdxRef = React.useRef(-1)

  // When user scrolls manually, pause auto-follow briefly.
  const userScrollUntilRef = React.useRef<number>(0)

  // Derived slice bounds (kept for perf if you want “windowing” later; currently we render all for free-scroll UX).
  const safeLen = cues?.length ?? 0
  const safeActive = activeIdx >= 0 ? activeIdx : 0
  const start = safeLen > 0 ? clamp(safeActive - windowLines, 0, safeLen - 1) : 0
  const end = safeLen > 0 ? clamp(safeActive + windowLines, 0, safeLen - 1) : 0
  void start
  void end

  React.useEffect(() => {
    activeIdxRef.current = activeIdx
  }, [activeIdx])

  // Reset on cue change.
  React.useEffect(() => {
    setActiveIdx(-1)
    activeIdxRef.current = -1
    userScrollUntilRef.current = 0
    const sc = scrollerRef.current
    if (sc) sc.scrollTop = 0
  }, [cues])

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

  // Auto-follow: scroll active line into a nice reading position, unless user recently scrolled.
  React.useLayoutEffect(() => {
    if (!cues || cues.length === 0) return
    if (activeIdx < 0) return

    const now = Date.now()
    if (now < userScrollUntilRef.current) return

    const sc = scrollerRef.current
    const viewport = viewportRef.current
    if (!sc || !viewport) return

    const activeEl = sc.querySelector<HTMLElement>(`[data-lyric-idx="${activeIdx}"]`)
    if (!activeEl) return

    const vh = viewport.clientHeight
    if (!vh || vh < 10) return

    // Place active line ~40% from top.
    const targetY = activeEl.offsetTop + activeEl.offsetHeight / 2 - vh * 0.40
    const nextTop = clamp(Math.round(targetY), 0, Math.max(0, sc.scrollHeight - sc.clientHeight))

    // Smooth when we can; jump if first time.
    sc.scrollTo({top: nextTop, behavior: 'smooth'})
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

  const isInline = variant === 'inline'

  // Typography: inline is genuinely smaller + tries not to wrap; stage can wrap.
  const lineFontSize = isInline ? 'clamp(13px, 2.6vw, 16px)' : 'clamp(18px, 2.2vw, 26px)'
  const lineHeight = isInline ? '26px' : '34px'

  // Padding: add top breathing room (your #1), and enough to scroll “past” the fades without hard edges (your #3).
  const padTop = isInline ? 86 : 140
  const padBottom = isInline ? 120 : 180

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
          height: isInline ? 'min(520px, 58vh)' : 'min(560px, 70vh)',
          overflow: 'hidden',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.10)',
          background: 'rgba(0,0,0,0.16)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
        }}
      >
        {/* base tint (kept subtle; fades below do the “edge softening” while scrolling) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'radial-gradient(60% 40% at 50% 40%, rgba(255,255,255,0.08), rgba(0,0,0,0.00) 60%)',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />

        {/* scroller (no visible scrollbars) */}
        <div
          ref={scrollerRef}
          onScroll={() => {
            // Pause auto-follow briefly when user scrolls.
            userScrollUntilRef.current = Date.now() + 1400
          }}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: `${padTop}px 20px ${padBottom}px 20px`,
            display: 'grid',
            gap: isInline ? 10 : 12,
            zIndex: 1,
            // hide scrollbar (Firefox)
            scrollbarWidth: 'none',
          }}
        >
          {cues.map((cue, idx) => {
            const isActive = idx === activeIdx

            // Distance-based fading (cheap, looks good)
            const dist = activeIdx >= 0 ? Math.abs(idx - activeIdx) : 999
            const opacity = isActive ? 1 : dist <= 1 ? 0.65 : dist <= 3 ? 0.40 : 0.22

            return (
              <button
                key={`${cue.tMs}-${idx}`}
                type="button"
                data-lyric-idx={idx}
                onClick={() => {
                  if (!onSeek) return
                  // If they click, we should stop auto-follow fighting them briefly.
                  userScrollUntilRef.current = Date.now() + 900
                  onSeek(cue.tMs)
                }}
                style={{
                  textAlign: 'center',
                  background: 'transparent',
                  border: 0,
                  padding: 0,
                  cursor: onSeek ? 'pointer' : 'default',
                  color: 'rgba(255,255,255,0.92)',
                  fontSize: lineFontSize,
                  fontWeight: isActive ? 750 : 650,
                  letterSpacing: 0.2,
                  lineHeight,
                  opacity,
                  transition: 'opacity 140ms ease, transform 140ms ease',
                  userSelect: 'none',
                  transform: isActive ? 'translateZ(0) scale(1.02)' : 'translateZ(0) scale(1)',
                  // Inline: try to avoid wrapping; show ellipsis instead.
                  whiteSpace: isInline ? 'nowrap' : 'normal',
                  overflow: isInline ? 'hidden' : 'visible',
                  textOverflow: isInline ? 'ellipsis' : 'clip',
                }}
                title={isInline ? cue.text : undefined}
              >
                {cue.text}
              </button>
            )
          })}
        </div>

        {/* top fade (prevents hard boundary while scrolling) */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: isInline ? 90 : 130,
            background: 'linear-gradient(rgba(0,0,0,0.75), rgba(0,0,0,0.00))',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        {/* bottom fade */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: isInline ? 110 : 160,
            background: 'linear-gradient(rgba(0,0,0,0.00), rgba(0,0,0,0.78))',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        <style>{`
          /* Hide scrollbar (WebKit) */
          div[style*="scrollbar-width: none"]::-webkit-scrollbar { width: 0px; height: 0px; }
          div[style*="scrollbar-width: none"]::-webkit-scrollbar-thumb { background: transparent; }
        `}</style>
      </div>
    </div>
  )
}
