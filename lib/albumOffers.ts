// web/lib/albumOffers.ts
import {ENT} from './vocab'

export type AlbumOfferAsset = {
  id: 'bundle_zip' | string
  label: string
  r2Key: string // object key in the bucket
  filename: string
  contentType: string
}

export type AlbumOffer = {
  albumSlug: string
  title: string
  stripePriceId: string
  entitlementKey: string
  includes: string[]
  assets: AlbumOfferAsset[]
}

export const ALBUM_OFFERS: Record<string, AlbumOffer> = {
  afterglow: {
    albumSlug: 'afterglow',
    title: 'Afterglow',
    stripePriceId: 'price_1SmNcsQVwozbpzk4awZ9x12h',
    entitlementKey: ENT.downloadAlbum('afterglow'),
    includes: ['WAV', 'MP3', 'Lyrics PDF'],
    assets: [
      {
        id: 'bundle_zip',
        label: 'Afterglow (ZIP bundle)',
        r2Key: 'albums/afterglow/afterglow.zip',
        filename: 'Afterglow.zip',
        contentType: 'application/zip',
      },
    ],
  },
}

// dev-only self-consistency check
if (process.env.NODE_ENV !== 'production') {
  for (const [k, v] of Object.entries(ALBUM_OFFERS)) {
    const key = k.trim().toLowerCase()
    const slug = (v.albumSlug ?? '').toString().trim().toLowerCase()
    if (key !== slug) {
      throw new Error(`ALBUM_OFFERS key mismatch: key="${k}" vs albumSlug="${v.albumSlug}"`)
    }
    // enforce at least one downloadable asset
    if (!Array.isArray(v.assets) || v.assets.length === 0) {
      throw new Error(`ALBUM_OFFERS[${k}] must define assets[]`)
    }
  }
}

export function getAlbumOffer(slug: string): AlbumOffer | null {
  const k = (slug ?? '').toString().trim().toLowerCase()
  return ALBUM_OFFERS[k] ?? null
}
