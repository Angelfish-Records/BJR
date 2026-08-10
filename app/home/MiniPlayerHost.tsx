"use client";

import React from "react";
import { usePlayer } from "@/app/home/player/PlayerState";
import MiniPlayer from "./player/MiniPlayer";

export default function MiniPlayerHost(
  props: Readonly<{ onExpand: () => void }>,
) {
  const { onExpand } = props;
  const p = usePlayer();

  const intent = p.intent;
  const status = p.status;
  const playRequestPending = p.playRequestPending;
  const current = p.current;
  const queueLen = p.queue.length;

  const [miniActive, setMiniActive] = React.useState(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem("af:miniActive") === "1";
  });

  React.useEffect(() => {
    const shouldActivate =
      playRequestPending ||
      intent === "play" ||
      status === "playing" ||
      status === "paused" ||
      Boolean(current) ||
      queueLen > 0;

    if (!miniActive && shouldActivate) {
      setMiniActive(true);
      try {
        window.sessionStorage.setItem("af:miniActive", "1");
      } catch {}
    }
  }, [miniActive, intent, status, playRequestPending, current, queueLen]);

  if (!miniActive) return null;

  return (
    <MiniPlayer
      onExpand={onExpand}
      artworkUrl={p.queueContextArtworkUrl ?? null}
    />
  );
}
