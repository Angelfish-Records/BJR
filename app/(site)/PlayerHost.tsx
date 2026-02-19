// web/app/(site)/PlayerHost.tsx
"use client";

import React from "react";
import { PlayerStateProvider } from "@/app/home/player/PlayerState";
import AudioEngine from "@/app/home/player/AudioEngine";
import TrackTitleSync from "@/app/home/player/TrackTitleSync";

export default function PlayerHost({ children }: { children: React.ReactNode }) {
  return (
    <PlayerStateProvider>
      <AudioEngine />
      {/* Global tab title sync for the whole (site) tree */}
      <TrackTitleSync fallbackLeaf="Consolers" mode="track" />
      {children}
    </PlayerStateProvider>
  );
}
