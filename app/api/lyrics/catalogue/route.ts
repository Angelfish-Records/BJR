// web/app/api/lyrics/catalogue/route.ts
import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

type LyricsIdDoc = { trackId?: string };

type AlbumDoc = {
  _id: string;
  title?: string;
  slug?: string;
  tracks?: Array<{
    id?: string;
    title?: string;
    artist?: string;
  }>;
};

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
  const qLyrics = `*[_type == "lyrics" && defined(trackId)]{ trackId }`;

  // ✅ Pull title/artist off the referenced track doc in one go.
  // This assumes album.tracks[] items have an `id` that references a track doc with `title` (+ optionally `artist`).
  const qAlbums = `
    *[_type == "album" && publicPageVisible != false] | order(year desc, title asc) {
      _id,
      title,
      "slug": slug.current,
      "tracks": tracks[]{
        "id": id,
        "title": id->title,
        "artist": id->artist
      }
    }
  `;

  const [lyricsDocs, albums] = await Promise.all([
    client.fetch<LyricsIdDoc[]>(qLyrics),
    client.fetch<AlbumDoc[]>(qAlbums),
  ]);

  const lyricTrackIds = new Set(
    uniqNonEmpty((lyricsDocs ?? []).map((d) => String(d.trackId ?? ""))),
  );

  const albumGroups = (albums ?? [])
    .map((a) => {
      const albumTracksRaw = (a.tracks ?? []).map((t) => ({
        trackId: String(t?.id ?? "").trim(),
        title: (t?.title ?? "").trim() || null,
        artist: (t?.artist ?? "").trim() || null,
      }));

      // preserve album ordering; just filter to those with lyrics
      const tracks = albumTracksRaw.filter(
        (t) => t.trackId && lyricTrackIds.has(t.trackId),
      );

      const trackIds = tracks.map((t) => t.trackId);

      return {
        albumId: a._id,
        albumSlug: (a.slug ?? "").trim() || null,
        albumTitle: (a.title ?? "").trim() || null,

        // ✅ new
        tracks,

        // ✅ keep old for any legacy callers
        trackIds,
      };
    })
    .filter((g) => (g.trackIds ?? []).length > 0);

  return NextResponse.json(
    { ok: true, albums: albumGroups },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}