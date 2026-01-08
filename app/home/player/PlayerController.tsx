// web/app/home/player/PlayerController.tsx
'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import type {AlbumInfo} from '@/lib/types'
import type {PlayerTrack} from './PlayerState'
import type {AlbumNavItem} from '@/lib/types' // add this type

export default function PlayerController(props: {
  activePanelId: string
  openPlayerPanel: () => void
  playerPanelId?: string
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
}) {
  const {activePanelId, openPlayerPanel, playerPanelId = 'player', album, tracks, albums} = props

  const showFull = activePanelId === playerPanelId
  const showDock = !showFull

  return (
    <>
      {showFull ? <FullPlayer album={album} tracks={tracks} albums={albums} /> : null}
      {showDock ? <MiniPlayer onExpand={openPlayerPanel} /> : null}
    </>
  )
}
