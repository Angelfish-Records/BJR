'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import {usePlayer} from './PlayerState'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'
import type {PlayerTrack} from '@/lib/types'
import StageOverlay from './stage/StageOverlay'
import type {LyricCue} from './stage/LyricsOverlay'

export default function PlayerController(props: {
  albumSlug: string
  activePanelId: string
  openPlayerPanel: () => void
  playerPanelId?: string
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
  onSelectAlbum: (slug: string) => void
  isBrowsingAlbum: boolean
}) {
  const {
    albumSlug,
    activePanelId,
    openPlayerPanel,
    playerPanelId = 'player',
    album,
    tracks,
    albums,
    onSelectAlbum,
    isBrowsingAlbum,
  } = props

  const p = usePlayer()

  // Once the dock becomes active, it should never go away (this session or next).
  const [miniActive, setMiniActive] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem('af:miniActive') === '1'
  })

  React.useEffect(() => {
    const shouldActivate =
      p.intent === 'play' ||
      p.status === 'loading' ||
      p.status === 'playing' ||
      p.status === 'paused' ||
      Boolean(p.current) ||
      p.queue.length > 0

    if (!miniActive && shouldActivate) {
      setMiniActive(true)
      try {
        window.sessionStorage.setItem('af:miniActive', '1')
      } catch {}
    }
  }, [miniActive, p])

  const showFull = activePanelId === playerPanelId

  // Stage overlay toggle
  const [stageOpen, setStageOpen] = React.useState(false)
  const openStage = React.useCallback(() => setStageOpen(true), [])
  const closeStage = React.useCallback(() => setStageOpen(false), [])

  // MVP: no lyrics wired yet.
  // Later: fetch cues by p.current?.id from Sanity via a route, then pass in here.
  const cues: LyricCue[] | null = null
  const offsetMs = 0

  return (
    <>
      {showFull ? (
        <FullPlayer
          albumSlug={albumSlug}
          album={album}
          tracks={tracks}
          albums={albums}
          onSelectAlbum={onSelectAlbum}
          isBrowsingAlbum={isBrowsingAlbum}
          // @ts-expect-error: intentional opt-in prop; see patch below
          onOpenStage={openStage}
        />
      ) : null}

      {miniActive ? (
        <MiniPlayer
          onExpand={openPlayerPanel}
          artworkUrl={p.queueContextArtworkUrl ?? null}
          // @ts-expect-error: intentional opt-in prop; see patch below
          onOpenStage={openStage}
        />
      ) : null}

      <StageOverlay open={stageOpen} onClose={closeStage} cues={cues} offsetMs={offsetMs} />
    </>
  )
}
