// web/app/home/player/PlayerController.tsx
'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import {usePlayer} from './PlayerState'
import type {AlbumInfo, AlbumNavItem, PlayerTrack, Tier} from '@/lib/types'
import StageOverlay from './stage/StageOverlay'
import type {LyricCue} from './stage/LyricsOverlay'

export default function PlayerController(props: {
  albumSlug: string
  openPlayerPanel: () => void
  album: AlbumInfo | null
  tracks: PlayerTrack[]
  albums: AlbumNavItem[]
  onSelectAlbum: (slug: string) => void
  isBrowsingAlbum: boolean
  viewerTier?: Tier
}) {
  const {albumSlug, openPlayerPanel, album, tracks, albums, onSelectAlbum, isBrowsingAlbum, viewerTier = 'none'} = props

  const p = usePlayer()

  const [miniActive, setMiniActive] = React.useState(() => {
    if (typeof window === 'undefined') return false
    return window.sessionStorage.getItem('af:miniActive') === '1'
  })

  React.useEffect(() => {
    const shouldActivate =
      p.intent === 'play' ||
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

  const [stageOpen, setStageOpen] = React.useState(false)
  const openStage = React.useCallback(() => setStageOpen(true), [])
  const closeStage = React.useCallback(() => setStageOpen(false), [])

  const cues: LyricCue[] | null = null
  const offsetMs = 0

  return (
    <>
      <FullPlayer
        albumSlug={albumSlug}
        album={album}
        tracks={tracks}
        albums={albums}
        onSelectAlbum={onSelectAlbum}
        isBrowsingAlbum={isBrowsingAlbum}
        viewerTier={viewerTier}
        // @ts-expect-error: intentional opt-in prop; see patch below
        onOpenStage={openStage}
      />

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
