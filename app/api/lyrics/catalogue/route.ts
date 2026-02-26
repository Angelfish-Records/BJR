// web/app/api/lyrics/catalogue/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

// If you want this to be extremely fast in prod, you want CDN caching.
// This route is “browse metadata”, not per-user, not sensitive.
export const runtime = "nodejs";

// Optional: helps Next understand it can cache.
// (Even with explicit Cache-Control below, this is still useful metadata.)
export const revalidate = 300;

type CatalogueTrack = {
  trackId: string;
  title: string | null;
  artist: string | null;
  trackCatalogueId: string | null;
};

type CatalogueAlbum = {
  albumId: string;
  albumSlug: string | null;
  albumTitle: string | null;
  albumCatalogueId: string | null;
  tracks: CatalogueTrack[];
  trackIds: string[]; // legacy
};

type CatalogueOk = { ok: true; albums: CatalogueAlbum[] };
type CatalogueErr = { ok: false; error: string };

type CatalogueQueryResult = {
  albums?: Array<{
    albumId?: string;
    albumSlug?: string | null;
    albumTitle?: string | null;
    albumCatalogueId?: string | null;
    tracks?: Array<{
      trackId?: string;
      title?: string | null;
      artist?: string | null;
      trackCatalogueId?: string | null;
    }>;
  }>;
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function uniqNonEmpty(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const s = (raw ?? "").trim();
    if (!s) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

export async function GET() {
  try {
    // One fetch:
    // - Build lyric track ids
    // - Pull albums
    // - Filter tracks to only those with lyrics
    // - Drop albums with zero eligible tracks
    const q = `
      {
        "lyricIds": *[_type == "lyrics" && defined(trackId)].trackId,
        "albums": *[_type == "album" && publicPageVisible != false]
          | order(year desc, title asc) {
            "albumId": _id,
            "albumTitle": title,
            "albumSlug": slug.current,
            "albumCatalogueId": catalogueId,
            "tracks": tracks[id in ^.^.lyricIds]{
              "trackId": id,
              title,
              artist,
              "trackCatalogueId": catalogueId
            }
          }[count(tracks) > 0]
      }
    `;

    const bundle = await client.fetch<CatalogueQueryResult | null>(q);

    const albumsRaw = bundle?.albums ?? [];

    const albums: CatalogueAlbum[] = albumsRaw.map((a) => {
      const tracksRaw = Array.isArray(a.tracks) ? a.tracks : [];

      // Normalize + de-dupe by trackId (preserve order)
      const normTracks: CatalogueTrack[] = [];
      const seen = new Set<string>();

      for (const t of tracksRaw) {
        const tid = asTrimmedString(t?.trackId);
        if (!tid || seen.has(tid)) continue;
        seen.add(tid);

        normTracks.push({
          trackId: tid,
          title: asTrimmedString(t?.title) || null,
          artist: asTrimmedString(t?.artist) || null,
          trackCatalogueId: asTrimmedString(t?.trackCatalogueId) || null,
        });
      }

      const legacyTrackIds = uniqNonEmpty(normTracks.map((t) => t.trackId));

      return {
        albumId: asTrimmedString(a?.albumId),
        albumSlug: asTrimmedString(a?.albumSlug) || null,
        albumTitle: asTrimmedString(a?.albumTitle) || null,
        albumCatalogueId: asTrimmedString(a?.albumCatalogueId) || null,
        tracks: normTracks,
        trackIds: legacyTrackIds, // keep legacy surface if anything still reads it
      };
    });

    // ✅ Cache: fast “browse” endpoint.
    // - s-maxage: CDN cache
    // - stale-while-revalidate: serve instantly while refreshing in background
    return NextResponse.json<CatalogueOk>(
      { ok: true, albums },
      {
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
        },
      },
    );
  } catch {
    return NextResponse.json<CatalogueErr>(
      { ok: false, error: "catalogue_failed" },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  }
}