// web/app/home/player/PlayerController.tsx
'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import type {AlbumInfo} from '@/lib/types'

export default function PlayerController(props: {
  activePanelId: string
  openPlayerPanel: () => void
  playerPanelId?: string
  album: AlbumInfo | null
}) {
  const {activePanelId, openPlayerPanel, playerPanelId = 'player', album} = props

  const showFull = activePanelId === playerPanelId
  const showDock = !showFull

  return (
    <>
      {showFull ? <FullPlayer album={album} /> : null}
      {showDock ? <MiniPlayer onExpand={openPlayerPanel} /> : null}
    </>
  )
}
