// web/app/(site)/albums/[slug]/page.tsx
import React from 'react'
import {notFound} from 'next/navigation'

import PortalArea from '@/app/home/PortalArea'
import AlbumDeepLinkBridge from './AlbumDeepLinkBridge'
import {getAlbumBySlug, listAlbumsForBrowse} from '@/lib/albums'
import type {AlbumInfo, AlbumNavItem} from '@/lib/types'
import type {PlayerTrack} from '@/app/home/player/PlayerState'
import {urlFor} from '@/sanity/lib/image'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

type PageSearchParams = Record<string, string | string[] | undefined>

type WithArtwork = {artwork?: unknown}
function hasArtwork(x: unknown): x is WithArtwork {
  return typeof x === 'object' && x !== null && 'artwork' in x
}

// ✅ OG / Twitter / canonical handling for album + track deep-links
export async function generateMetadata(props: {
  params: Promise<{slug: string}>
  searchParams?: Promise<PageSearchParams>
}) {
  const {slug} = await props.params
  const sp = (props.searchParams ? await props.searchParams : {}) ?? {}
  const tRaw = sp.t
  const t = Array.isArray(tRaw) ? tRaw[0] : tRaw

  const albumData = await getAlbumBySlug(slug)
  if (!albumData.album) return {}

  const album = albumData.album as AlbumInfo
  const tracks = albumData.tracks as PlayerTrack[]

  const origin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') || ''
  const canonicalPath = t ? `/albums/${slug}?t=${encodeURIComponent(t)}` : `/albums/${slug}`
  const canonical = origin ? `${origin}${canonicalPath}` : canonicalPath

  const artist = (album.artist ?? '').toString().trim()
  const albumTitle = (album.title ?? '').toString().trim() || slug

  const track = t ? tracks.find((x) => x?.id === t) : undefined
  const trackTitle = track?.title ? String(track.title).trim() : ''

  const title = trackTitle
    ? `${trackTitle} — ${albumTitle}${artist ? ` — ${artist}` : ''}`
    : `${albumTitle}${artist ? ` — ${artist}` : ''}`

  const description = trackTitle
    ? `Listen to “${trackTitle}” on ${albumTitle}${artist ? ` by ${artist}` : ''}.`
    : `Listen to ${albumTitle}${artist ? ` by ${artist}` : ''}.`

  const img =
    hasArtwork(album) && album.artwork
      ? urlFor(album.artwork).width(1200).height(1200).quality(85).url()
      : undefined

  return {
    title,
    description,
    alternates: {canonical},
    openGraph: {
      title,
      description,
      url: canonical,
      type: 'music.album',
      images: img ? [{url: img, width: 1200, height: 1200}] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: img ? [img] : undefined,
    },
  }
}

export default async function AlbumPage(props: {
  params: Promise<{slug: string}>
  searchParams?: Promise<PageSearchParams>
}) {
  const {slug} = await props.params
  const sp = (props.searchParams ? await props.searchParams : {}) ?? {}
  const tRaw = sp.t
  const initialTrackId = (Array.isArray(tRaw) ? tRaw[0] : tRaw) ?? null

  const albumData = await getAlbumBySlug(slug)
  if (!albumData.album) notFound()

  const album = albumData.album as AlbumInfo
  const tracks = albumData.tracks as PlayerTrack[]

  const browseAlbumsRaw = await listAlbumsForBrowse()
  const browseAlbums: AlbumNavItem[] = browseAlbumsRaw
    .filter((a) => a.slug && a.title)
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      artist: a.artist ?? undefined,
      year: a.year ?? undefined,
      coverUrl: a.artwork ? urlFor(a.artwork).width(400).height(400).quality(80).url() : null,
    }))

  const albumContextId = album.id

  // best-effort artwork for miniplayer context
  const albumArtworkUrl =
    hasArtwork(album) && album.artwork
      ? urlFor(album.artwork).width(400).height(400).quality(80).url()
      : null

  return (
    <>
      <AlbumDeepLinkBridge
        albumContextId={albumContextId}
        albumArtworkUrl={albumArtworkUrl}
        tracks={tracks}
        initialTrackId={initialTrackId}
      />

      <PortalArea
        album={album}
        tracks={tracks}
        albums={browseAlbums}
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
            {initialTrackId ? (
              <>
                <br />
                Track: <code style={{opacity: 0.9}}>{initialTrackId}</code>
              </>
            ) : null}
          </div>
        }
      />
    </>
  )
}
