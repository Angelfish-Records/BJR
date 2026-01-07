// web/app/home/player/HomeAlbumShell.tsx
'use client'

import React from 'react'
import {usePlayer, type PlayerTrack} from './PlayerState'
import PlayerController from './PlayerController'

export default function HomeAlbumShell(props: {
  album: {
    id: string
    title: string
    artist?: string
    year?: number
    description?: string
  } | null
  tracks: PlayerTrack[]
  activePanelId: string
  openPlayerPanel: () => void
}) {
  const p = usePlayer()

  React.useEffect(() => {
    if (props.tracks.length > 0) {
      p.setQueue(props.tracks)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.album?.id])

  return (
    <PlayerController
      album={props.album}
      activePanelId={props.activePanelId}
      openPlayerPanel={props.openPlayerPanel}
    />
  )
}
