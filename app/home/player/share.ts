// web/app/home/player/share.ts
'use client'

import type {AlbumInfo} from '@/lib/types'
import type {PlayerTrack} from './PlayerState'
import {buildShareTarget, performShare, type ShareMethod} from '@/lib/share'

export type PlayerShareContext = {
  albumSlug: string
  albumId?: string
  albumTitle?: string
  albumArtist?: string
}

function clean(s?: string | null) {
  const t = (s ?? '').toString().trim()
  return t.length ? t : undefined
}

export async function shareAlbum(
  ctx: PlayerShareContext,
  opts?: {methodHint?: ShareMethod; origin?: string}
) {
  const target = buildShareTarget({
    type: 'album',
    methodHint: opts?.methodHint,
    origin: opts?.origin,
    album: {
      slug: ctx.albumSlug,
      id: ctx.albumId,
      title: clean(ctx.albumTitle) ?? 'Album',
      artistName: clean(ctx.albumArtist),
    },
  })
  return performShare(target)
}

export async function shareTrack(
  ctx: PlayerShareContext,
  t: PlayerTrack,
  opts?: {methodHint?: ShareMethod; origin?: string}
) {
  const target = buildShareTarget({
    type: 'track',
    methodHint: opts?.methodHint,
    origin: opts?.origin,
    album: {
      slug: ctx.albumSlug,
      id: ctx.albumId,
      title: clean(ctx.albumTitle) ?? 'Album',
      artistName: clean(ctx.albumArtist ?? t.artist),
    },
    track: {
      id: t.id,
      title: clean(t.title) ?? t.id,
    },
  })
  return performShare(target)
}

export function deriveShareContext(args: {
  albumSlug: string
  album: AlbumInfo | null
  queueArtist?: string
  albumId?: string
}): PlayerShareContext {
  return {
    albumSlug: args.albumSlug,
    albumId: args.albumId ?? args.album?.id,
    albumTitle: clean(args.album?.title),
    albumArtist: clean(args.album?.artist ?? args.queueArtist),
  }
}
