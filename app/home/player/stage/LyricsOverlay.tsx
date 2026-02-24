// web/app/home/player/stage/LyricsOverlay.tsx
"use client";

import React from "react";
import { mediaSurface } from "../mediaSurface";

export type LyricCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;
};

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function findActiveIndex(cues: LyricCue[], tMs: number) {
  let lo = 0;
  let hi = cues.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = cues[mid]?.tMs ?? 0;
    if (v <= tMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

export default function LyricsOverlay(props: {
  trackId?: string | null;
  cues: LyricCue[] | null;
  offsetMs?: number;
  onSeek?: (tMs: number) => void;
  variant?: "inline" | "stage";
  /** Reserve a footer zone (e.g. StageTransportBar height, excluding safe-area inset). */
  reservedBottomPx?: number;
}) {
  const {
    trackId: trackIdRaw = null,
    cues,
    offsetMs = 0,
    onSeek,
    variant = "stage",
    reservedBottomPx = 0,
  } = props;

  const trackId = (trackIdRaw ?? "").trim() || null;
  const isInline = variant === "inline";

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const rafTimeRef = React.useRef<number | null>(null);

  // Focus is DOM-driven (CSS vars) to avoid React re-renders during scroll.
  const focusRafRef = React.useRef<number | null>(null);
  const lastFocusCenterRef = React.useRef<number>(-1);

  const [activeIdx, setActiveIdx] = React.useState(-1);
  const activeIdxRef = React.useRef(-1);

  // When user scrolls manually, pause auto-follow briefly.
  const userScrollUntilRef = React.useRef<number>(0);

  // Prevent auto-follow from disabling itself: smooth scroll triggers onScroll too.
  const isAutoScrollingRef = React.useRef(false);
  const autoScrollClearRef = React.useRef<number | null>(null);

  const [hoverIdx, setHoverIdx] = React.useState<number>(-1);
  const [revealIdx, setRevealIdx] = React.useState<number>(-1);

  const pressTimerRef = React.useRef<number | null>(null);
  const pressFiredRef = React.useRef(false);
  const revealClearRef = React.useRef<number | null>(null);

  function clearPressTimer() {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function clearRevealTimer() {
    if (revealClearRef.current != null) {
      window.clearTimeout(revealClearRef.current);
      revealClearRef.current = null;
    }
  }

  function revealForTouch(idx: number) {
    setRevealIdx(idx);
    clearRevealTimer();
    // Auto-hide after a short window so it doesn’t linger forever on mobile.
    revealClearRef.current = window.setTimeout(() => {
      setRevealIdx((cur) => (cur === idx ? -1 : cur));
    }, 2200);
  }

  React.useEffect(() => {
    return () => {
      clearPressTimer();
      clearRevealTimer();
    };
  }, []);

  function emitOpenExegesis(cue: LyricCue) {
    if (!trackId) return;
    const detail: { trackId: string; lineKey: string; tMs: number } = {
      trackId,
      lineKey: cue.lineKey,
      tMs: cue.tMs,
    };
    window.dispatchEvent(new CustomEvent("af:open-exegesis", { detail }));
  }

  // Fade-in whenever a new lyrics set becomes available.
  const [fadeInKey, setFadeInKey] = React.useState(0);

  React.useEffect(() => {
    if (!cues || cues.length === 0) return;
    // bump key so CSS animation restarts on new cues
    setFadeInKey((k) => k + 1);
  }, [cues]);

  React.useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  // Reset on cue change.
  React.useEffect(() => {
    setActiveIdx(-1);
    setHoverIdx(-1);
    setRevealIdx(-1);
    activeIdxRef.current = -1;
    userScrollUntilRef.current = 0;
    lastFocusCenterRef.current = -1;
    isAutoScrollingRef.current = false;

    if (autoScrollClearRef.current)
      window.clearTimeout(autoScrollClearRef.current);
    autoScrollClearRef.current = null;

    const sc = scrollerRef.current;
    if (sc) sc.scrollTop = 0;
    if (sc) {
      const nodes = sc.querySelectorAll<HTMLElement>("[data-lyric-idx]");
      nodes.forEach((el) => el.style.removeProperty("--af-focus"));
    }
  }, [cues]);

  // RAF: compute active index from mediaSurface time
  React.useEffect(() => {
    if (!cues || cues.length === 0) return;

    const step = () => {
      const tMs = mediaSurface.getTimeMs() + offsetMs;
      const idx = findActiveIndex(cues, tMs);

      if (idx !== activeIdxRef.current) {
        activeIdxRef.current = idx;
        setActiveIdx(idx);
      }

      rafTimeRef.current = window.requestAnimationFrame(step);
    };

    rafTimeRef.current = window.requestAnimationFrame(step);
    return () => {
      if (rafTimeRef.current) window.cancelAnimationFrame(rafTimeRef.current);
      rafTimeRef.current = null;
    };
  }, [cues, offsetMs]);

  // Auto-follow: scroll active line into a nice reading position, unless user recently scrolled.
  React.useLayoutEffect(() => {
    if (!cues || cues.length === 0) return;
    if (activeIdx < 0) return;

    const now = Date.now();
    if (now < userScrollUntilRef.current) return;

    const sc = scrollerRef.current;
    const viewport = viewportRef.current;
    if (!sc || !viewport) return;

    const activeEl = sc.querySelector<HTMLElement>(
      `[data-lyric-idx="${activeIdx}"]`,
    );
    if (!activeEl) return;

    const vh = viewport.clientHeight;
    if (!vh || vh < 10) return;

    // Keep the reading line slightly above center so upcoming lines “arrive” into the hotspot.
    const targetY = activeEl.offsetTop + activeEl.offsetHeight / 2 - vh * 0.44;
    const nextTop = clamp(
      Math.round(targetY),
      0,
      Math.max(0, sc.scrollHeight - sc.clientHeight),
    );

    isAutoScrollingRef.current = true;
    sc.scrollTo({ top: nextTop, behavior: "smooth" });

    if (autoScrollClearRef.current)
      window.clearTimeout(autoScrollClearRef.current);
    autoScrollClearRef.current = window.setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 220);

    return () => {
      if (autoScrollClearRef.current)
        window.clearTimeout(autoScrollClearRef.current);
      autoScrollClearRef.current = null;
    };
  }, [cues, activeIdx]);

  // DOM focus compute: uses scrollTop/offsetTop (no getBoundingClientRect spam).
  const scheduleFocusCompute = React.useCallback(() => {
    if (focusRafRef.current != null) return;
    focusRafRef.current = window.requestAnimationFrame(() => {
      focusRafRef.current = null;
      const sc = scrollerRef.current;
      if (!sc) return;

      const center = sc.scrollTop + sc.clientHeight * 0.46;
      const falloff = Math.max(80, sc.clientHeight * (isInline ? 0.32 : 0.38));

      if (Math.abs(center - lastFocusCenterRef.current) < 0.5) return;
      lastFocusCenterRef.current = center;

      const nodes = sc.querySelectorAll<HTMLElement>("[data-lyric-idx]");
      nodes.forEach((el) => {
        const mid = el.offsetTop + el.offsetHeight / 2;
        const raw = 1 - Math.abs(mid - center) / falloff;
        const f = clamp(raw, 0, 1);
        el.style.setProperty("--af-focus", String(f));
      });
    });
  }, [isInline]);

  // Recompute focus on mount + resize + active changes (auto-follow moves).
  React.useLayoutEffect(() => {
    scheduleFocusCompute();
    const onResize = () => scheduleFocusCompute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scheduleFocusCompute]);

  React.useLayoutEffect(() => {
    scheduleFocusCompute();
  }, [activeIdx, scheduleFocusCompute]);

  if (!cues || cues.length === 0) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: 18,
          color: "rgba(255,255,255,0.82)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 14, fontWeight: 650, opacity: 0.95 }}>
            PLAY A TRACK
          </div>
        </div>
      </div>
    );
  }

  // Typography
  const lineFontSize = isInline
    ? "clamp(12px, 1.15vw, 14px)"
    : "clamp(18px, 2.2vw, 26px)";

  // Padding: keep breathing room so lines “emerge” into focus.
  const padTop = isInline ? 36 : 120;
  const padBottomBase = isInline ? 52 : 160;

  // Mask geometry: soften the fade "knee" to avoid horizon lines on Android.
  const fadeTopPx = isInline ? 22 : 72;
  const fadeBottomPx = isInline ? 26 : 86;
  const kneePx = isInline ? 10 : 22;

  // Spotlight geometry: centered around the reading zone, not the full panel.
  const spotlightCenterY = 46; // %
  const spotlightW = isInline ? 78 : 74; // %
  const spotlightH = isInline ? 40 : 44; // %

  // Reserve footer zone (StageTransportBar) + safe-area inset.
  // We implement this in padding and ALSO in the mask so content fades out before the controls.
  const styleVars: React.CSSProperties &
    Record<`--af-lyrics-${string}`, string> = {
    "--af-lyrics-reserved-bottom": `${Math.max(0, Math.floor(reservedBottomPx))}px`,
    "--af-lyrics-fade-top": `${fadeTopPx}px`,
    "--af-lyrics-fade-bottom": `${fadeBottomPx}px`,
    "--af-lyrics-knee": `${kneePx}px`,
  };
  const padBottom = `calc(${padBottomBase}px + var(--af-lyrics-reserved-bottom) + env(safe-area-inset-bottom, 0px))`;

  // The point where the mask should be fully transparent at the bottom (above the transport zone).
  // Everything below this is masked out.
  const bottomClip = `calc(100% - (var(--af-lyrics-reserved-bottom) + env(safe-area-inset-bottom, 0px)))`;

  // A "soft knee" mask: no sudden slope change = no visible line.
  const mask = isInline
    ? undefined
    : `linear-gradient(
        to bottom,
        rgba(255,255,255,0) 0px,
        rgba(255,255,255,0.60) calc(var(--af-lyrics-fade-top) - var(--af-lyrics-knee)),
        rgba(255,255,255,0.92) calc(var(--af-lyrics-fade-top) - 8px),
        rgba(255,255,255,1) var(--af-lyrics-fade-top),

        rgba(255,255,255,1) calc(${bottomClip} - var(--af-lyrics-fade-bottom)),
        rgba(255,255,255,0.92) calc(${bottomClip} - calc(var(--af-lyrics-fade-bottom) - 8px)),
        rgba(255,255,255,0.60) calc(${bottomClip} - calc(var(--af-lyrics-fade-bottom) - var(--af-lyrics-knee))),
        rgba(255,255,255,0) ${bottomClip}
      )`;

  return (
    <div
      key={fadeInKey}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        alignItems: "stretch",
        justifyItems: "stretch",
        padding: isInline ? 8 : 14,
        pointerEvents: "auto",
        ...styleVars,

        // fade-in when lyrics become available / change
        opacity: 0,
        animation: isInline
          ? "afLyricsFadeIn 380ms ease-out forwards"
          : "afLyricsFadeIn 520ms ease-out forwards",
      }}
    >
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "transparent",
          borderRadius: 0,
          border: 0,
          boxShadow: "none",
        }}
      >
        {/* Center spotlight scrim (global): dark in reading zone, transparent at edges. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
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
            if (!isAutoScrollingRef.current)
              userScrollUntilRef.current = Date.now() + 1400;
            scheduleFocusCompute();
          }}
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            padding: `${padTop}px 14px ${padBottom} 14px`,
            display: "grid",
            gap: isInline ? 5 : 9,
            zIndex: 1,

            // Hide scrollbars (FF/old Edge)
            scrollbarWidth: "none",
            msOverflowStyle: "none",

            // Apply the edge fade here (not in Stage wrappers)
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",

            // Encourage compositing to reduce banding/lines on Android
            transform: "translateZ(0)",
            willChange: isInline
              ? "transform"
              : "transform, -webkit-mask-image, mask-image",
          }}
        >
          {cues.map((cue, idx) => {
            const isActive = idx === activeIdx;

            const textShadow = isInline
              ? "0 1px 14px rgba(0,0,0,0.70), 0 0 24px rgba(0,0,0,0.35)"
              : "0 2px 22px rgba(0,0,0,0.78), 0 0 34px rgba(0,0,0,0.35)";

            const lh = isInline ? 1.25 : 1.22;
            const scrimInset = isInline ? "-6px -10px" : "-10px -16px";
            const scrimBgStage = "rgba(0,0,0,0.18)";
            const showDiscourse =
              isInline && (idx === hoverIdx || idx === revealIdx);

            return (
              <div
                key={`${cue.tMs}-${idx}`}
                data-lyric-idx={idx}
                className="af-lyric-row"
                data-af-inline={isInline ? "1" : "0"}
                data-af-has-track={trackId ? "1" : "0"}
                data-af-reveal={idx === revealIdx ? "1" : "0"}
                onMouseEnter={() => {
                  if (!isInline) return;
                  setHoverIdx(idx);
                }}
                onMouseLeave={() => {
                  if (!isInline) return;
                  setHoverIdx((cur) => (cur === idx ? -1 : cur));
                }}
                style={{
                  position: "relative",
                  width: "100%",
                  minWidth: 0,
                  display: "grid",
                  justifyItems: "center",
                  alignItems: "center",
                  paddingTop: isInline ? 2 : 4,
                  paddingBottom: isInline ? 2 : 4,
                }}
              >
                {/* Discourse icon (hover on desktop, long-press reveal on touch) */}
                <button
                  className="af-discourse-btn"
                  type="button"
                  aria-label="Open exegesis"
                  title="Discuss this line"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clearPressTimer();
                    clearRevealTimer();
                    setRevealIdx(-1);
                    emitOpenExegesis(cue);
                  }}
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "50%",
                    transform: `translateY(-50%) ${showDiscourse ? "scale(1)" : "scale(0.98)"}`,
                    width: isInline ? 26 : 30,
                    height: isInline ? 26 : 30,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(0,0,0,0.22)",
                    color: "rgba(255,255,255,0.86)",
                    placeItems: "center",
                    cursor: trackId ? "pointer" : "default",
                    pointerEvents: trackId ? "auto" : "none",

                    opacity: showDiscourse && trackId ? 1 : 0,
                    display: isInline ? "grid" : "none",
                    transition: "opacity 140ms ease, transform 140ms ease",
                  }}
                >
                  <span aria-hidden style={{ fontSize: isInline ? 14 : 15 }}>
                    💬
                  </span>
                </button>

                {/* The seek button (default interaction) */}
                <button
                  type="button"
                  onPointerDown={() => {
                    // Touch long-press reveals discourse icon (no seek) — INLINE ONLY
                    pressFiredRef.current = false;
                    clearPressTimer();

                    if (!isInline) return; // fullscreen/stage: no discourse affordance at all
                    if (!trackId) return;

                    pressTimerRef.current = window.setTimeout(() => {
                      pressFiredRef.current = true;
                      revealForTouch(idx);
                    }, 360);
                  }}
                  onPointerUp={() => {
                    clearPressTimer();
                  }}
                  onPointerCancel={() => {
                    clearPressTimer();
                  }}
                  onPointerLeave={() => {
                    clearPressTimer();
                  }}
                  onClick={() => {
                    // If long-press fired, swallow click so it doesn’t seek.
                    if (pressFiredRef.current) return;

                    if (!onSeek) return;
                    userScrollUntilRef.current = Date.now() + 900;
                    onSeek(cue.tMs);
                  }}
                  title={isInline ? cue.text : undefined}
                  style={{
                    border: 0,
                    background: "transparent",
                    padding: 0,

                    width: "100%",
                    minWidth: 0,
                    display: "grid",
                    justifyItems: "center",
                    alignItems: "center",

                    color: "rgba(255,255,255,0.94)",
                    fontSize: lineFontSize,
                    lineHeight: lh,
                    letterSpacing: 0.2,
                    textAlign: "center",

                    opacity:
                      activeIdx < 0
                        ? isInline
                          ? 0.6
                          : 0.5
                        : isActive
                          ? 1
                          : "calc(0.18 + var(--af-focus, 0) * 0.82)",

                    fontWeight: isActive
                      ? 780
                      : "calc(650 + var(--af-focus, 0) * 70)",

                    transition:
                      "opacity 120ms linear, transform 140ms ease, filter 140ms ease",
                    transform: isActive
                      ? `translateZ(0) scale(${isInline ? 1.012 : 1.02})`
                      : `translateZ(0)
                         translateY(calc((1 - var(--af-focus, 0)) * ${
                           isInline ? 0.25 : 0.55
                         }px))
                         scale(calc(1 + var(--af-focus, 0) * ${
                           isInline ? 0.012 : 0.02
                         }))`,

                    willChange: "transform, opacity",
                    cursor: onSeek ? "pointer" : "default",
                    userSelect: "none",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  <span
                    style={{
                      position: "relative",
                      display: "inline-block",
                      maxWidth: "100%",
                      minWidth: 0,
                      whiteSpace: "normal",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {/* Local per-line scrim (unchanged) */}
                    {isInline ? (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: scrimInset,
                          borderRadius: 999,
                          pointerEvents: "none",
                          background: `rgba(0,0,0, calc(0.08 + var(--af-focus, 0) * 0.26))`,
                          backdropFilter: "blur(10px)",
                          WebkitBackdropFilter: "blur(10px)",
                          WebkitMaskImage:
                            "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
                          maskImage:
                            "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
                          opacity: "calc(var(--af-focus, 0) * 0.98)",
                        }}
                      />
                    ) : isActive ? (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          inset: scrimInset,
                          borderRadius: 999,
                          pointerEvents: "none",
                          background: scrimBgStage,
                          WebkitMaskImage:
                            "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
                          maskImage:
                            "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
                          opacity: 0.95,
                        }}
                      />
                    ) : null}

                    <span
                      style={{
                        position: "relative",
                        zIndex: 1,
                        textShadow,
                        filter: "blur(calc((1 - var(--af-focus, 0)) * 0.15px))",
                      }}
                    >
                      {cue.text}
                    </span>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <style>{`
          @keyframes afLyricsFadeIn {
            from { opacity: 0; transform: translate3d(0, 6px, 0); filter: blur(1.5px); }
            to   { opacity: 1; transform: translate3d(0, 0, 0); filter: blur(0px); }
          }

          @media (prefers-reduced-motion: reduce) {
            @keyframes afLyricsFadeIn {
              from { opacity: 1; transform: none; filter: none; }
              to   { opacity: 1; transform: none; filter: none; }
            }
          }

          .af-lyrics-scroll::-webkit-scrollbar { width: 0px; height: 0px; }
          .af-lyrics-scroll::-webkit-scrollbar-thumb { background: transparent; }

                    /* Inline-only: reveal discourse affordance on hover even if React hover state misses. */
          .af-lyric-row[data-af-inline="1"][data-af-has-track="1"]:hover .af-discourse-btn {
            opacity: 1 !important;
            transform: translateY(-50%) scale(1) !important;
          }

          /* Touch reveal path: when we set revealIdx, make sure it shows regardless of hover. */
          .af-lyric-row[data-af-inline="1"][data-af-has-track="1"][data-af-reveal="1"] .af-discourse-btn {
            opacity: 1 !important;
            transform: translateY(-50%) scale(1) !important;
          }
        `}</style>
      </div>
    </div>
  );
}
