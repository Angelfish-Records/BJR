'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'

export default function PlayerController(props: {
  activePanelId: string
  openPlayerPanel: () => void
  playerPanelId?: string
}) {
  const {activePanelId, openPlayerPanel, playerPanelId = 'player'} = props

  const showFull = activePanelId === playerPanelId
  const showDock = !showFull

  return (
    <>
      {showFull ? <FullPlayer /> : null}
      {/* Dock is rendered by PortalShell; this component just provides what to render */}
      {showDock ? <MiniPlayer onExpand={openPlayerPanel} /> : null}
    </>
  )
}
