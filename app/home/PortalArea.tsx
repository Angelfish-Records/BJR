// web/app/home/PortalArea.tsx
'use client'

import React from 'react'
import PortalShell, {PortalPanelSpec} from './PortalShell'

import {usePlayer} from '@/app/home/player/PlayerState'
import type {PlayerTrack, AlbumInfo, AlbumNavItem} from '@/lib/types'
import PlayerController from './player/PlayerController'

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

function IconPlayer() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  )
}

function IconPortal() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

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

        // Ensure we’re viewing the player panel when browsing
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
      <QueueBootstrapper albumId={album?.id ?? null} tracks={tracks} />

      <div style={{height: '100%', minHeight: 0, minWidth: 0, display: 'grid'}}>
        <PortalShell
          panels={panels}
          defaultPanelId="player"
          activePanelId={activePanelId}
          syncToQueryParam
          onPanelChange={setActivePanelId}
          headerPortalId="af-portal-topbar-slot"
          header={({activePanelId, setPanel}) => (
            <div
              style={{
                width: '100%',
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                alignItems: 'center',
                gap: 12,
                padding: 12,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                minWidth: 0,
              }}
            >
              {/* Left: circular panel buttons (state toggles, NOT links) */}
              <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                <button
                  type="button"
                  aria-label="Player"
                  title="Player"
                  onClick={() => setPanel('player')}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background:
                      activePanelId === 'player'
                        ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                        : 'rgba(255,255,255,0.04)',
                    boxShadow:
                      activePanelId === 'player'
                        ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                        : '0 12px 26px rgba(0,0,0,0.18)',
                    color: 'rgba(255,255,255,0.90)',
                    cursor: 'pointer',
                    opacity: activePanelId === 'player' ? 0.98 : 0.78,
                    display: 'grid',
                    placeItems: 'center',
                    userSelect: 'none',
                  }}
                >
                  <IconPlayer />
                </button>

                <button
                  type="button"
                  aria-label="Portal"
                  title="Portal"
                  onClick={() => setPanel('portal')}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background:
                      activePanelId === 'portal'
                        ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                        : 'rgba(255,255,255,0.04)',
                    boxShadow:
                      activePanelId === 'portal'
                        ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                        : '0 12px 26px rgba(0,0,0,0.18)',
                    color: 'rgba(255,255,255,0.90)',
                    cursor: 'pointer',
                    opacity: activePanelId === 'portal' ? 0.98 : 0.78,
                    display: 'grid',
                    placeItems: 'center',
                    userSelect: 'none',
                  }}
                >
                  <IconPortal />
                </button>
              </div>

              {/* Center: logo */}
              <div style={{display: 'grid', placeItems: 'center', minWidth: 0}}>
                <div
                  aria-label="AF"
                  title="AF"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(0,0,0,0.22)',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    opacity: 0.92,
                    userSelect: 'none',
                  }}
                >
                  AF
                </div>
              </div>

              {/* Right: empty placeholder (ActivationGate moves here later) */}
              <div style={{justifySelf: 'end', minWidth: 0}} />
            </div>
          )}
        />
      </div>
    </>
  )
}
