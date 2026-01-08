// web/app/home/player/PlayerController.tsx
'use client'

import React from 'react'
import FullPlayer from './FullPlayer'
import MiniPlayer from './MiniPlayer'
import {usePlayer} from './PlayerState'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'
import type {PlayerTrack} from './PlayerState'

export default function PlayerController(props: {
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

const [miniActive, setMiniActive] = React.useState(() => {
  if (typeof window === 'undefined') return false
  return window.sessionStorage.getItem('af:miniActive') === '1'
})

React.useEffect(() => {
  // “Open once” when playback begins (loading is fine — it means user hit play).
  if (!miniActive && (p.status === 'loading' || p.status === 'playing' || p.status === 'paused')) {
    setMiniActive(true)
    try { window.sessionStorage.setItem('af:miniActive', '1') } catch {}
  }
}, [miniActive, p.status])

  
  const showFull = activePanelId === playerPanelId

  return (
  <>
    {showFull ? (
      <FullPlayer
        album={album}
        tracks={tracks}
        albums={albums}
        onSelectAlbum={onSelectAlbum}
        isBrowsingAlbum={isBrowsingAlbum}
      />
    ) : null}

    {miniActive ? <MiniPlayer onExpand={openPlayerPanel} /> : null}
  </>
)

}


