// web/app/api/lyrics/catalogue/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import { normalizeAlbumTracks, type AlbumDocTrack } from "@/lib/albums";

export const runtime = "nodejs";
export const revalidate = 300;

type CatalogueTrack = {
  // ✅ canonical URL id (per-album unique)
  displayId: string;

  // ✅ canonical internal id (lyrics + exegesis)
  recordingId: string;

  title: string | null;
  artist: string | null;
  trackNo: number; // ✅ ordinal in the album tracklist (1-based)
};

type CatalogueAlbum = {
  albumId: string;
  albumSlug: string | null;
  albumTitle: string | null;
  albumCatalogueId: string | null;
  coverUrl: string | null;
  tracks: CatalogueTrack[];

  // Helpful for clients that still want an index by internal ids
  recordingIds: string[];
};

type CatalogueOk = { ok: true; albums: CatalogueAlbum[] };
type CatalogueErr = { ok: false; error: string };

type CatalogueQueryResult = {
  lyricIds?: unknown;
  albums?: Array<{
    albumId?: string;
    albumSlug?: string | null;
    albumTitle?: string | null;
    albumCatalogueId?: string | null;
    artwork?: unknown;
    tracks?: AlbumDocTrack[];
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
    const q = `
      {
        "lyricIds": *[_type == "lyrics" && defined(recordingId)].recordingId,
        "albums": *[_type == "album" && publicPageVisible != false]
          | order(year desc, title asc) {
            "albumId": _id,
            "albumTitle": title,
            "albumSlug": slug.current,
            "albumCatalogueId": catalogueId,
            artwork,
            "tracks": tracks[]{
              recordingId,
              displayId,
              title,
              artist
            }
          }
      }
    `;

    const bundle = await client.fetch<CatalogueQueryResult | null>(q);

    const lyricIdsArr = Array.isArray(bundle?.lyricIds)
      ? (bundle?.lyricIds as unknown[])
      : [];

    const lyricIdSet = new Set(
      uniqNonEmpty(lyricIdsArr.map((x) => asTrimmedString(x))),
    );

    const albumsRaw = Array.isArray(bundle?.albums) ? bundle!.albums! : [];

    const albums: CatalogueAlbum[] = albumsRaw
      .map((a) => {
        const tracksRaw = Array.isArray(a.tracks) ? a.tracks : [];

        const normTracks: CatalogueTrack[] = normalizeAlbumTracks(tracksRaw)
          .filter((t) => lyricIdSet.has(t.recordingId))
          .map((t) => ({
            recordingId: t.recordingId,
            displayId: t.displayId,
            title: t.title ?? null,
            artist: t.artist ?? null,
            trackNo: t.trackNo,
          }));

        const recordingIds = uniqNonEmpty(normTracks.map((t) => t.recordingId));

        const coverUrl = a?.artwork
          ? urlFor(a.artwork).width(300).height(300).quality(80).url()
          : null;

        return {
          albumId: asTrimmedString(a?.albumId),
          albumSlug: asTrimmedString(a?.albumSlug) || null,
          albumTitle: asTrimmedString(a?.albumTitle) || null,
          albumCatalogueId: asTrimmedString(a?.albumCatalogueId) || null,
          coverUrl,
          tracks: normTracks,
          recordingIds,
        };
      })
      .filter((g) => g.tracks.length > 0);

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
