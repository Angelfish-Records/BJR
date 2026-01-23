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
  variant?: 'inline' | 'stage'
}) {
  const {cues, offsetMs = 0, onSeek, variant = 'stage'} = props
  const isInline = variant === 'inline'

  const viewportRef = React.useRef<HTMLDivElement | null>(null)
  const scrollerRef = React.useRef<HTMLDivElement | null>(null)
  const rafTimeRef = React.useRef<number | null>(null)

  // Focus is DOM-driven (CSS vars) to avoid React re-renders during scroll.
  const focusRafRef = React.useRef<number | null>(null)
  const lastFocusCenterRef = React.useRef<number>(-1)

  const [activeIdx, setActiveIdx] = React.useState(-1)
  const activeIdxRef = React.useRef(-1)

  // When user scrolls manually, pause auto-follow briefly.
  const userScrollUntilRef = React.useRef<number>(0)

  // Prevent auto-follow from disabling itself: smooth scroll triggers onScroll too.
  const isAutoScrollingRef = React.useRef(false)
  const autoScrollClearRef = React.useRef<number | null>(null)

  React.useEffect(() => {
    activeIdxRef.current = activeIdx
  }, [activeIdx])

  // Reset on cue change.
  React.useEffect(() => {
    setActiveIdx(-1)
    activeIdxRef.current = -1
    userScrollUntilRef.current = 0
    lastFocusCenterRef.current = -1
    isAutoScrollingRef.current = false

    if (autoScrollClearRef.current) window.clearTimeout(autoScrollClearRef.current)
    autoScrollClearRef.current = null

    const sc = scrollerRef.current
    if (sc) sc.scrollTop = 0
    if (sc) {
      const nodes = sc.querySelectorAll<HTMLElement>('[data-lyric-idx]')
      nodes.forEach((el) => el.style.removeProperty('--af-focus'))
    }
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

      rafTimeRef.current = window.requestAnimationFrame(step)
    }

    rafTimeRef.current = window.requestAnimationFrame(step)
    return () => {
      if (rafTimeRef.current) window.cancelAnimationFrame(rafTimeRef.current)
      rafTimeRef.current = null
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

    // Keep the reading line slightly above center so upcoming lines “arrive” into the hotspot.
    const targetY = activeEl.offsetTop + activeEl.offsetHeight / 2 - vh * 0.44
    const nextTop = clamp(Math.round(targetY), 0, Math.max(0, sc.scrollHeight - sc.clientHeight))

    // Mark this as programmatic scroll so onScroll doesn't pause auto-follow.
    isAutoScrollingRef.current = true
    sc.scrollTo({top: nextTop, behavior: 'smooth'})

    if (autoScrollClearRef.current) window.clearTimeout(autoScrollClearRef.current)
    autoScrollClearRef.current = window.setTimeout(() => {
      isAutoScrollingRef.current = false
    }, 220)

    return () => {
      if (autoScrollClearRef.current) window.clearTimeout(autoScrollClearRef.current)
      autoScrollClearRef.current = null
    }
  }, [cues, activeIdx])

  // DOM focus compute: uses scrollTop/offsetTop (no getBoundingClientRect spam).
  const scheduleFocusCompute = React.useCallback(() => {
    if (focusRafRef.current != null) return
    focusRafRef.current = window.requestAnimationFrame(() => {
      focusRafRef.current = null
      const sc = scrollerRef.current
      if (!sc) return

      const center = sc.scrollTop + sc.clientHeight * 0.46
      const falloff = Math.max(80, sc.clientHeight * (isInline ? 0.32 : 0.38))

      if (Math.abs(center - lastFocusCenterRef.current) < 0.5) return
      lastFocusCenterRef.current = center

      const nodes = sc.querySelectorAll<HTMLElement>('[data-lyric-idx]')
      nodes.forEach((el) => {
        const mid = el.offsetTop + el.offsetHeight / 2
        const raw = 1 - Math.abs(mid - center) / falloff
        const f = clamp(raw, 0, 1)
        el.style.setProperty('--af-focus', String(f))
      })
    })
  }, [isInline])

  // Recompute focus on mount + resize + active changes (auto-follow moves).
  React.useLayoutEffect(() => {
    scheduleFocusCompute()
    const onResize = () => scheduleFocusCompute()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [scheduleFocusCompute])

  React.useLayoutEffect(() => {
    scheduleFocusCompute()
  }, [activeIdx, scheduleFocusCompute])

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

  // Typography
  const lineFontSize = isInline ? 'clamp(12px, 1.15vw, 14px)' : 'clamp(18px, 2.2vw, 26px)'

  // Padding: keep breathing room so lines “emerge” into focus.
  const padTop = isInline ? 36 : 120
  const padBottom = isInline ? 52 : 160

  // Spotlight geometry: centered around the reading zone, not the full panel.
  const spotlightCenterY = 46 // %
  const spotlightW = isInline ? 78 : 74 // %
  const spotlightH = isInline ? 40 : 44 // %

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        alignItems: 'stretch',
        justifyItems: 'stretch',
        padding: isInline ? 8 : 14,
        pointerEvents: 'auto',
      }}
    >
      <div
        ref={viewportRef}
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          background: 'transparent',
          borderRadius: 0,
          border: 0,
          boxShadow: 'none',
        }}
      >
        {/* Center spotlight scrim (global): dark in reading zone, transparent at edges. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 0,
            background: `radial-gradient(${spotlightW}% ${spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,${
              isInline ? 0.4 : 0.52
            }) 0%, rgba(0,0,0,0.20) 35%, rgba(0,0,0,0.00) 72%)`,
            WebkitMaskImage: `radial-gradient(${spotlightW}% ${spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)`,
            maskImage: `radial-gradient(${spotlightW}% ${spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)`,
            opacity: 0.95,
          }}
        />

        <div
          ref={scrollerRef}
          className="af-lyrics-scroll"
          onScroll={() => {
            // Only manual scroll should pause auto-follow.
            if (!isAutoScrollingRef.current) {
              userScrollUntilRef.current = Date.now() + 1400
            }
            scheduleFocusCompute()
          }}
          style={{
            position: 'absolute',
            inset: 0,
            overflowY: 'auto',
            overflowX: 'hidden',
            WebkitOverflowScrolling: 'touch',
            padding: `${padTop}px 14px ${padBottom}px 14px`,
            display: 'grid',
            gap: isInline ? 5 : 9,
            zIndex: 1,

            // Firefox
            scrollbarWidth: 'none',
            // IE/old Edge
            msOverflowStyle: 'none',
          }}
        >
          {cues.map((cue, idx) => {
            const isActive = idx === activeIdx

            const textShadow = isInline
              ? '0 1px 14px rgba(0,0,0,0.70), 0 0 24px rgba(0,0,0,0.35)'
              : '0 2px 22px rgba(0,0,0,0.78), 0 0 34px rgba(0,0,0,0.35)'

            const lh = isInline ? 1.25 : 1.22

            const scrimInset = isInline ? '-6px -10px' : '-10px -16px'
            const scrimBgStage = 'rgba(0,0,0,0.18)'

            return (
              <button
                key={`${cue.tMs}-${idx}`}
                type="button"
                data-lyric-idx={idx}
                onClick={() => {
                  if (!onSeek) return
                  userScrollUntilRef.current = Date.now() + 900
                  onSeek(cue.tMs)
                }}
                title={isInline ? cue.text : undefined}
                style={{
                  border: 0,
                  background: 'transparent',
                  padding: 0,

                  width: '100%',
                  minWidth: 0,
                  display: 'grid',
                  justifyItems: 'center',
                  alignItems: 'center',

                  paddingTop: isInline ? 2 : 4,
                  paddingBottom: isInline ? 2 : 4,

                  color: 'rgba(255,255,255,0.94)',
                  fontSize: lineFontSize,
                  lineHeight: lh,
                  letterSpacing: 0.2,
                  textAlign: 'center',

                  opacity:
                    activeIdx < 0
                      ? isInline
                        ? 0.6
                        : 0.5
                      : isActive
                        ? 1
                        : 'calc(0.18 + var(--af-focus, 0) * 0.82)',

                  fontWeight: isActive ? 780 : 'calc(650 + var(--af-focus, 0) * 70)',

                  transition: 'opacity 120ms linear, transform 140ms ease, filter 140ms ease',
                  transform: isActive
                    ? `translateZ(0) scale(${isInline ? 1.012 : 1.02})`
                    : `translateZ(0)
                       translateY(calc((1 - var(--af-focus, 0)) * ${isInline ? 0.25 : 0.55}px))
                       scale(calc(1 + var(--af-focus, 0) * ${isInline ? 0.012 : 0.02}))`,

                  willChange: 'transform, opacity',
                  cursor: onSeek ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
              >
                <span
                  style={{
                    position: 'relative',
                    display: 'inline-block',
                    maxWidth: '100%',
                    minWidth: 0,
                    whiteSpace: 'normal',
                    overflowWrap: 'anywhere',
                    wordBreak: 'break-word',
                  }}
                >
                  {/* Local per-line scrim */}
                  {isInline ? (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: scrimInset,
                        borderRadius: 999,
                        pointerEvents: 'none',
                        background: `rgba(0,0,0, calc(0.08 + var(--af-focus, 0) * 0.26))`,
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        WebkitMaskImage:
                          'radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                        maskImage:
                          'radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                        opacity: 'calc(var(--af-focus, 0) * 0.98)',
                      }}
                    />
                  ) : isActive ? (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: scrimInset,
                        borderRadius: 999,
                        pointerEvents: 'none',
                        background: scrimBgStage,
                        backdropFilter: 'none',
                        WebkitBackdropFilter: 'none',
                        WebkitMaskImage:
                          'radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                        maskImage:
                          'radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)',
                        opacity: 0.95,
                      }}
                    />
                  ) : null}

                  <span
                    style={{
                      position: 'relative',
                      zIndex: 1,
                      textShadow,
                      filter: 'blur(calc((1 - var(--af-focus, 0)) * 0.15px))',
                    }}
                  >
                    {cue.text}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        <style>{`
          /* Hide scrollbar (WebKit) reliably */
          .af-lyrics-scroll::-webkit-scrollbar { width: 0px; height: 0px; }
          .af-lyrics-scroll::-webkit-scrollbar-thumb { background: transparent; }
        `}</style>
      </div>
    </div>
  )
}
