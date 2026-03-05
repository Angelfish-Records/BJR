// web/app/api/lyrics/catalogue/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

export const runtime = "nodejs";
export const revalidate = 300;

type CatalogueTrack = {
  recordingId: string; // the id we will link with (legacy id OR catalogueId — whichever has lyrics)
  title: string | null;
  artist: string | null;
  trackCatalogueId: string | null;
  trackNo: number; // ✅ ordinal in the album tracklist (1-based)
};

type CatalogueAlbum = {
  albumId: string;
  albumSlug: string | null;
  albumTitle: string | null;
  albumCatalogueId: string | null;
  coverUrl: string | null; // ✅ album artwork URL (same idea as FullPlayer)
  tracks: CatalogueTrack[];
  recordingIds: string[]; // legacy-ish surface: list of returned recordingId values
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
    artwork?: unknown; // ✅
    tracks?: Array<{
      id?: string | null; // legacy
      catalogueId?: string | null; // canonical
      title?: string | null;
      artist?: string | null;
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
              id,
              catalogueId,
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

        const coverUrl =
          a?.artwork
            ? urlFor(a.artwork).width(300).height(300).quality(80).url()
            : null;

        const normTracks: CatalogueTrack[] = [];
        const seen = new Set<string>();

        // ✅ preserve album tracklist ordinals even if some tracks are skipped
        for (let idx = 0; idx < tracksRaw.length; idx++) {
          const t = tracksRaw[idx];
          const legacyId = asTrimmedString(t?.id);
          const catId = asTrimmedString(t?.catalogueId);

          // Pick whichever identifier actually has lyrics
          const picked =
            (legacyId && lyricIdSet.has(legacyId) ? legacyId : "") ||
            (catId && lyricIdSet.has(catId) ? catId : "");

          if (!picked) continue;
          if (seen.has(picked)) continue;
          seen.add(picked);

          normTracks.push({
            recordingId: picked,
            title: asTrimmedString(t?.title) || null,
            artist: asTrimmedString(t?.artist) || null,
            trackCatalogueId: catId || null,
            trackNo: idx + 1,
          });
        }

        const recordingIds = uniqNonEmpty(normTracks.map((t) => t.recordingId));

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
      // drop albums that ended up with zero eligible tracks
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
