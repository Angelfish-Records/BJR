// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {PlayerStateProvider} from './player/PlayerState'
import PlayerController from './player/PlayerController'
import FullPlayer from './player/FullPlayer'

export default function PortalArea(props: {portalPanel: React.ReactNode}) {
  const {portalPanel} = props

  const [activePanelId, setActivePanelId] = React.useState<string>('portal')

  const panels: PortalPanelSpec[] = [
    {id: 'portal', label: 'Portal', content: portalPanel},
    {id: 'player', label: 'Player', content: <FullPlayer />},
  ]

  return (
    <PlayerStateProvider>
      <PortalShell
        panels={panels}
        defaultPanelId="portal"
        syncToQueryParam
        onPanelChange={(id) => setActivePanelId(id)}
        // Hide the dock entirely on the player panel.
        dock={() => {
          if (activePanelId === 'player') return null
          return (
            <PlayerController
              activePanelId={activePanelId}
              playerPanelId="player"
              openPlayerPanel={() => setActivePanelId('player')}
            />
          )
        }}
      />
    </PlayerStateProvider>
  )
}
