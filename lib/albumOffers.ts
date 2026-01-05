import {ENT} from './vocab'

export type AlbumOffer = {
  albumSlug: string
  title: string
  stripePriceId: string
  entitlementKey: string
  includes: string[]
}

export const ALBUM_OFFERS: Record<string, AlbumOffer> = {
  afterglow: {
    albumSlug: 'afterglow',
    title: 'Afterglow',
    stripePriceId: 'price_REPLACE_ME',
    entitlementKey: ENT.downloadAlbum('afterglow'),
    includes: ['WAV', 'MP3', 'Lyrics PDF'],
  },
}

/**
 * Safe lookup helper
 */
export function getAlbumOffer(slug: string): AlbumOffer | null {
  return ALBUM_OFFERS[slug] ?? null
}
