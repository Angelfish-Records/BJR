// web/lib/albums.ts
import {client} from '@/sanity/lib/client'
import {urlFor} from '@/sanity/lib/image'
import type {AlbumInfo} from '@/lib/types'
import type {PlayerTrack} from '@/app/home/player/PlayerState'
import type {LyricCue} from '@/app/home/player/stage/LyricsOverlay'

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

type TrackLyricsDoc = {
  trackId?: string
  offsetMs?: number
  cues?: Array<{tMs?: number; text?: string; endMs?: number}>
}

export type AlbumBrowseItem = {
  id: string
  slug: string
  title: string
  artist?: string
  year?: number
  artwork?: unknown
}

export type AlbumLyricsBundle = {
  cuesByTrackId: Record<string, LyricCue[]>
  offsetByTrackId: Record<string, number>
}

function normalizeCues(input: TrackLyricsDoc['cues']): LyricCue[] {
  if (!Array.isArray(input)) return []
  const out: LyricCue[] = []
  for (const c of input) {
    const tMs = c?.tMs
    const text = c?.text
    const endMs = c?.endMs
    if (typeof tMs !== 'number' || !Number.isFinite(tMs) || tMs < 0) continue
    if (typeof text !== 'string' || text.trim().length === 0) continue
    const cue: LyricCue = {tMs: Math.floor(tMs), text: text.trim()}
    if (typeof endMs === 'number' && Number.isFinite(endMs) && endMs >= 0) cue.endMs = Math.floor(endMs)
    out.push(cue)
  }
  out.sort((a, b) => a.tMs - b.tMs)
  return out
}

export async function getAlbumBySlug(
  slug: string
): Promise<{album: AlbumInfo | null; tracks: PlayerTrack[]; lyrics: AlbumLyricsBundle}> {
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

  if (!doc?._id) {
    return {album: null, tracks: [], lyrics: {cuesByTrackId: {}, offsetByTrackId: {}}}
  }

  const album: AlbumInfo = {
    id: doc._id,
    title: doc.title ?? 'Untitled',
    artist: doc.artist ?? undefined,
    year: doc.year ?? undefined,
    description: doc.description ?? undefined,
    artworkUrl: doc.artwork ? urlFor(doc.artwork).width(900).height(900).quality(85).url() : null,
  }

  const tracks: PlayerTrack[] = Array.isArray(doc.tracks)
    ? doc.tracks
        .filter((t) => t?.id)
        .map((t) => {
          const raw = t.durationMs
          const n = typeof raw === 'number' && Number.isFinite(raw) ? raw : undefined
          return {
            id: t.id,
            title: t.title ?? undefined,
            artist: t.artist ?? undefined,
            muxPlaybackId: t.muxPlaybackId ?? undefined,
            durationMs: typeof n === 'number' && n > 0 ? n : undefined,
          }
        })
    : []

  const trackIds = tracks.map((t) => t.id).filter((x): x is string => typeof x === 'string' && x.length > 0)

  const lyricsQ = `
    *[_type == "lyrics" && trackId in $trackIds]{
      trackId,
      offsetMs,
      cues[]{ tMs, text, endMs }
    }
  `

  const lyricDocs = trackIds.length ? await client.fetch<TrackLyricsDoc[]>(lyricsQ, {trackIds}) : []

  const cuesByTrackId: Record<string, LyricCue[]> = {}
  const offsetByTrackId: Record<string, number> = {}

  for (const d of Array.isArray(lyricDocs) ? lyricDocs : []) {
    const id = d?.trackId
    if (!id) continue
    cuesByTrackId[id] = normalizeCues(d.cues)
    offsetByTrackId[id] =
      typeof d.offsetMs === 'number' && Number.isFinite(d.offsetMs) ? Math.floor(d.offsetMs) : 0
  }

  return {album, tracks, lyrics: {cuesByTrackId, offsetByTrackId}}
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
