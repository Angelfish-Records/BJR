// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {usePlayer, type PlayerTrack} from './player/PlayerState'
import PlayerController from './player/PlayerController'
import type {AlbumInfo} from '@/lib/types'
import type {AlbumNavItem} from '@/lib/types'

function QueueBootstrapper(props: {albumId: string | null; tracks: PlayerTrack[]}) {
  const p = usePlayer()

  React.useEffect(() => {
    // Browser-mode: never clobber an existing queue/playback on navigation.
    if (p.queue.length > 0) return
    if (!props.tracks.length) return
    p.setQueue(props.tracks)
  }, [p, props.tracks])

  return null
}

export default function PortalArea(props: {
  portalPanel: React.ReactNode
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
}) {
  const {portalPanel, album, tracks, albums} = props
  const [activePanelId, setActivePanelId] = React.useState<string>('player')

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: 'player',
        label: 'Player',
        content: (
          <PlayerController
            album={album}
            tracks={tracks}
            albums={albums}
            activePanelId={activePanelId}
            playerPanelId="player"
            openPlayerPanel={() => setActivePanelId('player')}
          />
        ),
      },
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel, album, tracks, albums, activePanelId]
  )

    return (
    <>
      {/* queue bootstrap (server-fed tracks) */}
      <QueueBootstrapper albumId={album?.id ?? null} tracks={tracks} />

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
              tracks={tracks}
              albums={albums}
              activePanelId={activePanelId}
              playerPanelId="player"
              openPlayerPanel={() => setActivePanelId('player')}
      />
    )
  }}
        />
      </div>
    </>
  )

}
