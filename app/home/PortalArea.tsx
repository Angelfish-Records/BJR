// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {usePlayer, type PlayerTrack} from './player/PlayerState'
import PlayerController from './player/PlayerController'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'

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

type AlbumPayload = {album: AlbumInfo | null; tracks: PlayerTrack[]}

export default function PortalArea(props: {
  portalPanel: React.ReactNode
  albumSlug: string
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
}) {
  const {portalPanel, albumSlug, album: initialAlbum, tracks: initialTracks, albums} = props
  const [activePanelId, setActivePanelId] = React.useState<string>('player')

  // “Browsed album” lives here (inline browsing, no navigation)
  const [album, setAlbum] = React.useState<AlbumInfo | null>(initialAlbum)
  const [tracks, setTracks] = React.useState<PlayerTrack[]>(initialTracks)
  const [isBrowsingAlbum, setIsBrowsingAlbum] = React.useState(false)

  // If server props change (rare), sync them.
  React.useEffect(() => {
    setAlbum(initialAlbum)
    setTracks(initialTracks)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialAlbum?.id, initialTracks.length])

  const onSelectAlbum = React.useCallback(
    async (slug: string) => {
      if (!slug) return
      if (isBrowsingAlbum) return

      setIsBrowsingAlbum(true)
      try {
        const res = await fetch(`/api/albums/${encodeURIComponent(slug)}`, {method: 'GET'})
        if (!res.ok) throw new Error(`Album fetch failed (${res.status})`)
        const json = (await res.json()) as AlbumPayload

        // Inline browse swap: does NOT alter playback.
        setAlbum(json.album ?? null)
        setTracks(Array.isArray(json.tracks) ? json.tracks : [])

        // Optional: ensure we’re viewing the player panel when browsing
        setActivePanelId('player')
      } catch (e) {
        console.error(e)
      } finally {
        setIsBrowsingAlbum(false)
      }
    },
    [isBrowsingAlbum]
  )

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: 'player',
        label: 'Player',
        content: (
          <PlayerController
            albumSlug={albumSlug}  
            album={album}
            tracks={tracks}
            albums={albums}
            onSelectAlbum={onSelectAlbum}
            isBrowsingAlbum={isBrowsingAlbum}
            activePanelId={activePanelId}
            playerPanelId="player"
            openPlayerPanel={() => setActivePanelId('player')}
          />
        ),
      },
      {id: 'portal', label: 'Portal', content: portalPanel},
    ],
    [portalPanel, albumSlug, album, tracks, albums, activePanelId, isBrowsingAlbum, onSelectAlbum]
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
        />
      </div>
    </>
  )
}
