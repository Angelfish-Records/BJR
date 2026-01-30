// web/app/home/player/PlayerController.tsx
"use client";

import React from "react";
import FullPlayer from "./FullPlayer";
import type { AlbumInfo, AlbumNavItem, PlayerTrack, Tier } from "@/lib/types";
import StageOverlay from "./stage/StageOverlay";
import type { LyricCue } from "./stage/LyricsOverlay";

export default function PlayerController(props: {
  albumSlug: string;
  openPlayerPanel: () => void;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  albums: AlbumNavItem[];
  onSelectAlbum: (slug: string) => void;
  isBrowsingAlbum: boolean;
  viewerTier?: Tier;
}) {
  const {
    albumSlug,
    album,
    tracks,
    albums,
    onSelectAlbum,
    isBrowsingAlbum,
    viewerTier = "none",
  } = props;

  const [stageOpen, setStageOpen] = React.useState(false);
  const openStage = React.useCallback(() => setStageOpen(true), []);
  const closeStage = React.useCallback(() => setStageOpen(false), []);

  const cues: LyricCue[] | null = null;
  const offsetMs = 0;

  return (
    <>
      <FullPlayer
        albumSlug={albumSlug}
        album={album}
        tracks={tracks}
        albums={albums}
        onSelectAlbum={onSelectAlbum}
        isBrowsingAlbum={isBrowsingAlbum}
        viewerTier={viewerTier}
        // If FullPlayer doesn't declare this prop, either remove it or add it to FullPlayer's prop types.
        // @ts-expect-error intentional opt-in prop
        onOpenStage={openStage}
      />

      <StageOverlay
        open={stageOpen}
        onClose={closeStage}
        cues={cues}
        offsetMs={offsetMs}
      />
    </>
  );
}
