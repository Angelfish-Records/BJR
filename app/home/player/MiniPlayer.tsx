// web/app/home/player/MiniPlayer.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "./PlayerState";
import type { PlayerTrack } from "@/lib/types";
import { buildShareTarget, performShare, type ShareTarget } from "@/lib/share";
import { PatternPillUnderlay } from "./VisualizerPattern";
import { useRouter } from "next/navigation";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function fmtTimeSec(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

const IconBtn = React.forwardRef<
  HTMLButtonElement,
  {
    label: string;
    title?: string;
    onClick?: () => void;
    disabled?: boolean;
    children: React.ReactNode;
  }
>(function IconBtn(props, ref) {
  const { label, title, onClick, disabled, children } = props;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className="afMpIconBtn"
      style={{
        width: "var(--af-mp-btn, 36px)",
        height: "var(--af-mp-btn, 36px)",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.05)",
        color: "rgba(255,255,255,0.92)",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.45 : 0.9,
        userSelect: "none",
        transform: "translateZ(0)",
        flex: "0 0 auto",
      }}
    >
      {children}
    </button>
  );
});

function PlayPauseIcon({ playing }: { playing: boolean }) {
  return playing ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="2" height="12" />
      <polygon points="18,7 10,12 18,17" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="16" y="6" width="2" height="12" />
      <polygon points="6,7 14,12 6,17" />
    </svg>
  );
}

function VolumeIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 7 8.5 9H6v6h2.5L11 17V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M16 9l5 5M21 9l-5 5" stroke="currentColor" strokeWidth="2" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M11 7 8.5 9H6v6h2.5L11 17V7Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 9.5c.9.9.9 4.1 0 5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17 7c2 2 2 8 0 10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 8a3 3 0 1 0-2.9-3.7A3 3 0 0 0 16 8Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M6 14a3 3 0 1 0-2.9-3.7A3 3 0 0 0 6 14Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M16 22a3 3 0 1 0-2.9-3.7A3 3 0 0 0 16 22Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M8.7 11.2l5-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M8.7 12.8l5 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M20 12a8 8 0 1 1-2.35-5.65"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M20 4v6h-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Local share UX */
function useShareUX() {
  const [fallback, setFallback] = React.useState<{
    url: string;
    title?: string;
  } | null>(null);
  const close = React.useCallback(() => setFallback(null), []);

  const shareTarget = React.useCallback(async (target: ShareTarget) => {
    const res = await performShare(target);
    if (!res.ok) setFallback({ url: res.url, title: target.title });
    return res;
  }, []);

  const fallbackModal =
    fallback && typeof document !== "undefined"
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share link"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) close();
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              display: "grid",
              placeItems: "center",
              zIndex: 100000,
              padding: 16,
            }}
          >
            <div
              style={{
                width: "min(520px, 100%)",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(10,10,10,0.85)",
                boxShadow: "0 18px 60px rgba(0,0,0,0.45)",
                padding: 14,
                color: "rgba(255,255,255,0.92)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 650,
                      opacity: 0.95,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {fallback.title ?? "Share link"}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7 }}>
                    Copy this URL
                  </div>
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Close"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.9)",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <input
                  readOnly
                  value={fallback.url}
                  onFocus={(e) => e.currentTarget.select()}
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    padding: "10px 12px",
                    color: "rgba(255,255,255,0.92)",
                    fontSize: 12,
                    outline: "none",
                  }}
                />

                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 10,
                  }}
                >
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (
                          typeof navigator !== "undefined" &&
                          navigator.clipboard?.writeText
                        ) {
                          await navigator.clipboard.writeText(fallback.url);
                        }
                      } catch {}
                    }}
                    style={{
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(245,245,245,0.92)",
                      color: "rgba(0,0,0,0.9)",
                      padding: "10px 12px",
                      fontSize: 12,
                      fontWeight: 650,
                      cursor: "pointer",
                    }}
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return { shareTarget, fallbackModal };
}

