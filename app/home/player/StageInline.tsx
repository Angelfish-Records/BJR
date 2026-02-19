// web/app/home/player/StageInline.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "./PlayerState";
import StageCore from "./StageCore";
import type { LyricCue } from "./stage/LyricsOverlay";

function lockBodyScroll(lock: boolean) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const body = document.body;
  if (lock) {
    el.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
  } else {
    el.style.overflow = "";
    body.style.overflow = "";
    body.style.touchAction = "";
  }
}

export type CuesByTrackId = Record<string, LyricCue[]>;
export type OffsetByTrackId = Record<string, number>;

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [breakpointPx]);

  return isMobile;
}

function IconFullscreen(props: { size?: number }) {
  const { size = 18 } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 4H5a1 1 0 0 0-1 1v3m0 8v3a1 1 0 0 0 1 1h3m8-16h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose(props: { size?: number }) {
  const { size = 18 } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function RoundIconButton(props: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { label, title, onClick, disabled, children } = props;
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
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(0,0,0,0.28)",
        color: "rgba(255,255,255,0.92)",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        boxShadow: "0 14px 30px rgba(0,0,0,0.22)",
      }}
    >
      {children}
    </button>
  );
}

async function fetchLyricsByTrackId(
  trackId: string,
  signal?: AbortSignal,
): Promise<{ trackId: string; cues: LyricCue[]; offsetMs: number } | null> {
  const res = await fetch(
    `/api/lyrics/by-track?trackId=${encodeURIComponent(trackId)}`,
    { signal, cache: "no-store" },
  );
  if (!res.ok) return null;

  const raw: unknown = await res.json();

  if (!raw || typeof raw !== "object") return null;
  if (!("ok" in raw) || (raw as { ok?: unknown }).ok !== true) return null;
  if (
    !("trackId" in raw) ||
    typeof (raw as { trackId?: unknown }).trackId !== "string"
  )
    return null;
  if (!("cues" in raw) || !Array.isArray((raw as { cues?: unknown }).cues))
    return null;
  if (
    !("offsetMs" in raw) ||
    typeof (raw as { offsetMs?: unknown }).offsetMs !== "number" ||
    !Number.isFinite((raw as { offsetMs?: unknown }).offsetMs as number)
  )
    return null;

  const obj = raw as {
    trackId: string;
    cues: unknown[];
    offsetMs: number;
  };

  // Validate cues shape (minimal, but safe)
  const cues: LyricCue[] = obj.cues
    .map((c): LyricCue | null => {
      if (!c || typeof c !== "object") return null;

      const tMs = (c as { tMs?: unknown }).tMs;
      const text = (c as { text?: unknown }).text;
      const endMs = (c as { endMs?: unknown }).endMs;

      if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0)
        return null;
      if (typeof text !== "string" || text.trim().length === 0) return null;

      const out: LyricCue = { tMs: Math.floor(tMs), text: text.trim() };
      if (typeof endMs === "number" && Number.isFinite(endMs) && endMs >= 0) {
        out.endMs = Math.floor(endMs);
      }
      return out;
    })
    .filter((x): x is LyricCue => x !== null);

  return {
    trackId: obj.trackId,
    cues,
    offsetMs: Math.floor(obj.offsetMs),
  };
}

