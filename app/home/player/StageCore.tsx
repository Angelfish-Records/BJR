// web/app/home/player/StageCore.tsx
"use client";

import React from "react";
import { usePlayerActions, usePlayerVisual } from "./PlayerState";
import VisualizerCanvas from "./VisualizerCanvas";
import LyricsOverlay from "./stage/LyricsOverlay";
import type { LyricCue } from "@/lib/types";
import { STAGE_TRANSPORT_FOOTER_PX } from "./StageTransportBar";
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

function StageCore(
  props: Readonly<{
    variant: "inline" | "fullscreen";
    cuesByRecordingId?: CuesByRecordingId;
    offsetByRecordingId?: OffsetByRecordingId;
    offsetMs?: number;
    autoResumeOnSeek?: boolean;
    lyricsMode?: "embedded" | "none";
  }>,
) {
  const {
    variant,
    cuesByRecordingId: cuesByRecordingIdProp,
    offsetByRecordingId: offsetByRecordingIdProp,
    offsetMs: globalOffsetMs = 0,
    autoResumeOnSeek = false,
    lyricsMode = "embedded",
  } = props;

  const player = usePlayerVisual();
  const actions = usePlayerActions();
  const snap = useLyricsSnapshot();

  // ✅ prefer props when provided; otherwise use lyricsSurface
  const cuesByRecordingId = cuesByRecordingIdProp ?? snap.cuesByRecordingId;
  const offsetByRecordingId =
    offsetByRecordingIdProp ?? snap.offsetByRecordingId;

  // Register stage presence; fullscreen wins if it exists.
  React.useEffect(() => mediaSurface.registerStage(variant), [variant]);

  const [surfaceRecordingId, setSurfaceRecordingId] = React.useState<
    string | null
  >(() => mediaSurface.getRecordingId());

  React.useEffect(() => {
    const unsub = mediaSurface.subscribe((e) => {
      if (e.type === "track") setSurfaceRecordingId(e.id);
    });
    return unsub;
  }, []);

  const playerRecordingId = player.current?.recordingId ?? null;
  const playerDisplayId = player.current?.displayId ?? null;
  const playerMuxId = player.current?.muxPlaybackId ?? null;

  const recordingId = pickKeyWithCues(cuesByRecordingId, [
    playerRecordingId,
    surfaceRecordingId,
    playerMuxId,
  ]);

  const displayId = playerDisplayId;

  const cues: LyricCue[] | null = recordingId
    ? Array.isArray(cuesByRecordingId?.[recordingId]) &&
      cuesByRecordingId[recordingId].length
      ? cuesByRecordingId[recordingId]
      : null
    : null;

  const trackOffsetMs =
    recordingId && typeof offsetByRecordingId?.[recordingId] === "number"
      ? Number.isFinite(offsetByRecordingId[recordingId])
        ? offsetByRecordingId[recordingId]
        : 0
      : 0;

  const effectiveOffsetMs = trackOffsetMs + globalOffsetMs;
  const resumeTrack = player.current ?? player.firstQueuedTrack;

  const onSeek = React.useCallback(
    (tMs: number) => {
      const ms = Math.max(0, Math.floor(tMs));
      actions.seek(ms);

      if (autoResumeOnSeek) {
        if (!resumeTrack) return;
        actions.setIntent("play");
        actions.play(resumeTrack);
        window.dispatchEvent(new Event("af:play-intent"));
      }
    },
    [actions, autoResumeOnSeek, resumeTrack],
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
            displayId={displayId}
            cues={cues}
            offsetMs={effectiveOffsetMs}
            onSeek={onSeek}
            variant={lyricsVariant}
            reservedBottomPx={reservedBottomPx}
          />
        ) : null}
      </div>
    </div>
  );
}

export default React.memo(StageCore);
