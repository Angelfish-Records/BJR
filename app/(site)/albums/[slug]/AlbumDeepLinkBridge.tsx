// web/app/(site)/albums/[slug]/AlbumDeepLinkBridge.tsx
'use client'

import React from 'react'
import {usePlayer, type PlayerTrack} from '@/app/home/player/PlayerState'

export default function AlbumDeepLinkBridge(props: {
  albumContextId?: string
  albumArtworkUrl?: string | null
  tracks: PlayerTrack[]
  initialTrackId?: string | null
}) {
  const {albumContextId, albumArtworkUrl, tracks, initialTrackId} = props
  const p = usePlayer()

  React.useEffect(() => {
    // Always ensure the queue is album-scoped for this page view.
    if (tracks?.length) {
      p.setQueue(tracks, {contextId: albumContextId, artworkUrl: albumArtworkUrl ?? null})
    }

    // If ?t= exists, select it (no autoplay).
    if (initialTrackId) {
      p.selectTrack(initialTrackId)
      p.setPendingTrackId(undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumContextId, albumArtworkUrl, initialTrackId, tracks?.length])

  return null
}