export default function StageInline(props: {
  height?: number;
  cuesByTrackId?: CuesByTrackId;
  offsetByTrackId?: OffsetByTrackId;
}) {
  const { height = 300, cuesByTrackId, offsetByTrackId } = props;
  const p = usePlayer();

  // Local cache that can extend beyond the SSR album bundle.
  const [cuesMap, setCuesMap] = React.useState<CuesByTrackId>(
    () => cuesByTrackId ?? {},
  );
  const [offsetMap, setOffsetMap] = React.useState<OffsetByTrackId>(
    () => offsetByTrackId ?? {},
  );

  // If the SSR-provided bundle changes (e.g. hard nav to a different album), merge it in.
  React.useEffect(() => {
    if (cuesByTrackId) {
      setCuesMap((prev) => ({ ...prev, ...cuesByTrackId }));
    }
  }, [cuesByTrackId]);

  React.useEffect(() => {
    if (offsetByTrackId) {
      setOffsetMap((prev) => ({ ...prev, ...offsetByTrackId }));
    }
  }, [offsetByTrackId]);

  // Lazy-load lyrics for the currently playing track when missing.
  const currentTrackId = p.current?.id ?? null;

  React.useEffect(() => {
    if (!currentTrackId) return;

    const existing = cuesMap[currentTrackId];
    if (Array.isArray(existing) && existing.length) return;

    const ac = new AbortController();

    (async () => {
      const r = await fetchLyricsByTrackId(currentTrackId, ac.signal);
      if (!r) return;

      // Only commit if still relevant; also commit immutably to force React updates.
      if (r.trackId !== currentTrackId) return;

      if (Array.isArray(r.cues) && r.cues.length) {
        setCuesMap((prev) => ({ ...prev, [currentTrackId]: r.cues }));
      } else {
        // Optional: cache "no lyrics" to avoid refetch loops.
        setCuesMap((prev) =>
          prev[currentTrackId] ? prev : { ...prev, [currentTrackId]: [] },
        );
      }

      if (typeof r.offsetMs === "number" && Number.isFinite(r.offsetMs)) {
        setOffsetMap((prev) => ({ ...prev, [currentTrackId]: r.offsetMs }));
      }
    })().catch(() => {
      // ignore
    });

    return () => ac.abort();
    // Intentionally *not* depending on cuesMap object identity to avoid refetch loops;
    // we only care about currentTrackId changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTrackId]);

  const isMobile = useIsMobile(640);
  const inlineHeight = isMobile
    ? Math.max(140, Math.round(height * 0.5))
    : height;

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    lockBodyScroll(open);
    return () => lockBodyScroll(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (typeof document === "undefined") return;

    const exitFsIfNeeded = async () => {
      try {
        if (
          document.fullscreenElement &&
          typeof document.exitFullscreen === "function"
        ) {
          await document.exitFullscreen();
        }
      } catch {
        // ignore
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      void exitFsIfNeeded().finally(() => setOpen(false));
    };

    const onFsChange = () => {
      if (!document.fullscreenElement) setOpen(false);
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [open]);

  const tryRequestFullscreen = React.useCallback(async () => {
    if (typeof document === "undefined") return;
    const el = document.getElementById("af-stage-overlay");
    if (!el) return;
    if (!("requestFullscreen" in el)) return;
    const requestFullscreen = (el as Element).requestFullscreen;
    if (typeof requestFullscreen !== "function") return;
    try {
      await requestFullscreen.call(el);
    } catch {
      // ignore
    }
  }, []);

  const nothingPlaying = p.queue.length === 0 && !p.current?.id;

  const overlay =
    mounted && open
      ? createPortal(
          <div
            id="af-stage-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Stage"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              width: "100%",
              height: "100dvh",
              zIndex: 200000,
              background: "rgba(0,0,0,0.80)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              padding: 0,
              display: "grid",
            }}
          >
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                minHeight: 0,
              }}
            >
              <StageCore
                variant="fullscreen"
                cuesByTrackId={cuesMap}
                offsetByTrackId={offsetMap}
              />

              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  top: 0,
                  height: 64,
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.00))",
                  pointerEvents: "none",
                }}
              />

              <div
                style={{
                  position: "absolute",
                  top: `calc(10px + env(safe-area-inset-top, 0px))`,
                  right: `calc(10px + env(safe-area-inset-right, 0px))`,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  pointerEvents: "auto",
                }}
              >
                <RoundIconButton
                  label="Fullscreen"
                  title="Request fullscreen"
                  onClick={() => void tryRequestFullscreen()}
                >
                  <IconFullscreen />
                </RoundIconButton>

                <RoundIconButton
                  label="Close"
                  title="Close"
                  onClick={() => setOpen(false)}
                >
                  <IconClose />
                </RoundIconButton>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
          height: inlineHeight,
          position: "relative",
        }}
      >
        <div style={{ position: "absolute", inset: 0 }}>
          <StageCore
            variant="inline"
            cuesByTrackId={cuesMap}
            offsetByTrackId={offsetMap}
          />
        </div>

        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 56,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.00))",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            pointerEvents: "auto",
          }}
        >
          <RoundIconButton
            label="Open stage fullscreen"
            title={nothingPlaying ? "Nothing playing" : "Open fullscreen stage"}
            disabled={nothingPlaying}
            onClick={() => setOpen(true)}
          >
            <IconFullscreen />
          </RoundIconButton>
        </div>
      </div>

      {overlay}
    </>
  );
}
