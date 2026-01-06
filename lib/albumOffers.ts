// web/lib/albumOffers.ts
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
    stripePriceId: 'price_1SmNcsQVwozbpzk4awZ9x12h',
    entitlementKey: ENT.downloadAlbum('afterglow'),
    includes: ['WAV', 'MP3', 'Lyrics PDF'],
  },
}

// Hardening B: ensure config is self-consistent (dev-only).
if (process.env.NODE_ENV !== 'production') {
  for (const [k, v] of Object.entries(ALBUM_OFFERS)) {
    const key = k.trim().toLowerCase()
    const slug = (v.albumSlug ?? '').toString().trim().toLowerCase()
    if (key !== slug) {
    throw new Error(`ALBUM_OFFERS key mismatch: key="${k}" vs albumSlug="${v.albumSlug}"`)

    }
  }
}

/**
 * Safe lookup helper (Hardening A)
 */
export function getAlbumOffer(slug: string): AlbumOffer | null {
  const k = (slug ?? '').toString().trim().toLowerCase()
  return ALBUM_OFFERS[k] ?? null
}
