// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {usePlayer, type PlayerTrack} from './player/PlayerState'
import PlayerController from './player/PlayerController'
import type {AlbumInfo} from '@/lib/types'

function QueueBootstrapper(props: {albumId: string | null; tracks: PlayerTrack[]}) {
  const p = usePlayer()
  const appliedRef = React.useRef<string | null>(null)

  React.useEffect(() => {
  const tracks = props.tracks
  if (!tracks.length) return

  const key = `${props.albumId ?? 'none'}:${tracks.map(t => t.id).join('|')}`
  if (appliedRef.current === key) return
  appliedRef.current = key

  const ids = new Set(tracks.map(t => t.id))
  const currentOk = p.current?.id ? ids.has(p.current.id) : false

  p.setQueue(tracks)

  // If you're not currently on a track in this album, jump to track 1.
  if (!currentOk) {
    p.play(tracks[0])
  }
}, [props.albumId, props.tracks, p])


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
