// web/app/home/player/PlayerController.tsx
"use client";

import React from "react";
import FullPlayer from "./FullPlayer";
import type { AlbumInfo, AlbumNavItem, PlayerTrack, Tier, AlbumLyricsBundle } from "@/lib/types";
import StageOverlay from "./stage/StageOverlay";

export default function PlayerController(props: {
  albumSlug: string;
  openPlayerPanel: () => void;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  albumLyrics?: AlbumLyricsBundle | null;
  albums: AlbumNavItem[];
  onSelectAlbum: (slug: string) => void;
  isBrowsingAlbum: boolean;
  viewerTier?: Tier;
}) {
  const {
    albumSlug,
    album,
    tracks,
    albumLyrics,
    albums,
    onSelectAlbum,
    isBrowsingAlbum,
    viewerTier = "none",
  } = props;

  const [stageOpen, setStageOpen] = React.useState(false);
  const closeStage = React.useCallback(() => setStageOpen(false), []);

  return (
    <>
      <FullPlayer
        albumSlug={albumSlug}
        album={album}
        tracks={tracks}
        albumLyrics={albumLyrics}
        albums={albums}
        onSelectAlbum={onSelectAlbum}
        isBrowsingAlbum={isBrowsingAlbum}
        viewerTier={viewerTier}
      />

      <StageOverlay
        open={stageOpen}
        onClose={closeStage}
      />
    </>
  );
}
