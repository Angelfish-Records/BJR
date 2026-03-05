// web/lib/albums.ts
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import type {
  AlbumInfo,
  PlayerTrack,
  TierName,
  LyricCue,
  AlbumPlayerBundle,
} from "@/lib/types";
import {
  makeAlbumPlayerBundle,
  normalizeLyricCuesFromSanity,
} from "@/lib/types";

type AlbumDoc = {
  _id?: string;
  catalogueId?: string | null;
  title?: string;
  artist?: string;
  year?: number;
  description?: string;
  artwork?: unknown;
  visualTheme?: string;
  publicPageVisible?: boolean;
  releaseAt?: string;
  embargoNote?: string;
  earlyAccessEnabled?: boolean;
  earlyAccessTiers?: string[];
  minTierToLoad?: string;
  platformLinks?: Array<{
    platform?: string;
    url?: string;
  }>;
  tracks?: Array<{
    recordingId: string;
    catalogueId?: string | null;
    title?: string;
    artist?: string;
    durationMs?: number;
    muxPlaybackId?: string;
    visualTheme?: string;
    explicit?: boolean;
  }>;
};

type TrackLyricsDoc = {
  recordingId?: string;
  offsetMs?: number;
  cues?: Array<{ _key?: string; tMs?: number; text?: string; endMs?: number }>;
};

export async function getFeaturedAlbumSlugFromSanity(): Promise<{
  slug: string | null;
  fallbackSlug: string | null;
}> {
  const q = `
    *[_type == "siteFlags"]
      | order(_updatedAt desc)[0]{
        "slug": featuredAlbum->slug.current,
        "fallbackSlug": featuredAlbumFallbackSlug
      }
  `;

  const res = await client.fetch<{
    slug?: string | null;
    fallbackSlug?: string | null;
  }>(q, {}, { next: { tags: ["siteFlags"] } });

  return {
    slug:
      typeof res?.slug === "string" && res.slug.trim() ? res.slug.trim() : null,
    fallbackSlug:
      typeof res?.fallbackSlug === "string" && res.fallbackSlug.trim()
        ? res.fallbackSlug.trim()
        : null,
  };
}

export type AlbumBrowseItem = {
  id: string;
  slug: string;
  catalogueId?: string | null;
  title: string;
  artist?: string;
  year?: number;
  artwork?: unknown;
  artworkUrl?: string | null;

  // raw fields from GROQ
  publicPageVisible?: boolean;
  minTierToLoad?: string;

  policy?: {
    publicPageVisible: boolean;
    minTierToLoad?: string | null;
  };
};

function normStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

function normTheme(v: unknown): string | undefined {
  const s = normStr(v);
  return s && s !== "" ? s : undefined;
}

function parseTierName(v: unknown): TierName | null {
  const s = normStr(v);
  if (!s) return null;
  if (s === "friend" || s === "patron" || s === "partner") return s;
  return null;
}

function parseTierNameArray(v: unknown): TierName[] {
  if (!Array.isArray(v)) return [];
  return v.map(parseTierName).filter((x): x is TierName => x !== null);
}

