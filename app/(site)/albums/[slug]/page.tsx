import React from 'react'
import {notFound} from 'next/navigation'

import PortalArea from '@/app/home/PortalArea'
import {getAlbumBySlug} from '@/lib/albums'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export default async function AlbumPage(props: {params: Promise<{slug: string}>}) {
  const {slug} = await props.params

  const albumData = await getAlbumBySlug(slug)
  if (!albumData.album) notFound()

  return (
    <PortalArea
      album={albumData.album}
      tracks={albumData.tracks}
      portalPanel={
        <div
          style={{
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(255,255,255,0.04)',
            padding: 16,
            fontSize: 13,
            opacity: 0.78,
            lineHeight: 1.55,
          }}
        >
          Album: <code style={{opacity: 0.9}}>{slug}</code>
        </div>
      }
    />
  )
}
