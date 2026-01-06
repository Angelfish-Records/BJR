'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {PlayerStateProvider} from './player/PlayerState'
import PlayerController from './player/PlayerController'
import FullPlayer from './player/FullPlayer'

export default function PortalArea(props: {portalPanel: React.ReactNode}) {
  const {portalPanel} = props

  const [activePanelId, setActivePanelId] = React.useState<string>('player')

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {id: 'player', label: 'Player', content: <FullPlayer />},
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel]
  )

return (
  <PlayerStateProvider>
    <div
      style={{
        // Make PortalArea a stable-height frame.
        // This is the missing precondition for "PortalShell scrolls internally".
        height: '100%',
        minHeight: 0,
        minWidth: 0,
        display: 'grid',
      }}
    >
      <PortalShell
  panels={panels}
  defaultPanelId="player"
  activePanelId={activePanelId}   // ✅ NEW: controlled
  syncToQueryParam
  onPanelChange={setActivePanelId}
  dock={() => {
    if (activePanelId === 'player') return null
    return (
      <PlayerController
        activePanelId={activePanelId}
        playerPanelId="player"
        openPlayerPanel={() => setActivePanelId('player')} // now actually switches panels
      />
    )
  }}
/>

    </div>
  </PlayerStateProvider>
)

}
