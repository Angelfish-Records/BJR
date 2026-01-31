"use client";

import * as React from "react";
import { usePlayer } from "./PlayerState";

type Mode = "track" | "album" | "off";

function clean(s: unknown): string {
  return typeof s === "string" ? s.trim().replace(/\s+/g, " ") : "";
}

function buildTitle(opts: {
  siteName: string;
  fallbackLeaf: string; // e.g. "Home" or featured album title
  mode: Mode;
  status: string;
  trackTitle: string;
  artist: string;
  album: string;
}) {
  const { siteName, fallbackLeaf, mode, trackTitle, artist, album } =
    opts;

  if (mode === "off") return `${fallbackLeaf} · ${siteName}`;

  if (mode === "album") {
    const leaf = album || fallbackLeaf;
    return `${leaf} · ${siteName}`;
  }

  // mode === "track"
  if (trackTitle) {
    const leaf = artist ? `${trackTitle} — ${artist}` : trackTitle;
    return `${leaf} · ${siteName}`;
  }

  // No track title available => fall back to album or fallback leaf
  const leaf = album || fallbackLeaf;
  return `${leaf} · ${siteName}`;
}

export default function TrackTitleSync(props: {
  siteName?: string; // suffix
  fallbackLeaf: string; // REQUIRED: what to show when no queue/current
  mode?: Mode; // "track" default
  enabled?: boolean;
}) {
  const { siteName = "Brendan John Roch", fallbackLeaf, mode = "track", enabled = true } =
    props;

  const p = usePlayer();

  // ---- derive stable scalars (no object deps) ----
  const status = p.status;

  const curId = p.current?.id ?? "";
  const curTitle = p.current?.title ?? "";

  const q0 = p.queue.length ? p.queue[0] : null;
  const q0Id = q0?.id ?? "";
  const q0Title = q0?.title ?? "";

  const queueArtist = p.queueContextArtist ?? "";
  const queueAlbumTitle = p.queueContextTitle ?? "";

  const derived = React.useMemo(() => {
    const trackTitle = clean(curTitle || q0Title);
    const artist = clean(queueArtist);
    const album = clean(queueAlbumTitle);

    // If we have a queued track but state is idle, treat it as paused-ish for title UX.
    const effectiveStatus = status === "idle" && (curId || q0Id) ? "paused" : status;

    return buildTitle({
      siteName,
      fallbackLeaf,
      mode,
      status: effectiveStatus,
      trackTitle,
      artist,
      album,
    });
  }, [
    siteName,
    fallbackLeaf,
    mode,
    status,
    curId,
    curTitle,
    q0Id,
    q0Title,
    queueArtist,
    queueAlbumTitle,
  ]);

  const lastRef = React.useRef<string>("");

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof document === "undefined") return;

    if (derived && derived !== lastRef.current) {
      lastRef.current = derived;
      document.title = derived;
    }
  }, [enabled, derived]);

  return null;
}
