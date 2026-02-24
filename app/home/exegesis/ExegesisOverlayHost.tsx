// web/app/home/exegesis/ExegesisOverlayHost.tsx
"use client";

import React from "react";
import ExegesisTrackClient from "@/app/(site)/exegesis/[trackId]/ExegesisTrackClient";
import { useLyricsSnapshot } from "@/app/home/player/lyrics/useLyricsSurface";
import { lyricsSurface } from "@/app/home/player/lyrics/lyricsSurface";
import { ensureLyricsForTrack } from "@/app/home/player/lyrics/ensureLyricsForTrack";
import type { LyricCue } from "@/app/home/player/stage/LyricsOverlay";

type ExegesisLyricsOk = {
  ok: true;
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricCue[];
};

type OpenDetail = { trackId: string; lineKey: string; tMs: number };

function buildLyricsFromSnapshot(
  trackId: string,
  snap: ReturnType<typeof useLyricsSnapshot>,
): ExegesisLyricsOk | null {
  const cues = snap.cuesByTrackId[trackId];
  if (!Array.isArray(cues)) return null;

  const offsetMsRaw = snap.offsetByTrackId[trackId];
  const offsetMs =
    typeof offsetMsRaw === "number" && Number.isFinite(offsetMsRaw)
      ? offsetMsRaw
      : 0;

  return {
    ok: true,
    trackId,
    offsetMs,
    version: "unknown",
    geniusUrl: null,
    cues,
  };
}

function buildCanonicalUrl(trackId: string, lineKey: string): string {
  const base = `/exegesis/${encodeURIComponent(trackId)}`;
  const sp = new URLSearchParams();
  if (lineKey) sp.set("l", lineKey);
  const h = sp.toString();
  return h ? `${base}#${h}` : base;
}

export default function ExegesisOverlayHost() {
  const snap = useLyricsSnapshot();

  const [open, setOpen] = React.useState<OpenDetail | null>(null);
  const [lyrics, setLyrics] = React.useState<ExegesisLyricsOk | null>(null);
  const [err, setErr] = React.useState<string>("");
  const [busy, setBusy] = React.useState<boolean>(false);

  const prevUrlRef = React.useRef<string>("");

  const close = React.useCallback(() => {
    setOpen(null);
    setLyrics(null);
    setErr("");
    setBusy(false);

    const prev = prevUrlRef.current;
    if (prev) {
      try {
        window.history.replaceState(null, "", prev);
      } catch {
        // ignore
      }
      prevUrlRef.current = "";
    }
  }, []);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [open, close]);

  React.useEffect(() => {
    const onOpen = (ev: Event) => {
      const e = ev as CustomEvent<OpenDetail>;
      const tid = (e.detail?.trackId ?? "").trim();
      const lk = (e.detail?.lineKey ?? "").trim();
      const tms = e.detail?.tMs ?? 0;

      if (!tid || !lk) return;

      // Save current URL once per open.
      if (!prevUrlRef.current) {
        prevUrlRef.current =
          window.location.pathname + window.location.search + window.location.hash;
      }

      const url = buildCanonicalUrl(tid, lk);
      try {
        window.history.pushState(null, "", url);
      } catch {
        // ignore
      }

      setOpen({ trackId: tid, lineKey: lk, tMs: tms });
    };

    window.addEventListener("af:open-exegesis", onOpen as EventListener);
    return () =>
      window.removeEventListener("af:open-exegesis", onOpen as EventListener);
  }, []);

  React.useEffect(() => {
    const tid = (open?.trackId ?? "").trim();
    if (!tid) return;

    // Fast path: already in surface snapshot
    const immediate = buildLyricsFromSnapshot(tid, lyricsSurface.getSnapshot());
    if (immediate) {
      setLyrics(immediate);
      setErr("");
      setBusy(false);
      return;
    }

    setBusy(true);
    setErr("");

    void ensureLyricsForTrack(tid)
      .catch(() => {
        // We'll fall back to snapshot-driven resolution; if it never arrives,
        // the user sees an error message via a secondary effect below.
      })
      .finally(() => {
        // Busy clears when snapshot resolves (below).
      });
  }, [open?.trackId]);

  React.useEffect(() => {
    const tid = (open?.trackId ?? "").trim();
    if (!tid) return;

    const next = buildLyricsFromSnapshot(tid, snap);
    if (!next) return;

    setLyrics(next);
    setErr("");
    setBusy(false);
  }, [open?.trackId, snap]);

  // If we’re open + busy too long, show a gentle error (no timers needed; just a second pass).
  React.useEffect(() => {
    if (!open) return;
    if (!busy) return;
    const t = window.setTimeout(() => {
      setErr((prev) => prev || "Loading lyrics…");
    }, 450);
    return () => window.clearTimeout(t);
  }, [open, busy]);

  if (!open) return null;

  const canonicalPath = `/exegesis/${encodeURIComponent(open.trackId)}`;

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 65000,
          background: "rgba(0,0,0,0.40)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
        onClick={() => close()}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Exegesis"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 66000,
          padding: "min(6vh, 44px) 14px",
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "min(1100px, 96vw)",
            height: "min(86vh, 980px)",
            borderRadius: 22,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,10,14,0.92)",
            boxShadow:
              "0 28px 80px rgba(0,0,0,0.60), 0 60px 160px rgba(0,0,0,0.75)",
            overflow: "hidden",
            pointerEvents: "auto",
            display: "grid",
            gridTemplateRows: "auto 1fr",
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            style={{
              padding: "12px 12px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              borderBottom: "1px solid rgba(255,255,255,0.10)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.12))",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  opacity: 0.65,
                }}
              >
                EXEGESIS
              </div>
              <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.92 }}>
                {open.trackId}
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ fontSize: 12, opacity: 0.65 }}>
                Line: <span style={{ opacity: 0.92 }}>{open.lineKey}</span>
              </div>
              <button
                type="button"
                onClick={() => close()}
                aria-label="Close exegesis"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.06)",
                  color: "rgba(255,255,255,0.88)",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  lineHeight: 1,
                  fontSize: 18,
                  userSelect: "none",
                }}
              >
                ×
              </button>
            </div>
          </div>

          <div style={{ minHeight: 0, overflow: "auto" }}>
            {err && !lyrics ? (
              <div style={{ padding: 16, fontSize: 13, opacity: 0.8 }}>{err}</div>
            ) : busy && !lyrics ? (
              <div style={{ padding: 16, fontSize: 13, opacity: 0.75 }}>
                Loading…
              </div>
            ) : lyrics ? (
              <ExegesisTrackClient
                trackId={lyrics.trackId}
                lyrics={lyrics}
                canonicalPath={canonicalPath}
              />
            ) : null}
          </div>
        </div>
      </div>
    </>
  );
}