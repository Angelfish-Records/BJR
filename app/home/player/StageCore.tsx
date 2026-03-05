// web/app/home/player/StageCore.tsx
"use client";

import React from "react";
import { usePlayer } from "./PlayerState";
import VisualizerCanvas from "./VisualizerCanvas";
import LyricsOverlay from "./stage/LyricsOverlay";
import type { LyricCue } from "@/lib/types";
import StageTransportBar, {
  STAGE_TRANSPORT_FOOTER_PX,
} from "./StageTransportBar";
import { mediaSurface } from "./mediaSurface";
import { useLyricsSnapshot } from "./lyrics/useLyricsSurface";

type CuesByRecordingId = Record<string, LyricCue[]>;
type OffsetByRecordingId = Record<string, number>;

function pickKeyWithCues(
  cuesByRecordingId: CuesByRecordingId | undefined,
  keys: Array<string | null | undefined>,
) {
  if (!cuesByRecordingId) return (keys.find(Boolean) as string | null) ?? null;
  for (const k of keys) {
    if (!k) continue;
    const xs = cuesByRecordingId[k];
    if (Array.isArray(xs) && xs.length) return k;
  }
  return (keys.find(Boolean) as string | null) ?? null;
}

export default function StageCore(props: {
  variant: "inline" | "fullscreen";
  cuesByRecordingId?: CuesByRecordingId;
  offsetByRecordingId?: OffsetByRecordingId;
  offsetMs?: number;
  autoResumeOnSeek?: boolean;
  lyricsMode?: "embedded" | "none";
}) {
  const {
    variant,
    cuesByRecordingId: cuesByRecordingIdProp,
    offsetByRecordingId: offsetByRecordingIdProp,
    offsetMs: globalOffsetMs = 0,
    autoResumeOnSeek = false,
    lyricsMode = "embedded",
  } = props;

  const p = usePlayer();
  const snap = useLyricsSnapshot();

  // ✅ prefer props when provided; otherwise use lyricsSurface
  const cuesByRecordingId = cuesByRecordingIdProp ?? snap.cuesByRecordingId;
  const offsetByRecordingId = offsetByRecordingIdProp ?? snap.offsetByRecordingId;

  // Register stage presence; fullscreen wins if it exists.
  React.useEffect(() => mediaSurface.registerStage(variant), [variant]);

  const [surfaceRecordingId, setSurfaceRecordingId] = React.useState<string | null>(
    () => mediaSurface.getRecordingId(),
  );

  React.useEffect(() => {
    const unsub = mediaSurface.subscribe((e) => {
      if (e.type === "track") setSurfaceRecordingId(e.id);
    });
    return unsub;
  }, []);

  const playerRecordingId = p.current?.recordingId ?? null;
  const playerMuxId = p.current?.muxPlaybackId ?? null;

  const recordingId = React.useMemo(() => {
    return pickKeyWithCues(cuesByRecordingId, [
      playerRecordingId,
      surfaceRecordingId,
      playerMuxId,
    ]);
  }, [cuesByRecordingId, playerRecordingId, playerMuxId, surfaceRecordingId]);

  const cues: LyricCue[] | null = React.useMemo(() => {
    if (!recordingId) return null;
    const xs = cuesByRecordingId?.[recordingId];
    return Array.isArray(xs) && xs.length ? xs : null;
  }, [cuesByRecordingId, recordingId]);

  const trackOffsetMs = React.useMemo(() => {
    if (!recordingId) return 0;
    const v = offsetByRecordingId?.[recordingId];
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  }, [offsetByRecordingId, recordingId]);

  const effectiveOffsetMs = trackOffsetMs + globalOffsetMs;

  const onSeek = React.useCallback(
    (tMs: number) => {
      const ms = Math.max(0, Math.floor(tMs));
      p.seek(ms);

      if (autoResumeOnSeek) {
        const t = p.current ?? p.queue[0];
        if (!t) return;
        p.setIntent("play");
        p.play(t);
        window.dispatchEvent(new Event("af:play-intent"));
      }
    },
    [autoResumeOnSeek, p],
  );

  const lyricsVariant = variant === "inline" ? "inline" : "stage";
  const reservedBottomPx = variant === "inline" ? 0 : STAGE_TRANSPORT_FOOTER_PX;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        borderRadius: 18,
        overflow: "hidden",
        background: "rgba(0,0,0,0.35)",
        isolation: "isolate",
      }}
    >
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <VisualizerCanvas variant={variant} />
      </div>

      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 1,
          background:
            variant === "inline"
              ? "radial-gradient(70% 55% at 50% 40%, rgba(0,0,0,0.00), rgba(0,0,0,0.22) 72%), linear-gradient(180deg, rgba(0,0,0,0.14), rgba(0,0,0,0.06) 45%, rgba(0,0,0,0.16))"
              : "radial-gradient(70% 55% at 50% 40%, rgba(0,0,0,0.00), rgba(0,0,0,0.28) 72%), linear-gradient(180deg, rgba(0,0,0,0.22), rgba(0,0,0,0.10) 45%, rgba(0,0,0,0.24))",
          pointerEvents: "none",
        }}
      />

      <div style={{ position: "absolute", inset: 0, zIndex: 2 }}>
        {lyricsMode === "embedded" ? (
          <LyricsOverlay
            recordingId={recordingId}
            cues={cues}
            offsetMs={effectiveOffsetMs}
            onSeek={onSeek}
            variant={lyricsVariant}
            reservedBottomPx={reservedBottomPx}
          />
        ) : null}
      </div>

      {variant === "fullscreen" ? <StageTransportBar /> : null}
    </div>
  );
}