export async function getAlbumBySlug(slug: string): Promise<AlbumPlayerBundle> {
  const q = `
    *[_type == "album" && slug.current == $slug][0]{
      _id,
      catalogueId,
      title,
      artist,
      year,
      description,
      artwork,
      visualTheme,
      publicPageVisible,
      releaseAt,
      embargoNote,
      earlyAccessEnabled,
      earlyAccessTiers,
      minTierToLoad,
      platformLinks[]{
        platform,
        url
      },
      "tracks": tracks[]{
        recordingId,
        catalogueId,
        title,
        artist,
        durationMs,
        muxPlaybackId,
        visualTheme,
        explicit
      }
    }
  `;

  const doc = await client.fetch<AlbumDoc | null>(q, { slug });

  if (!doc?._id) {
    return makeAlbumPlayerBundle({
      albumSlug: slug,
      album: null,
      tracks: [],
      albumLyrics: null,
    });
  }

  const albumCatalogueId = normStr(doc.catalogueId) ?? undefined;
  const albumTheme = normTheme(doc.visualTheme);

  const releaseAt = doc.releaseAt ?? null;
  const releaseAtMs = releaseAt ? Date.parse(releaseAt) : NaN;
  const isEmbargoedByDate = Boolean(
    releaseAt && Number.isFinite(releaseAtMs) && releaseAtMs > Date.now(),
  );

  const embargoNote = normStr(doc.embargoNote) ?? null;

  const album: AlbumInfo = {
    id: doc._id,
    catalogueId: albumCatalogueId,
    title: doc.title ?? "Untitled",
    artist: normStr(doc.artist),
    year:
      typeof doc.year === "number" && Number.isFinite(doc.year)
        ? doc.year
        : undefined,
    description: normStr(doc.description),
    artworkUrl: doc.artwork
      ? urlFor(doc.artwork).width(900).height(900).quality(85).url()
      : null,
    platformLinks: Array.isArray(doc.platformLinks)
      ? doc.platformLinks
          .filter(
            (p): p is { platform: string; url: string } =>
              typeof p?.platform === "string" && typeof p?.url === "string",
          )
          .map((p) => ({
            platform: p.platform,
            url: p.url,
          }))
      : [],
    policy: {
      publicPageVisible: doc.publicPageVisible !== false,
      releaseAt: doc.releaseAt ?? null,
      earlyAccessEnabled: !!doc.earlyAccessEnabled,
      earlyAccessTiers: parseTierNameArray(doc.earlyAccessTiers),
      minTierToLoad: parseTierName(doc.minTierToLoad),
    },
    embargo: {
      embargoed: isEmbargoedByDate,
      releaseAt,
      note: embargoNote,
    },
  };

    const tracks: PlayerTrack[] = Array.isArray(doc.tracks)
    ? doc.tracks
        .filter((t) => typeof t?.recordingId === "string" && t.recordingId.trim())
        .map((t) => {
          const raw = t.durationMs;
          const n =
            typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
          const trackTheme = normTheme(t.visualTheme);

          return {
            recordingId: t.recordingId.trim(),
            catalogueId: normStr(t.catalogueId) ?? null,
            title: normStr(t.title),
            artist: normStr(t.artist),
            muxPlaybackId: normStr(t.muxPlaybackId),
            durationMs: typeof n === "number" && n > 0 ? n : undefined,
            visualTheme: trackTheme ?? albumTheme,
            explicit: t.explicit === true,
          };
        })
    : [];

  const recordingIds = tracks
    .map((t) => t.recordingId)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  const lyricsQ = `
    *[_type == "lyrics" && recordingId in $recordingIds]{
      recordingId,
      offsetMs,
      cues[]{ _key, tMs, text, endMs }
    }
  `;

  const lyricDocs = recordingIds.length
    ? await client.fetch<TrackLyricsDoc[]>(lyricsQ, { recordingIds })
    : [];

  const cuesByRecordingId: Record<string, LyricCue[]> = {};
  const offsetByRecordingId: Record<string, number> = {};

  for (const d of Array.isArray(lyricDocs) ? lyricDocs : []) {
    const id = d?.recordingId;
    if (!id) continue;
    cuesByRecordingId[id] = normalizeLyricCuesFromSanity(d.cues);
    offsetByRecordingId[id] =
      typeof d.offsetMs === "number" && Number.isFinite(d.offsetMs)
        ? Math.floor(d.offsetMs)
        : 0;
  }

  return makeAlbumPlayerBundle({
    albumSlug: slug,
    album,
    tracks,
    albumLyrics: { cuesByRecordingId, offsetByRecordingId },
  });
}

export async function listAlbumsForBrowse(): Promise<AlbumBrowseItem[]> {
  const q = `
    *[_type=="album"]|order(year desc, _createdAt desc){
      "id": _id,
      "catalogueId": catalogueId,
      "slug": slug.current,
      title,
      artist,
      year,
      artwork,
      publicPageVisible,
      minTierToLoad
    }
  `;

  const data = await client.fetch<AlbumBrowseItem[]>(q);

  const items = Array.isArray(data) ? data : [];
  return items.map((a) => ({
    ...a,
    catalogueId: normStr(a.catalogueId) ?? null,
    artist: normStr(a.artist),
    title: a.title ?? "Untitled",
    artworkUrl: a.artwork
      ? urlFor(a.artwork).width(600).height(600).quality(80).url()
      : null,
    policy: {
      publicPageVisible: a.publicPageVisible !== false,
      minTierToLoad: parseTierName(a.minTierToLoad),
    },
  }));
}

export type AlbumEmailMeta = {
  slug: string;
  title: string;
  artist?: string;
  artworkUrl?: string | null;
};

export async function getAlbumEmailMetaBySlug(
  slug: string,
): Promise<AlbumEmailMeta | null> {
  const s = (slug ?? "").trim().toLowerCase();
  if (!s) return null;

  const q = `
    *[_type == "album" && slug.current == $slug][0]{
      "slug": slug.current,
      title,
      artist,
      artwork
    }
  `;

  const doc = await client.fetch<{
    slug?: string;
    title?: string;
    artist?: string;
    artwork?: unknown;
  } | null>(q, { slug: s });
  if (!doc?.slug) return null;

  return {
    slug: doc.slug,
    title: doc.title ?? "Untitled",
    artist: normStr(doc.artist),
    artworkUrl: doc.artwork
      ? urlFor(doc.artwork).width(900).height(900).quality(85).url()
      : null,
  };
}
