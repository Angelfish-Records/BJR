// web/app/home/player/stage/StageOverlay.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "../PlayerState";
import { mediaSurface } from "../mediaSurface";
import LyricsOverlay from "./LyricsOverlay";
import type { LyricCue } from "@/lib/types";
import { useLyricsSnapshot } from "../lyrics/useLyricsSurface";
import StageTransportBar, {
  STAGE_TRANSPORT_FOOTER_PX,
} from "../StageTransportBar";

function useScrollLock(locked: boolean) {
  React.useEffect(() => {
    if (!locked) return;

    const y = window.scrollY;
    const body = document.body;

    const prevOverflow = body.style.overflow;
    const prevTransform = body.style.transform;

    body.style.overflow = "hidden";
    body.style.transform = `translateY(-${y}px)`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.transform = prevTransform;
      window.scrollTo(0, y);
    };
  }, [locked]);
}

type CuesByTrackId = Record<string, LyricCue[]>;
type OffsetByTrackId = Record<string, number>;

function pickKeyWithCues(
  cuesByTrackId: CuesByTrackId | undefined,
  keys: Array<string | null | undefined>,
) {
  if (!cuesByTrackId) return (keys.find(Boolean) as string | null) ?? null;
  for (const k of keys) {
    if (!k) continue;
    const xs = cuesByTrackId[k];
    if (Array.isArray(xs) && xs.length) return k;
  }
  return (keys.find(Boolean) as string | null) ?? null;
}

export default function StageOverlay(props: {
  open: boolean;
  onClose: () => void;
}) {
  const { open, onClose } = props;
  const p = usePlayer();
  const [mounted, setMounted] = React.useState(false);

  const snap = useLyricsSnapshot();

  const playerTrackId = p.current?.id ?? null;
  const playerMuxId = p.current?.muxPlaybackId ?? null;
  const surfaceTrackId = mediaSurface.getTrackId();

  const trackId = React.useMemo(() => {
    return pickKeyWithCues(snap.cuesByTrackId, [
      playerTrackId,
      surfaceTrackId,
      playerMuxId,
    ]);
  }, [snap.cuesByTrackId, playerTrackId, playerMuxId, surfaceTrackId]);

  const cues: LyricCue[] | null = React.useMemo(() => {
    if (!trackId) return null;
    const xs = snap.cuesByTrackId?.[trackId];
    return Array.isArray(xs) && xs.length ? xs : null;
  }, [snap.cuesByTrackId, trackId]);

  const trackOffsetMs = React.useMemo(() => {
    if (!trackId) return 0;
    const v = (snap.offsetByTrackId as OffsetByTrackId | undefined)?.[trackId];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }, [snap.offsetByTrackId, trackId]);

  const effectiveOffsetMs = trackOffsetMs + (snap.globalOffsetMs ?? 0);

  React.useEffect(() => setMounted(true), []);
  useScrollLock(open);

  React.useEffect(() => {
    if (!open) return;
    return mediaSurface.registerStage("fullscreen");
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
      void exitFsIfNeeded().finally(() => onClose());
    };

    const onFsChange = () => {
      // If fullscreen ends (often via ESC), close the overlay fully.
      if (!document.fullscreenElement) onClose();
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFsChange);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const title = p.current?.title ?? p.current?.id ?? "—";
  const artist = p.current?.artist ?? p.queueContextArtist ?? "";

  const node = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Stage"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100001,
        width: "100%",
        height: "100dvh",
        background: "rgba(0,0,0,0.88)",
        color: "rgba(255,255,255,0.92)",
        paddingTop: "env(safe-area-inset-top, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        overflow: "hidden",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* visual base layer (placeholder for WebGL) */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(800px 500px at 40% 30%, rgba(255,255,255,0.10), rgba(0,0,0,0.00) 65%), radial-gradient(700px 450px at 70% 70%, rgba(255,255,255,0.06), rgba(0,0,0,0.00) 60%), rgba(0,0,0,0.90)",
          filter: "saturate(1.05)",
        }}
      />

      {/* top bar */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 0,
          padding: "14px 14px 10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          pointerEvents: "auto",
          background: "linear-gradient(rgba(0,0,0,0.70), rgba(0,0,0,0.00))",
          zIndex: 5,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 12,
              opacity: 0.7,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {artist}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => {
              if (
                p.status === "playing" ||
                p.status === "loading" ||
                p.intent === "play"
              ) {
                p.setIntent("pause");
                window.dispatchEvent(new Event("af:pause-intent"));
                p.pause();
              } else {
                const t = p.current ?? p.queue[0];
                if (!t) return;
                p.setIntent("play");
                p.play(t);
                window.dispatchEvent(new Event("af:play-intent"));
              }
            }}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {p.status === "playing" ||
            p.status === "loading" ||
            p.intent === "play"
              ? "Pause"
              : "Play"}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.92)",
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      </div>

      {/* Lyrics layer (fade + reserved footer handled inside LyricsOverlay) */}
      <LyricsOverlay
        trackId={trackId}
        cues={cues}
        offsetMs={effectiveOffsetMs}
        variant="stage"
        reservedBottomPx={STAGE_TRANSPORT_FOOTER_PX}
        onSeek={(tMs) => {
          window.dispatchEvent(new Event("af:play-intent"));
          p.seek(tMs);
        }}
      />

      <StageTransportBar />
    </div>
  );

  return createPortal(node, document.body);
}
