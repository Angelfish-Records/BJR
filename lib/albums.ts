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
    displayId?: string;
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

function slugifySeg(v: string): string {
  // safe for URLs and stable-ish: lowercase, hyphens, strip junk
  return v
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function fallbackDisplayId(args: {
  title?: string;
  trackNo: number; // 1-based
}): string {
  const base = slugifySeg(args.title ?? "");
  // always produce something
  return base
    ? `${String(args.trackNo).padStart(2, "0")}-${base}`
    : `track-${String(args.trackNo).padStart(2, "0")}`;
}

function uniqifyDisplayId(desired: string, used: Set<string>): string {
  let d = desired;
  let i = 2;
  while (used.has(d)) {
    d = `${desired}-${i}`;
    i++;
  }
  used.add(d);
  return d;
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
        displayId,
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
    ? (() => {
        const used = new Set<string>();

        return doc.tracks
          .filter(
            (t) => typeof t?.recordingId === "string" && t.recordingId.trim(),
          )
          .map((t, idx) => {
            const rawDur = t.durationMs;
            const dur =
              typeof rawDur === "number" && Number.isFinite(rawDur)
                ? rawDur
                : undefined;

            const albumOrdinal = idx + 1;

            const recordingId = t.recordingId.trim();

            const wanted =
              normStr(t.displayId) ??
              fallbackDisplayId({ title: t.title, trackNo: albumOrdinal });

            const displayId = uniqifyDisplayId(wanted, used);

            const trackTheme = normTheme(t.visualTheme);

            return {
              recordingId,
              displayId,
              title: normStr(t.title),
              artist: normStr(t.artist),
              muxPlaybackId: normStr(t.muxPlaybackId),
              durationMs: typeof dur === "number" && dur > 0 ? dur : undefined,
              visualTheme: trackTheme ?? albumTheme,
              explicit: t.explicit === true,
            };
          });
      })()
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
    const id = (d?.recordingId ?? "").trim();
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

export async function getRecordingSummaryByRecordingId(
  recordingId: string,
): Promise<RecordingSummary | null> {
  const id = normStr(recordingId);
  if (!id) return null;

  const q = `
    *[_type == "album" && count(tracks[recordingId == $recordingId]) > 0][0]{
      "albumSlug": slug.current,
      "albumTitle": title,
      "albumArtist": artist,
      "track": tracks[recordingId == $recordingId][0]{
        recordingId,
        title,
        artist
      }
    }
  `;

  const doc = await client.fetch<{
    albumSlug?: string;
    albumTitle?: string;
    albumArtist?: string;
    track?: {
      recordingId?: string;
      title?: string;
      artist?: string;
    };
  } | null>(q, { recordingId: id });

  const trackRecordingId = normStr(doc?.track?.recordingId);
  const trackTitle = normStr(doc?.track?.title);
  if (!trackRecordingId || !trackTitle) return null;

  return {
    recordingId: trackRecordingId,
    title: trackTitle,
    artist: normStr(doc?.track?.artist) ?? normStr(doc?.albumArtist) ?? null,
    albumSlug: normStr(doc?.albumSlug) ?? null,
    albumTitle: normStr(doc?.albumTitle) ?? null,
  };
}

export type RecordingSummary = {
  recordingId: string;
  title: string;
  artist?: string | null;
  albumSlug?: string | null;
  albumTitle?: string | null;
};

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
