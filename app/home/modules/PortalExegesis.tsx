// web/app/home/modules/PortalExegesis.tsx
"use client";

import React from "react";
import { usePlayer } from "@/app/home/player/PlayerState";
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

function buildLyricsFromSurface(
  trackId: string,
  snap: ReturnType<typeof useLyricsSnapshot>,
): ExegesisLyricsOk | null {
  const cues = snap.cuesByTrackId[trackId];
  if (!Array.isArray(cues)) return null;

  // We treat "known empty array" as "lyrics known, but none".
  // Exegesis can decide how to render that.
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

function pickDefaultTrackId(p: ReturnType<typeof usePlayer>): string | null {
  // Prefer explicit current, then pending, then first queue item.
  const cur = (p.current?.id ?? "").trim();
  if (cur) return cur;

  const first = (p.queue?.[0]?.id ?? "").trim();
  if (first) return first;

  return null;
}

export default function PortalExegesis(props: {
  title?: string;
  // If true, always follow current track. If false, allow user to pin a track.
  followPlayer?: boolean;
  initialTrackId?: string | null;
}) {
  const {
    title = "Exegesis",
    followPlayer = true,
    initialTrackId = null,
  } = props;
  const p = usePlayer();
  const snap = useLyricsSnapshot();

  const [pinnedTrackId, setPinnedTrackId] = React.useState<string | null>(
    initialTrackId?.trim() || null,
  );

  const effectiveTrackId = React.useMemo(() => {
    if (followPlayer) return pickDefaultTrackId(p);
    return pinnedTrackId?.trim() || pickDefaultTrackId(p);
  }, [followPlayer, pinnedTrackId, p]);

  const [lyrics, setLyrics] = React.useState<ExegesisLyricsOk | null>(null);
  const [err, setErr] = React.useState<string>("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const tid = (effectiveTrackId ?? "").trim();
    if (!tid) {
      setLyrics(null);
      setErr("No track selected yet.");
      setLoading(false);
      return;
    }

    setErr("");
    setLoading(true);

    // Kick the fetch (deduped/cached inside ensureLyricsForTrack).
    void ensureLyricsForTrack(tid)
      .catch(() => {
        // We don’t set error here yet; we’ll fall back to a timeout-like UI below.
      })
      .finally(() => {
        // Don’t end loading here; we end loading when snapshot resolves (below).
      });

    // If surface already has it, commit immediately.
    const immediate = buildLyricsFromSurface(tid, lyricsSurface.getSnapshot());
    if (immediate) {
      setLyrics(immediate);
      setErr("");
      setLoading(false);
      return;
    }

    // Otherwise: wait for snapshot to update via dependency below.
    // (No AbortController needed; ensureLyricsForTrack handles cancellation/dedupe.)
  }, [effectiveTrackId]); // intentionally not depending on snap

  React.useEffect(() => {
    const tid = (effectiveTrackId ?? "").trim();
    if (!tid) return;

    const next = buildLyricsFromSurface(tid, snap);
    if (!next) return;

    setLyrics(next);
    setErr("");
    setLoading(false);
  }, [effectiveTrackId, snap]);

  const queue = p.queue ?? [];
  const allowPin = !followPlayer;

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginTop: 2,
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 800, opacity: 0.92 }}>
          {title}
        </div>

        {allowPin && queue.length > 0 ? (
          <div style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
            <div style={{ fontSize: 12, opacity: 0.6 }}>Track</div>
            <select
              value={effectiveTrackId ?? ""}
              onChange={(e) => setPinnedTrackId(e.target.value)}
              style={{
                height: 28,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.035)",
                color: "rgba(255,255,255,0.86)",
                padding: "0 10px",
                fontSize: 12,
                fontWeight: 700,
                outline: "none",
                cursor: "pointer",
              }}
            >
              {queue.map((t) => (
                <option key={t.id} value={t.id}>
                  {(t.title ?? t.id).toString()}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{ fontSize: 12, opacity: 0.6 }}>
            {followPlayer ? "Following player" : "Pinned"}
          </div>
        )}
      </div>

      {loading ? (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
          Loading…
        </div>
      ) : err ? (
        <div style={{ marginTop: 10, fontSize: 13, opacity: 0.78 }}>{err}</div>
      ) : lyrics ? (
        // IMPORTANT: ExegesisTrackClient is already a self-contained “thread + editor + voting + reporting” UI.
        // We embed it here so it behaves exactly the same as the canonical /exegesis/:trackId page.
        <ExegesisTrackClient
          trackId={lyrics.trackId}
          lyrics={lyrics}
          canonicalPath={`/exegesis/${encodeURIComponent(lyrics.trackId)}`}
        />
      ) : null}
    </div>
  );
}