function findTrackById(
  queue: PlayerTrack[],
  id?: string | null,
): PlayerTrack | null {
  if (!id) return null;
  return queue.find((t) => t.id === id) ?? null;
}

export default function MiniPlayer(props: {
  onExpand?: () => void;
  artworkUrl?: string | null;
}) {
  const { onExpand, artworkUrl = null } = props;
  const p = usePlayer();
  const router = useRouter();

  const openPlayerToNowPlaying = () => {
    const slug = (p.queueContextSlug ?? "").trim();
    const tid = (p.current?.id ?? "").trim();

    if (slug && tid) {
      router.push(`/album/${encodeURIComponent(slug)}/track/${encodeURIComponent(tid)}`);
    } else if (slug) {
      router.push(`/album/${encodeURIComponent(slug)}`);
    } else {
      router.push("/player");
    }

    onExpand?.();
  };

  const { shareTarget, fallbackModal } = useShareUX();

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!mounted) return;
    if (typeof document === "undefined") return;

    const el = document.getElementById("af-mini-player");
    if (!el) return;

    let raf: number | null = null;
    let ro: ResizeObserver | null = null;

    const applyNow = () => {
      // don’t force layout reads while backgrounded
      if (document.hidden) return;
      const h = Math.ceil(el.getBoundingClientRect().height || 0);
      document.documentElement.style.setProperty(
        "--af-mini-player-h",
        `${h}px`,
      );
    };

    const schedule = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        applyNow();
      });
    };

    // prime once
    schedule();

    ro = new ResizeObserver(() => schedule());
    ro.observe(el);

    const onResize = () => schedule();
    window.addEventListener("resize", onResize, { passive: true });

    const onVis = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVis, { passive: true });

    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      raf = null;
      ro?.disconnect();
      ro = null;
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [mounted]);

  const playingish =
    p.status === "playing" || p.status === "loading" || p.intent === "play";

  // Pending-first display (truthy UI during transitions)
  const pendingTrack = findTrackById(p.queue, p.pendingTrackId) ?? null;
  const displayTrack = pendingTrack ?? p.current ?? null;

  const resolvedArtworkUrl = artworkUrl ?? p.queueContextArtworkUrl ?? null;

  /* ---------------- Small anti-doubletap locks ---------------- */

  const [transportLock, setTransportLock] = React.useState(false);
  const lockFor = (ms: number) => {
    setTransportLock(true);
    window.setTimeout(() => setTransportLock(false), ms);
  };

  const [playLock, setPlayLock] = React.useState(false);
  const lockPlayFor = (ms: number) => {
    setPlayLock(true);
    window.setTimeout(() => setPlayLock(false), ms);
  };

  /* ---------------- Seek (based on current track, not pending) ---------------- */

  const curId = p.current?.id ?? "";
  const durMs = Number(
    (p.durationById?.[curId] ?? p.current?.durationMs ?? 0) || 0,
  );
  const durKnown = durMs > 0;
  const durSec = Math.max(1, Math.round(durMs / 1000));

  const idx = curId ? p.queue.findIndex((t) => t.id === curId) : -1;
  const atStart = idx <= 0;
  const atEnd = idx >= 0 && idx === p.queue.length - 1;

  const prevDisabled = !p.current || transportLock || atStart;
  const nextDisabled = !p.current || transportLock || atEnd;

  const posSecReal = (p.positionMs ?? 0) / 1000;
  const safePosReal = durKnown ? clamp(posSecReal, 0, durSec) : 0;

  const pendingSec = p.pendingSeekMs != null ? p.pendingSeekMs / 1000 : null;
  const safePending =
    pendingSec != null && durKnown
      ? clamp(pendingSec, 0, durSec)
      : (pendingSec ?? undefined);

  const [scrubbing, setScrubbing] = React.useState(false);
  const [scrubSec, setScrubSec] = React.useState(0);

  React.useEffect(() => {
    setScrubbing(false);
    setScrubSec(0);
  }, [p.current?.id]);

  React.useEffect(() => {
    if (!scrubbing) setScrubSec(safePosReal);
  }, [safePosReal, scrubbing]);

  const sliderValue = scrubbing ? scrubSec : (safePending ?? safePosReal);

  /* ---------------- Seek tooltip ---------------- */

  const seekWrapRef = React.useRef<HTMLDivElement | null>(null);
  const [seekTip, setSeekTip] = React.useState<{
    open: boolean;
    sec: number;
    x: number;
    y: number;
  }>({
    open: false,
    sec: 0,
    x: 0,
    y: 0,
  });

  const computeSeekTipFromClientX = React.useCallback(
    (clientX: number, forceOpen: boolean) => {
      if (!durKnown) return;
      const wrap = seekWrapRef.current;
      if (!wrap) return;
      const r = wrap.getBoundingClientRect();
      const pct = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
      const sec = clamp(Math.round(pct * durSec), 0, durSec);
      const x = r.left + pct * r.width;
      const y = r.top;
      setSeekTip({ open: forceOpen, sec, x, y });
      if (scrubbing) setScrubSec(sec);
    },
    [durKnown, durSec, scrubbing],
  );

  const closeSeekTip = React.useCallback(() => {
    setSeekTip((s) => (s.open ? { ...s, open: false } : s));
  }, []);

  /* ---------------- Volume popup ---------------- */

  const [volOpen, setVolOpen] = React.useState(false);
  const vol = p.volume;
  const muted = p.muted || p.volume <= 0.001;

  const volPopupRef = React.useRef<HTMLDivElement | null>(null);

  const volBtnRef = React.useRef<HTMLButtonElement | null>(null);
  const [volAnchor, setVolAnchor] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    if (!volOpen) {
      setVolAnchor(null);
      return;
    }

    const el = volBtnRef.current;
    if (!el) return;

    let raf: number | null = null;

    const computeNow = () => {
      if (document.hidden) return;
      const r = el.getBoundingClientRect();
      setVolAnchor({ x: r.left + r.width / 2, y: r.top });
    };

    const schedule = () => {
      if (raf != null) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        computeNow();
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      const btn = volBtnRef.current;
      const popup = volPopupRef.current;
      if (!btn || !popup) return;

      const t = e.target as Node;
      if (btn.contains(t)) return;
      if (popup.contains(t)) return;

      setVolOpen(false);
    };

    // prime
    schedule();

    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", schedule, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", schedule, { passive: true });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) schedule();
    });

    return () => {
      if (raf != null) cancelAnimationFrame(raf);
      raf = null;

      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [volOpen]);

  /* ---------------- Copy ---------------- */

  const title = displayTrack?.title ?? displayTrack?.id ?? "Nothing queued";

  const statusLine = (() => {
    if (p.status === "blocked") return "Playback error";
    return displayTrack?.artist ?? "";
  })();

  /* ---------------- Share ---------------- */

  const onShare = async () => {
    const albumSlug = p.queueContextSlug;
    if (!albumSlug) return;
    if (typeof window === "undefined") return;

    const origin = window.location.origin;
    const albumTitle =
      (p.queueContextTitle ?? albumSlug).toString().trim() || albumSlug;
    const artistName =
      p.queueContextArtist ??
      ((displayTrack?.artist ?? "").toString().trim() || undefined);

    const cur = displayTrack;
    if (cur?.id) {
      const target = buildShareTarget({
        type: "track",
        methodHint: "sheet",
        origin,
        album: {
          slug: albumSlug,
          id: p.queueContextId,
          title: albumTitle,
          artistName,
        },
        track: {
          id: cur.id,
          title: (cur.title ?? cur.id).toString().trim() || cur.id,
        },
      });
      await shareTarget(target);
      return;
    }

    const target = buildShareTarget({
      type: "album",
      methodHint: "sheet",
      origin,
      album: {
        slug: albumSlug,
        id: p.queueContextId,
        title: albumTitle,
        artistName,
      },
    });
    await shareTarget(target);
  };

  /* ---------------- Layout constants ---------------- */

  const DOCK_H = 80;
  const TOP_BORDER = 1;
  const VIS_H = 3;
  const SEEK_H = 18;
  const SAFE_INSET = "env(safe-area-inset-bottom, 0px)";
  const SEEK_TOP = -((SEEK_H - VIS_H) / 2);

  const progressPct = durKnown ? (sliderValue / durSec) * 100 : 0;

  const shimmerMeta =
    // shimmer while loading (pending or current)
    (Boolean(p.pendingTrackId) && p.status === "loading") ||
    (p.status === "loading" && Boolean(p.current));

  const dock = (
    <div
      id="af-mini-player"
      data-af-miniplayer
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        display: "grid",
        gridTemplateRows: `var(--af-dock-h, ${DOCK_H}px) ${SAFE_INSET}`,
        height: `calc(var(--af-dock-h, ${DOCK_H}px) + ${SAFE_INSET})`,
        paddingTop: 0,
        paddingRight: 0,
        paddingLeft: 0,

        boxSizing: "border-box",
        maxWidth: "100vw",

        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        overflow: "visible",
      }}
    >
      <div
        data-af-band
        style={{ position: "relative", width: "100%", height: "100%" }}
      >
        {/* top textured rail */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: VIS_H,
            zIndex: 3,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(255,255,255,0.10)",
            }}
          />
          <PatternPillUnderlay active opacity={0.28} seed={1337} />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(255,255,255,0.04))",
              mixBlendMode: "screen",
              opacity: 0.55,
            }}
          />
        </div>

        {/* progress fill */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: VIS_H,
            width: `${progressPct}%`,
            zIndex: 4,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              background:
                "color-mix(in srgb, var(--accent) 45%, rgba(255,255,255,0.30))",
              opacity: 0.9,
            }}
          />
          <PatternPillUnderlay active opacity={0.55} seed={1337} />
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 1,
              background: "rgba(255,255,255,0.30)",
              opacity: 0.9,
            }}
          />
        </div>

        {/* seek hitbox */}
        <div
          ref={seekWrapRef}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: SEEK_TOP,
            height: SEEK_H,
            zIndex: 5,
          }}
          onMouseLeave={() => {
            if (!scrubbing) closeSeekTip();
          }}
        >
          <input
            aria-label="Seek"
            type="range"
            min={0}
            max={durSec}
            step={0.05}
            disabled={!durKnown}
            value={sliderValue}
            onPointerDown={(e) => {
              setScrubbing(true);
              computeSeekTipFromClientX(e.clientX, true);
            }}
            onPointerMove={(e) => {
              if (!durKnown) return;
              computeSeekTipFromClientX(e.clientX, true);
            }}
            onPointerUp={() => {
              setScrubbing(false);
              if (durKnown) p.seek(scrubSec * 1000);
              closeSeekTip();
            }}
            onPointerCancel={() => {
              setScrubbing(false);
              closeSeekTip();
            }}
            onMouseMove={(e) => {
              if (!durKnown) return;
              if (!scrubbing) computeSeekTipFromClientX(e.clientX, true);
            }}
            onChange={(e) => setScrubSec(Number(e.target.value))}
            style={{
              width: "100%",
              height: SEEK_H,
              margin: 0,
              padding: 0,
              background: "transparent",
              WebkitAppearance: "none",
              appearance: "none",
              cursor: durKnown ? "pointer" : "default",
              opacity: durKnown ? 1 : 0.5,
            }}
          />
        </div>

        {/* seek tooltip */}
        {seekTip.open && durKnown
          ? createPortal(
              <div
                style={{
                  position: "fixed",
                  left: seekTip.x,
                  top: seekTip.y,
                  transform: "translate(-50%, -28px)",
                  padding: "4px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(0,0,0,0.50)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  color: "rgba(255,255,255,0.92)",
                  fontSize: 11,
                  boxShadow: "0 14px 36px rgba(0,0,0,0.35)",
                  pointerEvents: "none",
                  whiteSpace: "nowrap",
                  zIndex: 100000,
                }}
              >
                {fmtTimeSec(seekTip.sec)}
              </div>,
              document.body,
            )
          : null}

        {/* Clip band */}
        <div
          data-af-clipband
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: TOP_BORDER,
            bottom: 0,
            overflow: "hidden",
            zIndex: 1,
          }}
        >
          {/* Artwork */}
          <div
            data-af-artwork
            aria-hidden="true"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `var(--af-dock-h, ${DOCK_H}px)`,
              background: resolvedArtworkUrl
                ? `url(${resolvedArtworkUrl}) center/cover no-repeat`
                : "rgba(255,255,255,0.06)",
              borderRadius: 0,
              borderRight: "1px solid rgba(255,255,255,0.10)",
              zIndex: 0,
            }}
          />

          {/* Controls / text */}
          <div
            data-af-controls
            style={{
              position: "relative",
              zIndex: 1,
              height: "100%",
              display: "grid",
              gridTemplateColumns:
                "var(--af-mp-cols, auto minmax(0, 1fr) auto)",
              alignItems: "center",
              gap: 12,
              paddingTop: 0,
              paddingBottom: 0,
              paddingLeft: `calc(var(--af-dock-h, ${DOCK_H}px) + 12px)`,
              paddingRight: 12,
            }}
          >
            <div
              data-af-transport
              style={{ display: "flex", alignItems: "center", gap: 10 }}
            >
              <IconBtn
                label="Previous"
                onClick={() => {
                  lockFor(350);
                  window.dispatchEvent(new Event("af:play-intent"));
                  p.prev();
                }}
                disabled={prevDisabled}
              >
                <PrevIcon />
              </IconBtn>

              <IconBtn
                label={playingish ? "Pause" : "Play"}
                onClick={() => {
                  lockPlayFor(120);
                  if (playingish) {
                    window.dispatchEvent(new Event("af:pause-intent"));
                    p.pause();
                  } else {
                    const t = p.current ?? p.queue[0];
                    if (!t) return;
                    p.play(t);
                    window.dispatchEvent(new Event("af:play-intent"));
                  }
                }}
                disabled={(!p.current && p.queue.length === 0) || playLock}
              >
                <PlayPauseIcon playing={playingish} />
              </IconBtn>

              <IconBtn
                label="Next"
                onClick={() => {
                  lockFor(350);
                  window.dispatchEvent(new Event("af:play-intent"));
                  p.next();
                }}
                disabled={nextDisabled}
              >
                <NextIcon />
              </IconBtn>
            </div>

            <div data-af-meta style={{ minWidth: 0 }}>
              <div
                onClick={onExpand ? openPlayerToNowPlaying : undefined}
                onKeyDown={(e) => {
                  if (!onExpand) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    openPlayerToNowPlaying();
                  }
                }}
                role={onExpand ? "button" : undefined}
                tabIndex={onExpand ? 0 : undefined}
                aria-label={onExpand ? "Open player" : undefined}
                className={shimmerMeta ? "afShimmerText" : undefined}
                data-reason={p.loadingReason ?? ""}
                style={{
                  fontSize: 13,
                  opacity: 0.92,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  lineHeight: 1.25,
                  transition: "opacity 160ms ease",
                  cursor: onExpand ? "pointer" : "default",
                }}
              >
                {title}
              </div>

              <div
                style={{
                  fontSize: 12,
                  opacity: 0.65,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {statusLine}
              </div>
            </div>

            <div
              data-af-actions
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                justifySelf: "end",
              }}
            >
              <div
                style={{
                  display: "grid",
                  justifyItems: "center",
                  position: "relative",
                }}
              >
                <IconBtn
                  ref={volBtnRef}
                  label="Volume"
                  onClick={() => setVolOpen((v) => !v)}
                  title="Volume"
                >
                  <VolumeIcon muted={muted} />
                </IconBtn>

                {volOpen && volAnchor
                  ? createPortal(
                      <>
                        <div
                          ref={volPopupRef}
                          style={{
                            position: "fixed",
                            left: volAnchor.x,
                            top: volAnchor.y,
                            transform: "translate(-50%, calc(-100% - 10px))",
                            width: 56,
                            height: 170,
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.12)",
                            background: "rgba(0,0,0,0.55)",
                            backdropFilter: "blur(10px)",
                            padding: 10,
                            boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
                            display: "grid",
                            placeItems: "center",
                            zIndex: 99999,
                            overflow: "visible",
                          }}
                        >
                          <div className="volWrap">
                            <input
                              className="volRot"
                              aria-label="Volume slider"
                              type="range"
                              min={0}
                              max={1}
                              step={0.01}
                              value={vol}
                              onChange={(e) => {
                                const next = Number(e.target.value);
                                p.setVolume(next);
                              }}
                            />
                          </div>
                        </div>

                        <style>{`
                          .volWrap{
                            width: 24px;
                            height: 140px;
                            position: relative;
                            display: grid;
                            place-items: center;
                            overflow: visible;
                          }
                          .volRot{
                            -webkit-appearance: none;
                            appearance: none;
                            width: 140px;
                            height: 24px;
                            margin: 0;
                            padding: 0;
                            background: transparent;
                            position: absolute;
                            left: 50%;
                            top: 50%;
                            transform: translate(-50%, -50%) rotate(-90deg);
                            transform-origin: center;
                            outline: none;
                          }
                          .volRot::-webkit-slider-runnable-track{
                            height: 6px;
                            border-radius: 999px;
                            background: rgba(255,255,255,0.22);
                          }
                          .volRot::-webkit-slider-thumb{
                            -webkit-appearance: none;
                            appearance: none;
                            width: 16px;
                            height: 16px;
                            border-radius: 999px;
                            margin-top: -5px;
                            background-color: rgba(245,245,245,0.95);
                            border: 0;
                            outline: none;
                            box-shadow:
                              0 0 0 1px rgba(0,0,0,0.35),
                              0 4px 10px rgba(0,0,0,0.35);
                          }
                          .volRot::-moz-range-track{
                            height: 6px;
                            border-radius: 999px;
                            background: rgba(255,255,255,0.22);
                          }
                          .volRot::-moz-range-thumb{
                            width: 16px;
                            height: 16px;
                            border: 0;
                            border-radius: 999px;
                            background-color: rgba(245,245,245,0.95);
                            box-shadow:
                              0 0 0 1px rgba(0,0,0,0.35),
                              0 4px 10px rgba(0,0,0,0.35);
                          }
                        `}</style>
                      </>,
                      document.body,
                    )
                  : null}
              </div>

              <IconBtn
                label="Share"
                title="Share"
                onClick={onShare}
                disabled={!p.queueContextSlug}
              >
                <ShareIcon />
              </IconBtn>

              {p.status === "blocked" || p.lastError ? (
                <IconBtn
                  label="Retry"
                  title="Retry"
                  onClick={() => {
                    window.dispatchEvent(new Event("af:play-intent"));
                    p.bumpReload();
                  }}
                >
                  <RetryIcon />
                </IconBtn>
              ) : null}
            </div>
          </div>
        </div>

        {/* Mobile compact mode + sizing vars */}
        <style>{`
          div[data-af-miniplayer]{
            --af-dock-h: ${DOCK_H}px;
            --af-mp-btn: 36px;
            --af-mp-cols: auto minmax(0, 1fr) auto;
          }

          @media (max-width: 520px) {
            div[data-af-miniplayer]{
              --af-dock-h: 64px;
              --af-mp-btn: 40px;
              --af-mp-cols: minmax(0, 1fr) auto;
              padding-right: 0px;
            }

            div[data-af-miniplayer] div[data-af-actions]{
              display: none !important;
              visibility: hidden !important;
            }

            div[data-af-miniplayer] div[data-af-controls]{
  column-gap: 10px;
  grid-template-rows: 1fr !important;
  grid-auto-flow: column !important;
  grid-auto-rows: 1fr !important;
  row-gap: 0 !important;

  /* symmetric: never bias the page */
  padding-left: 12px;
  padding-right: 12px;

  height: 100%;
  box-sizing: border-box;
}


            div[data-af-miniplayer] div[data-af-controls] > :nth-child(1){
              grid-column: 2;
              grid-row: 1;
              justify-self: end;
              align-self: center;
              display: flex;
              align-items: center;
              justify-content: flex-end;
              gap: 8px;
              flex-wrap: nowrap;
              flex: 0 0 auto;
              min-width: 0;
            }

            div[data-af-miniplayer] div[data-af-controls] > :nth-child(2){
              grid-column: 1;
              grid-row: 1;
              align-self: center;
              min-width: 0;
              overflow: hidden;
            }

            div[data-af-miniplayer] div[data-af-controls] > :nth-child(3){
              display: none !important;
              visibility: hidden !important;
            }

            div[data-af-miniplayer] div[data-af-controls] > :nth-child(2) *{
              min-width: 0;
              max-width: 100%;
            }

            div[data-af-miniplayer] div[data-af-controls] > :nth-child(2) > div{
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
              max-width: 100%;
            }

            div[data-af-miniplayer] div[data-af-controls] > :nth-child(2) > div:first-child{
              font-size: 12px !important;
              line-height: 1.15 !important;
            }
            div[data-af-miniplayer] div[data-af-controls] > :nth-child(2) > div:nth-child(2){
              font-size: 10px !important;
              line-height: 1.15 !important;
            }
          }
        `}</style>

        {/* Seek + shimmer */}
        <style>{`
          input[aria-label="Seek"]::-webkit-slider-runnable-track {
            height: ${VIS_H}px;
            background: transparent;
            border-radius: 0px;
          }
          input[aria-label="Seek"]::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 10px;
            height: 10px;
            border-radius: 999px;
            margin-top: -4.5px;
            background-color: rgba(245,245,245,0.95);
            border: 0;
            outline: none;
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.35),
              0 4px 10px rgba(0,0,0,0.25);
          }

          input[aria-label="Seek"]::-moz-range-track {
            height: ${VIS_H}px;
            background: transparent;
            border-radius: 0px;
          }
          input[aria-label="Seek"]::-moz-range-progress {
            height: ${VIS_H}px;
            background: transparent;
          }
          input[aria-label="Seek"]::-moz-range-thumb {
            width: 10px;
            height: 10px;
            border: 0;
            border-radius: 999px;
            background-color: rgba(245,245,245,0.95);
            box-shadow:
              0 0 0 1px rgba(0,0,0,0.35),
              0 4px 10px rgba(0,0,0,0.25);
          }

          @keyframes afShimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }

          .afShimmerText {
            background: linear-gradient(
              90deg,
              rgba(255,255,255,0.55) 0%,
              rgba(255,255,255,0.95) 45%,
              rgba(255,255,255,0.55) 100%
            );
            background-size: 200% 100%;
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent;
            animation: afShimmer 1.1s linear infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .afShimmerText { animation: none; color: rgba(255,255,255,0.92); background: none; }
          }
        `}</style>
      </div>

      <div aria-hidden="true" style={{ height: SAFE_INSET }} />
    </div>
  );

  if (!mounted) return null;
  return (
    <>
      {createPortal(dock, document.body)}
      {fallbackModal}
    </>
  );
}
