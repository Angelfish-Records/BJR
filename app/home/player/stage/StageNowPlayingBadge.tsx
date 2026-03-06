"use client";

import React from "react";
import { usePlayer } from "../PlayerState";
import type { PlayerTrack } from "@/lib/types";
import { STAGE_TRANSPORT_FOOTER_PX } from "../StageTransportBar";

function findTrackByRecordingId(
  queue: PlayerTrack[],
  recordingId?: string | null,
): PlayerTrack | null {
  if (!recordingId) return null;
  return queue.find((t) => t.recordingId === recordingId) ?? null;
}

const BADGE_HEIGHT_PX = 60;

export default function StageNowPlayingBadge() {
  const p = usePlayer();

  const pendingTrack =
    findTrackByRecordingId(p.queue, p.pendingRecordingId) ?? null;
  const displayTrack = pendingTrack ?? p.current ?? null;

  const title =
    displayTrack?.title?.trim() ||
    displayTrack?.displayId?.trim() ||
    displayTrack?.recordingId?.trim() ||
    "Nothing queued";

  const artist =
    displayTrack?.artist?.trim() ||
    p.queueContextArtist?.trim() ||
    "";

  const artworkUrl = p.queueContextArtworkUrl ?? null;

  const bottomInsetPx = Math.max(
    12,
    Math.round((STAGE_TRANSPORT_FOOTER_PX - BADGE_HEIGHT_PX) / 2),
  );

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        right: "max(16px, env(safe-area-inset-right, 0px))",
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomInsetPx}px)`,
        zIndex: 6,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: BADGE_HEIGHT_PX,
          minWidth: 0,
          maxWidth: "min(360px, calc(100vw - 32px))",
          display: "grid",
          gridTemplateColumns: `${BADGE_HEIGHT_PX}px minmax(0, 1fr)`,
          alignItems: "stretch",
          overflow: "hidden",
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.42)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          boxShadow: "0 14px 36px rgba(0,0,0,0.28)",
        }}
      >
        <div
          style={{
            width: BADGE_HEIGHT_PX,
            height: BADGE_HEIGHT_PX,
            background: artworkUrl
              ? `url(${artworkUrl}) center/cover no-repeat`
              : "rgba(255,255,255,0.08)",
            borderRight: "1px solid rgba(255,255,255,0.10)",
            flex: "0 0 auto",
          }}
        />

        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 2,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.15,
              fontWeight: 700,
              color: "rgba(255,255,255,0.95)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {title}
          </div>

          <div
            style={{
              fontSize: 11,
              lineHeight: 1.15,
              color: "rgba(255,255,255,0.62)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {artist}
          </div>
        </div>
      </div>
    </div>
  );
}