// web/lib/albumOffers.ts
import { ENT } from "./entitlementVocab";

const GOD_DEFEND_PRICE_ID = process.env.STRIPE_PRICE_ALBUM_GOD_DEFEND ?? "";

export type AlbumOfferAsset = {
  id: "bundle_zip" | string;
  label: string;
  r2Key: string; // object key in the bucket
  filename: string;
  contentType: string;
};

export type AlbumOffer = {
  albumSlug: string;
  title: string;
  artistName?: string;
  priceLabel?: string;
  stripePriceId: string;
  entitlementKey: string;
  includes: string[];
  assets: AlbumOfferAsset[];
};

export const ALBUM_OFFERS: Record<string, AlbumOffer> = {
  "god-defend": {
    albumSlug: "god-defend",
    title: "GOD DEFEND",
    artistName: "Brendan John Roch",
    priceLabel: "$10 NZD",
    stripePriceId: GOD_DEFEND_PRICE_ID,
    entitlementKey: ENT.downloadAlbum("god-defend"),
    includes: ["FLAC", "WAV", "MP3", "Lyrics PDF"],
    assets: [
      {
        id: "bundle_zip",
        label: "GOD DEFEND (ZIP bundle)",
        r2Key: "albums/god-defend/god-defend.zip",
        filename: "GOD DEFEND.zip",
        contentType: "application/zip",
      },
    ],
  },
};

if (process.env.NODE_ENV !== "production") {
  for (const [k, v] of Object.entries(ALBUM_OFFERS)) {
    const key = k.trim().toLowerCase();
    const slug = (v.albumSlug ?? "").toString().trim().toLowerCase();
    if (key !== slug) {
      throw new Error(
        `ALBUM_OFFERS key mismatch: key="${k}" vs albumSlug="${v.albumSlug}"`,
      );
    }
    // enforce at least one downloadable asset
    if (!Array.isArray(v.assets) || v.assets.length === 0) {
      throw new Error(`ALBUM_OFFERS[${k}] must define assets[]`);
    }
  }
}

export function getAlbumOffer(slug: string): AlbumOffer | null {
  const k = (slug ?? "").toString().trim().toLowerCase();
  return ALBUM_OFFERS[k] ?? null;
}
