'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'
import type {PlayerTrack} from './PlayerState'

export default function PlayerController(props: {
  activePanelId: string
  openPlayerPanel: () => void
  playerPanelId?: string
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
  onSelectAlbum: (slug: string) => void
  isBrowsingAlbum: boolean
}) {
  const {
    activePanelId,
    openPlayerPanel,
    playerPanelId = 'player',
    album,
    tracks,
    albums,
    onSelectAlbum,
    isBrowsingAlbum,
  } = props

  const showFull = activePanelId === playerPanelId

  return (
    <>
      {showFull ? (
        <FullPlayer
          album={album}
          tracks={tracks}
          albums={albums}
          onSelectAlbum={onSelectAlbum}
          isBrowsingAlbum={isBrowsingAlbum}
        />
      ) : (
        <MiniPlayer onExpand={openPlayerPanel} />
      )}
    </>
  )
}
