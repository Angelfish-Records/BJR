// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {PlayerStateProvider, usePlayer, type PlayerTrack} from './player/PlayerState'
import AudioEngine from './player/AudioEngine'
import PlayerController from './player/PlayerController'
import type {AlbumInfo} from '@/lib/types'

function QueueBootstrapper(props: {
  albumId: string | null
  tracks: PlayerTrack[]
}) {
  const p = usePlayer()

  React.useEffect(() => {
    if (props.tracks.length > 0) {
      p.setQueue(props.tracks)
    }
    // only re-bootstrap when the album identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.albumId])

  return null
}

export default function PortalArea(props: {
  portalPanel: React.ReactNode
  album: AlbumInfo | null
  tracks: PlayerTrack[]
}) {
  const {portalPanel, album, tracks} = props
  const [activePanelId, setActivePanelId] = React.useState<string>('player')

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: 'player',
        label: 'Player',
        content: (
          <PlayerController
            album={album}
            activePanelId={activePanelId}
            playerPanelId="player"
            openPlayerPanel={() => setActivePanelId('player')}
          />
        ),
      },
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel, album, activePanelId]
  )

  return (
    <PlayerStateProvider>
      {/* queue bootstrap (server-fed tracks) */}
      <QueueBootstrapper albumId={album?.id ?? null} tracks={tracks} />

      {/* Media runtime — exactly once */}
      <AudioEngine />

      <div style={{height: '100%', minHeight: 0, minWidth: 0, display: 'grid'}}>
        <PortalShell
          panels={panels}
          defaultPanelId="player"
          activePanelId={activePanelId}
          syncToQueryParam
          onPanelChange={setActivePanelId}
          dock={() => {
            if (activePanelId === 'player') return null
            return (
              <PlayerController
                album={album}
                activePanelId={activePanelId}
                playerPanelId="player"
                openPlayerPanel={() => setActivePanelId('player')}
              />
            )
          }}
        />
      </div>
    </PlayerStateProvider>
  )
}
