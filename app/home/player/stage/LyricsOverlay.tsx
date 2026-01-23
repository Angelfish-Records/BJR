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

  // Center-focus map (idx -> 0..1). Stored in ref to avoid re-render storms.
  const focusRafRef = React.useRef<number | null>(null)
  const [focusMap, setFocusMap] = React.useState<Record<number, number>>({})


  const [activeIdx, setActiveIdx] = React.useState(-1)
  const activeIdxRef = React.useRef(-1)

  // When user scrolls manually, pause auto-follow briefly.
  const userScrollUntilRef = React.useRef<number>(0)

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
    sc.scrollTo({top: nextTop, behavior: 'smooth'})
  }, [cues, activeIdx])

  // Compute “focus” (readability) based on distance to viewport center.
  const scheduleFocusCompute = React.useCallback(() => {
  if (focusRafRef.current != null) return
  focusRafRef.current = window.requestAnimationFrame(() => {
    focusRafRef.current = null
    const viewport = viewportRef.current
    const sc = scrollerRef.current
    if (!viewport || !sc) return

    const vr = viewport.getBoundingClientRect()
    const centerY = vr.top + vr.height * 0.46
    const falloff = Math.max(80, vr.height * (isInline ? 0.32 : 0.38))

    const next: Record<number, number> = {}
    const nodes = sc.querySelectorAll<HTMLElement>('[data-lyric-idx]')
    nodes.forEach((el) => {
      const idxStr = el.getAttribute('data-lyric-idx')
      const idx = idxStr ? parseInt(idxStr, 10) : NaN
      if (!Number.isFinite(idx)) return
      const r = el.getBoundingClientRect()
      const y = r.top + r.height / 2
      const dist = Math.abs(y - centerY)
      const raw = 1 - dist / falloff
      next[idx] = clamp(raw, 0, 1)
    })

    setFocusMap(next)
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

  // Padding/fades: keep some top/bottom breathing room so lines “emerge” into focus.
  const padTop = isInline ? 36 : 120
  const padBottom = isInline ? 52 : 160
  const topFadeH = isInline ? 36 : 110
  const botFadeH = isInline ? 44 : 130

  // Spotlight geometry: centered around the reading zone, not the full panel.
  const spotlightCenterY = isInline ? 46 : 46 // percent
  const spotlightW = isInline ? 78 : 74 // percent
  const spotlightH = isInline ? 40 : 44 // percent

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
      {/* No “container” look: this is just a transparent viewport boundary */}
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
        {/* Center spotlight scrim: dark in the reading zone, gone at edges (no box). */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            zIndex: 0,

            // Core dark-at-center spotlight.
            background: `radial-gradient(${spotlightW}% ${spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,${
              isInline ? 0.40 : 0.52
            }) 0%, rgba(0,0,0,0.20) 35%, rgba(0,0,0,0.00) 72%)`,

            // Optional “shape sharpening” so the hotspot feels localized (helps reduce overall occlusion).
            WebkitMaskImage: `radial-gradient(${spotlightW}% ${spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)`,
            maskImage: `radial-gradient(${spotlightW}% ${spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)`,
            opacity: 0.95,
          }}
        />

        <div
          ref={scrollerRef}
          className="af-lyrics-scroll"
          onScroll={() => {
            userScrollUntilRef.current = Date.now() + 1400
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

            // Center focus (0..1) based on distance from viewport center.
            const f = focusMap[idx] ?? 0

            // Active line always wins; nearby-center lines get most of the readability.
            const emphasis = clamp(Math.max(isActive ? 1 : 0, f), 0, 1)

            // Keep far lines visible but deliberately “less certain”.
            const base =
              activeIdx < 0
                ? isInline
                  ? 0.60
                  : 0.50
                : 0.18 + emphasis * 0.82

            const opacity = clamp(base, 0.12, 1)

            const textShadow = isInline
              ? '0 1px 14px rgba(0,0,0,0.70), 0 0 24px rgba(0,0,0,0.35)'
              : '0 2px 22px rgba(0,0,0,0.78), 0 0 34px rgba(0,0,0,0.35)'

            const lh = isInline ? 1.25 : 1.22

            // A tiny “pull” into the reading plane.
            const scale = 1 + emphasis * (isInline ? 0.012 : 0.02)
            const y = (1 - emphasis) * (isInline ? 0.25 : 0.55)

            // Local per-line scrim (only for lines that matter).
            const showScrim = emphasis > 0.55
            const scrimAlpha = (isInline ? 0.18 : 0.14) + emphasis * (isInline ? 0.18 : 0.26)
            const scrimBlur = isInline ? 8 + emphasis * 4 : 10 + emphasis * 6

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
                  fontWeight: isActive ? 780 : emphasis > 0.66 ? 720 : 650,
                  letterSpacing: 0.2,
                  textAlign: 'center',

                  opacity,
                  transition:
                    'opacity 140ms ease, transform 160ms ease, filter 160ms ease, font-weight 160ms ease',
                  transform: `translateZ(0) translateY(${y}px) scale(${scale})`,

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
                  {showScrim ? (
                    <span
                      aria-hidden
                      style={{
                        position: 'absolute',
                        inset: isInline ? '-6px -10px' : '-10px -16px',
                        borderRadius: 999,
                        pointerEvents: 'none',

                        background: `rgba(0,0,0,${clamp(scrimAlpha, 0, 0.55)})`,
                        backdropFilter: `blur(${Math.round(scrimBlur)}px)`,
                        WebkitBackdropFilter: `blur(${Math.round(scrimBlur)}px)`,

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
                      // Slightly soften far-away lines without making them ugly/illegible.
                      filter: emphasis < 0.25 ? 'blur(0.15px)' : 'none',
                    }}
                  >
                    {cue.text}
                  </span>
                </span>
              </button>
            )
          })}
        </div>

        {/* Edge fades: keep them, but don’t let them read like a “box”. */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: topFadeH,
            background: isInline
              ? 'linear-gradient(rgba(0,0,0,0.52), rgba(0,0,0,0.00))'
              : 'linear-gradient(rgba(0,0,0,0.62), rgba(0,0,0,0.00))',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: botFadeH,
            background: isInline
              ? 'linear-gradient(rgba(0,0,0,0.00), rgba(0,0,0,0.56))'
              : 'linear-gradient(rgba(0,0,0,0.00), rgba(0,0,0,0.66))',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        <style>{`
          /* Hide scrollbar (WebKit) reliably */
          .af-lyrics-scroll::-webkit-scrollbar { width: 0px; height: 0px; }
          .af-lyrics-scroll::-webkit-scrollbar-thumb { background: transparent; }
        `}</style>
      </div>
    </div>
  )
}
