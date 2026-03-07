// web/app/home/player/stage/StageNowPlayingBadge.tsx
"use client";

import React from "react";
import { usePlayer } from "../PlayerState";
import type { PlayerTrack } from "@/lib/types";

function findTrackByRecordingId(
  queue: PlayerTrack[],
  recordingId?: string | null,
): PlayerTrack | null {
  if (!recordingId) return null;
  return queue.find((t) => t.recordingId === recordingId) ?? null;
}

const BADGE_HEIGHT_PX = 60;
const BADGE_WIDTH_PX = 320;

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
    displayTrack?.artist?.trim() || p.queueContextArtist?.trim() || "";

  const artworkUrl = p.queueContextArtworkUrl ?? null;

  const bottomInsetPx = 20;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        left: "max(16px, env(safe-area-inset-left, 0px))",
        bottom: `calc(env(safe-area-inset-bottom, 0px) + ${bottomInsetPx}px)`,
        width: `min(${BADGE_WIDTH_PX}px, calc(100vw - 32px))`,
        height: BADGE_HEIGHT_PX,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "grid",
          gridTemplateColumns: `${BADGE_HEIGHT_PX}px minmax(0, 1fr)`,
          alignItems: "stretch",
          overflow: "hidden",
          borderRadius: 16,
          boxShadow: "0 14px 36px rgba(0,0,0,0.28)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <div
          style={{
            width: BADGE_HEIGHT_PX,
            height: BADGE_HEIGHT_PX,
            background: artworkUrl
              ? `url(${artworkUrl}) center/cover no-repeat`
              : "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRight: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 16,
            borderTopRightRadius: 0,
            borderBottomRightRadius: 0,
            flex: "0 0 auto",
            overflow: "hidden",
          }}
        />

        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: 2,
            padding: "10px 16px 10px 12px",
            marginLeft: -1,
            borderTop: "1px solid rgba(255,255,255,0.12)",
            borderRight: "1px solid rgba(255,255,255,0.02)",
            borderBottom: "1px solid rgba(255,255,255,0.12)",
            borderTopRightRadius: 16,
            borderBottomRightRadius: 16,
            background:
              "linear-gradient(90deg, rgba(0,0,0,0.52) 0%, rgba(0,0,0,0.36) 42%, rgba(0,0,0,0.16) 72%, rgba(0,0,0,0.00) 100%)",
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
