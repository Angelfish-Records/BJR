// web/lib/albumOffers.ts
import { ENT } from "./entitlementVocab";

const GOD_DEFEND_PRICE_ID = process.env.STRIPE_PRICE_ALBUM_GOD_DEFEND ?? "";

export type AlbumOfferAsset = {
  id: string;
  label: string;
  r2Key: string; // object key in the bucket
  filename: string;
  contentType: string;
  kind: "format" | "archive";
  selectorLabel?: string;
  recommended?: boolean;
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
        id: "flac_zip",
        label: "Download FLAC",
        selectorLabel: "FLAC",
        recommended: true,
        kind: "format",
        r2Key: "albums/god-defend/god-defend-flac.zip",
        filename: "GOD DEFEND - FLAC.zip",
        contentType: "application/zip",
      },
      {
        id: "mp3_zip",
        label: "Download MP3",
        selectorLabel: "MP3",
        kind: "format",
        r2Key: "albums/god-defend/god-defend-mp3.zip",
        filename: "GOD DEFEND - MP3.zip",
        contentType: "application/zip",
      },
      {
        id: "wav_zip",
        label: "Download WAV",
        selectorLabel: "WAV",
        kind: "format",
        r2Key: "albums/god-defend/god-defend-wav.zip",
        filename: "GOD DEFEND - WAV.zip",
        contentType: "application/zip",
      },
      {
        id: "bundle_zip",
        label: "Complete archive — all formats",
        kind: "archive",
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
    // Enforce at least one downloadable asset and unique asset IDs.
    if (!Array.isArray(v.assets) || v.assets.length === 0) {
      throw new Error(`ALBUM_OFFERS[${k}] must define assets[]`);
    }

    const assetIds = new Set<string>();
    for (const asset of v.assets) {
      if (assetIds.has(asset.id)) {
        throw new Error(
          `ALBUM_OFFERS[${k}] contains duplicate asset id "${asset.id}"`,
        );
      }
      assetIds.add(asset.id);
    }
  }
}

export function getAlbumOffer(slug: string): AlbumOffer | null {
  const k = (slug ?? "").toString().trim().toLowerCase();
  return ALBUM_OFFERS[k] ?? null;
}
