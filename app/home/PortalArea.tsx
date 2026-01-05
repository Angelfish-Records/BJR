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
    {
      id: 'shop',
      label: 'Shop',
      content: (
        <div
          style={{
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            padding: 16,
            fontSize: 13,
            opacity: 0.78,
            lineHeight: 1.55,
          }}
        >
          Shop panel placeholder.
        </div>
      ),
    },
    {
      id: 'about',
      label: 'About',
      content: (
        <div
          style={{
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            padding: 16,
            fontSize: 13,
            opacity: 0.78,
            lineHeight: 1.55,
          }}
        >
          About panel placeholder.
        </div>
      ),
    },
  ]

  return (
    <PlayerStateProvider>
      <PortalShell
        defaultPanelId="portal"
        onPanelChange={(id) => setActivePanelId(id)}
        // Crucial: hide the dock entirely on the player panel.
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
        panels={panels}
        syncToQueryParam
      />
    </PlayerStateProvider>
  )
}
