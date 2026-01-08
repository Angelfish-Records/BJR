// web/lib/albums.ts
import {client} from '@/sanity/lib/client'
import {urlFor} from '@/sanity/lib/image'
import type {AlbumInfo} from '@/lib/types'
import type {PlayerTrack} from '@/app/home/player/PlayerState'

type AlbumDoc = {
  _id?: string
  title?: string
  artist?: string
  year?: number
  description?: string
  artwork?: unknown
  tracks?: Array<{
    id: string
    title?: string
    artist?: string
    durationMs?: number
    muxPlaybackId?: string
  }>
}

export type AlbumBrowseItem = {
  id: string
  slug: string
  title: string
  artist?: string
  year?: number
  artwork?: unknown
}

export async function getAlbumBySlug(
  slug: string
): Promise<{album: AlbumInfo | null; tracks: PlayerTrack[]}> {
  const q = `
    *[_type == "album" && slug.current == $slug][0]{
      _id,
      title,
      artist,
      year,
      description,
      artwork,
      "tracks": tracks[]{
        id,
        title,
        artist,
        durationMs,
        muxPlaybackId
      }
    }
  `

  const doc = await client.fetch<AlbumDoc | null>(q, {slug})

  if (!doc?._id) return {album: null, tracks: []}

  const album: AlbumInfo = {
    id: doc._id,
    title: doc.title ?? 'Untitled',
    artist: doc.artist ?? undefined,
    year: doc.year ?? undefined,
    description: doc.description ?? undefined,
    artworkUrl: doc.artwork
      ? urlFor(doc.artwork).width(900).height(900).quality(85).url()
      : null,
  }

  const tracks: PlayerTrack[] = Array.isArray(doc.tracks)
  ? doc.tracks
      .filter((t) => t?.id)
      .map((t) => {
        const raw = t.durationMs
        const n = typeof raw === 'number' ? raw : undefined

        return {
          id: t.id,
          title: t.title ?? undefined,
          artist: t.artist ?? undefined,
          muxPlaybackId: t.muxPlaybackId ?? undefined,
          durationMs: typeof n === 'number' && n > 0 ? n : undefined,
        }
      })
  : []


  return {album, tracks}
}

export async function listAlbumsForBrowse(): Promise<AlbumBrowseItem[]> {
  const q = `
    *[_type=="album"]|order(year desc, _createdAt desc){
      "id": _id,
      "slug": slug.current,
      title,
      artist,
      year,
      artwork
    }
  `

  const data = await client.fetch<AlbumBrowseItem[]>(q)

  return Array.isArray(data) ? data : []
}
