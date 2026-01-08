// web/lib/albums.ts
import 'server-only'
import {sanity} from './sanityClient'

export type AlbumPayload = {
  album: {
    id: string
    title: string
    artist?: string
    year?: number
    description?: string
  } | null
  tracks: Array<{
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
  coverImage?: unknown
}

export async function getAlbumBySlug(slug: string): Promise<AlbumPayload> {
  const data = await sanity.fetch(
    `
    *[_type == "album" && slug.current == $slug][0]{
      _id,
      title,
      artist,
      year,
      description,
      "tracks": tracks[]{
        id,
        title,
        artist,
        durationMs,
        muxPlaybackId
      }
    }
    `,
    {slug}
  )

  if (!data?._id) return {album: null, tracks: []}

  return {
    album: {
      id: data._id,
      title: data.title ?? 'Untitled',
      artist: data.artist ?? undefined,
      year: data.year ?? undefined,
      description: data.description ?? undefined,
    },
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
  }
}

export async function listAlbumsForBrowse(): Promise<AlbumBrowseItem[]> {
  const data = await sanity.fetch(
    `
    *[_type=="album"]|order(year desc, _createdAt desc){
      "id": _id,
      "slug": slug.current,
      title,
      artist,
      year,
      // CHANGE this to your actual image field name
      "coverImage": coalesce(coverImage, artwork, image)
    }
    `
  )
  return Array.isArray(data) ? data : []
}