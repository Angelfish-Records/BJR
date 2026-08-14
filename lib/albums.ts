// web/lib/albums.ts
import { unstable_cache } from "next/cache";
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
import { getRecordingPlayCountsByRecordingIds } from "@/lib/recordingListenTotals";
import { isReleaseEmbargoed } from "@/lib/embargo";

export type AlbumDocTrack = {
  recordingId: string;
  displayId?: string;
  title?: string;
  artist?: string;
  durationMs?: number;
  muxPlaybackId?: string;
  visualTheme?: string;
  explicit?: boolean;
};

type AlbumDoc = {
  _id?: string;
  catalogueId?: string | null;
  slug?: string | null;
  title?: string;
  displayTitle?: string | null;
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
  tracks?: AlbumDocTrack[];
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
  const res = await getCachedFeaturedAlbumSlugDoc();

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

export type NormalizedAlbumTrack = {
  recordingId: string;
  displayId: string;
  title?: string;
  artist?: string;
  muxPlaybackId?: string;
  durationMs?: number;
  visualTheme?: string;
  explicit?: boolean;
  trackNo: number;
};

export function normalizeAlbumTracks(
  tracks: AlbumDocTrack[] | null | undefined,
  args?: { albumTheme?: string },
): NormalizedAlbumTrack[] {
  const albumTheme = normTheme(args?.albumTheme);
  if (!Array.isArray(tracks)) return [];

  const used = new Set<string>();

  return tracks
    .filter((t) => typeof t?.recordingId === "string" && t.recordingId.trim())
    .map((t, idx) => {
      const rawDur = t.durationMs;
      const dur =
        typeof rawDur === "number" && Number.isFinite(rawDur)
          ? rawDur
          : undefined;

      const trackNo = idx + 1;
      const recordingId = t.recordingId.trim();

      const wanted =
        normStr(t.displayId) ?? fallbackDisplayId({ title: t.title, trackNo });

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
        trackNo,
      };
    });
}

type FeaturedAlbumSlugDoc = {
  slug?: string | null;
  fallbackSlug?: string | null;
};

const STATIC_CATALOGUE_REVALIDATE_SECONDS = 60 * 60;

const featuredAlbumSlugQuery = `
  *[_type == "siteFlags"]
    | order(_updatedAt desc)[0]{
      "slug": featuredAlbum->slug.current,
      "fallbackSlug": featuredAlbumFallbackSlug
    }
`;

const albumBySlugQuery = `
  *[_type == "album" && slug.current == $slug][0]{
    _id,
    catalogueId,
    "slug": slug.current,
    title,
    displayTitle,
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

const lyricsByRecordingIdsQuery = `
  *[_type == "lyrics" && recordingId in $recordingIds]{
    recordingId,
    offsetMs,
    cues[]{ _key, tMs, text, endMs }
  }
`;

const albumBrowseQuery = `
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

const getCachedFeaturedAlbumSlugDoc = unstable_cache(
  async (): Promise<FeaturedAlbumSlugDoc | null> => {
    return client.fetch<FeaturedAlbumSlugDoc | null>(featuredAlbumSlugQuery);
  },
  ["featured-album-slug-v1"],
  {
    revalidate: STATIC_CATALOGUE_REVALIDATE_SECONDS,
    tags: ["siteFlags"],
  },
);

const getCachedAlbumDocumentBySlug = unstable_cache(
  async (slug: string): Promise<AlbumDoc | null> => {
    return client.fetch<AlbumDoc | null>(albumBySlugQuery, { slug });
  },
  ["album-document-by-slug-v1"],
  {
    revalidate: STATIC_CATALOGUE_REVALIDATE_SECONDS,
    tags: ["albums"],
  },
);

const getCachedLyricsByRecordingIds = unstable_cache(
  async (recordingIds: string[]): Promise<TrackLyricsDoc[]> => {
    if (recordingIds.length === 0) return [];

    const docs = await client.fetch<TrackLyricsDoc[]>(
      lyricsByRecordingIdsQuery,
      { recordingIds },
    );

    return Array.isArray(docs) ? docs : [];
  },
  ["album-lyrics-by-recording-ids-v1"],
  {
    revalidate: STATIC_CATALOGUE_REVALIDATE_SECONDS,
    tags: ["lyrics"],
  },
);

const getCachedAlbumBrowseDocs = unstable_cache(
  async (): Promise<AlbumBrowseItem[]> => {
    const docs = await client.fetch<AlbumBrowseItem[]>(albumBrowseQuery);
    return Array.isArray(docs) ? docs : [];
  },
  ["album-browse-list-v1"],
  {
    revalidate: STATIC_CATALOGUE_REVALIDATE_SECONDS,
    tags: ["albums"],
  },
);

export type AlbumPlaybackAssetVerification = {
  ok: boolean;
  albumId: string;
  playbackId: string;
  trackId: string | null;
  matchedRecordingId: string | null;
};

export type AlbumPlaybackSessionAsset = {
  recordingId: string;
  displayId: string;
  playbackId: string;
  durationMs?: number;
};

type AlbumPlaybackSessionTrackDoc = {
  recordingId?: string;
  displayId?: string;
  muxPlaybackId?: string;
  durationMs?: number;
};

function normalizeAlbumPlaybackSessionAsset(
  track: AlbumPlaybackSessionTrackDoc,
): AlbumPlaybackSessionAsset | null {
  const recordingId = normStr(track.recordingId);
  const displayId = normStr(track.displayId);
  const playbackId = normStr(track.muxPlaybackId);

  if (!recordingId || !displayId || !playbackId) return null;

  const durationMs =
    typeof track.durationMs === "number" &&
    Number.isFinite(track.durationMs) &&
    track.durationMs > 0
      ? Math.floor(track.durationMs)
      : undefined;

  return {
    recordingId,
    displayId,
    playbackId,
    ...(typeof durationMs === "number" ? { durationMs } : {}),
  };
}

function normalizeAlbumScopeId(raw: string): string {
  let s = (raw ?? "").trim();
  while (s.startsWith("alb:")) s = s.slice(4);
  return s.trim();
}

export async function getAlbumPlaybackAssetsForSession(params: {
  albumId: string;
}): Promise<{
  ok: boolean;
  albumId: string;
  albumScopeId: string;
  tracks: AlbumPlaybackSessionAsset[];
}> {
  const albumId = normalizeAlbumScopeId(params.albumId);

  if (!albumId) {
    return {
      ok: false,
      albumId,
      albumScopeId: "",
      tracks: [],
    };
  }

  const q = `
    *[
      _type == "album" &&
      (
        _id == $albumId ||
        catalogueId == $albumId
      )
    ][0]{
      _id,
      catalogueId,
      "tracks": tracks[
        defined(recordingId) &&
        defined(displayId) &&
        defined(muxPlaybackId)
      ]{
        recordingId,
        displayId,
        muxPlaybackId,
        durationMs
      }
    }
  `;

  const doc = await client.fetch<{
    _id?: string;
    catalogueId?: string | null;
    tracks?: AlbumPlaybackSessionTrackDoc[];
  } | null>(q, { albumId }, { next: { tags: ["albums"] } });

  const resolvedAlbumId = normStr(doc?.catalogueId) ?? normStr(doc?._id) ?? "";
  const albumScopeId = resolvedAlbumId ? `alb:${resolvedAlbumId}` : "";

  const tracks = (Array.isArray(doc?.tracks) ? doc.tracks : [])
    .map(normalizeAlbumPlaybackSessionAsset)
    .filter(
      (track): track is AlbumPlaybackSessionAsset => track !== null,
    );

  return {
    ok: Boolean(resolvedAlbumId && tracks.length > 0),
    albumId: resolvedAlbumId,
    albumScopeId,
    tracks,
  };
}

export async function verifyAlbumPlaybackAsset(params: {
  albumId: string;
  playbackId: string;
  trackId?: string | null;
}): Promise<AlbumPlaybackAssetVerification> {
  const albumId = normalizeAlbumScopeId(params.albumId);
  const playbackId = normStr(params.playbackId) ?? "";
  const trackId = normStr(params.trackId) ?? null;

  if (!albumId || !playbackId) {
    return {
      ok: false,
      albumId,
      playbackId,
      trackId,
      matchedRecordingId: null,
    };
  }

  const q = `
    *[
      _type == "album" &&
      (
        _id == $albumId ||
        catalogueId == $albumId
      )
    ][0]{
      "matches": tracks[
        defined(muxPlaybackId) &&
        muxPlaybackId == $playbackId
      ]{
        recordingId,
        displayId,
        muxPlaybackId
      }
    }
  `;

  const doc = await client.fetch<{
    matches?: Array<{
      recordingId?: string;
      displayId?: string;
      muxPlaybackId?: string;
    }>;
  } | null>(q, { albumId, playbackId }, { next: { tags: ["albums"] } });

  const matches = Array.isArray(doc?.matches) ? doc.matches : [];

  const matched = matches.find((t) => {
    const recordingId = normStr(t.recordingId);
    const displayId = normStr(t.displayId);
    const muxPlaybackId = normStr(t.muxPlaybackId);

    if (muxPlaybackId !== playbackId) return false;
    if (!trackId) return true;

    return recordingId === trackId || displayId === trackId;
  });

  return {
    ok: Boolean(matched),
    albumId,
    playbackId,
    trackId,
    matchedRecordingId: normStr(matched?.recordingId) ?? null,
  };
}

export async function getAlbumBySlug(slug: string): Promise<AlbumPlayerBundle> {
  const albumSlug = (slug ?? "").trim().toLowerCase();

  if (!albumSlug) {
    return makeAlbumPlayerBundle({
      albumSlug: "",
      album: null,
      tracks: [],
      albumLyrics: null,
    });
  }

  const doc = await getCachedAlbumDocumentBySlug(albumSlug);

  if (!doc?._id) {
    return makeAlbumPlayerBundle({
      albumSlug,
      album: null,
      tracks: [],
      albumLyrics: null,
    });
  }

  const albumCatalogueId = normStr(doc.catalogueId) ?? undefined;
  const albumTheme = normTheme(doc.visualTheme);

  // This remains outside the long-lived catalogue cache. An album must become
  // non-embargoed as its release timestamp passes, without a fresh publish.
  const releaseAt = doc.releaseAt ?? null;
  const isEmbargoedByDate = isReleaseEmbargoed(releaseAt);

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

  const tracks: PlayerTrack[] = normalizeAlbumTracks(doc.tracks, {
    albumTheme,
  }).map((t) => ({
    recordingId: t.recordingId,
    displayId: t.displayId,
    title: t.title,
    artist: t.artist,
    muxPlaybackId: t.muxPlaybackId,
    durationMs: t.durationMs,
    visualTheme: t.visualTheme,
    explicit: t.explicit,
  }));

  const recordingIds = tracks
    .map((t) => t.recordingId)
    .filter((recordingId): recordingId is string => recordingId.length > 0);

  const lyricRecordingIds = isEmbargoedByDate
    ? []
    : Array.from(new Set(recordingIds)).sort((a, b) => a.localeCompare(b));

  const [playCountsByRecordingId, lyricDocs] = await Promise.all([
    getRecordingPlayCountsByRecordingIds(recordingIds),
    getCachedLyricsByRecordingIds(lyricRecordingIds),
  ]);

  const tracksWithPlayCounts: PlayerTrack[] = tracks.map((t) => ({
    ...t,
    playCount: playCountsByRecordingId[t.recordingId] ?? 0,
  }));

  const cuesByRecordingId: Record<string, LyricCue[]> = {};
  const offsetByRecordingId: Record<string, number> = {};

  for (const d of lyricDocs) {
    const id = (d.recordingId ?? "").trim();
    if (!id) continue;

    cuesByRecordingId[id] = normalizeLyricCuesFromSanity(d.cues);
    offsetByRecordingId[id] =
      typeof d.offsetMs === "number" && Number.isFinite(d.offsetMs)
        ? Math.floor(d.offsetMs)
        : 0;
  }

  return makeAlbumPlayerBundle({
    albumSlug: normStr(doc.slug) ?? albumSlug,
    album,
    tracks: tracksWithPlayCounts,
    // Embargoed lyrics are never serialized into the shared session/API bundle.
    // Authorized listeners fetch them lazily through the gated by-track endpoint.
    albumLyrics: isEmbargoedByDate
      ? null
      : { cuesByRecordingId, offsetByRecordingId },
  });
}

export type AlbumCanonicalMetadata = {
  title: string | null;
  displayTitle: string | null;
  slug: string | null;
  artworkUrl: string | null;
};

export type TrackCanonicalMetadata = {
  albumTitle: string | null;
  albumDisplayTitle: string | null;
  albumSlug: string | null;
  trackTitle: string | null;
  displayId: string | null;
  artworkUrl: string | null;
};

export async function getAlbumCanonicalMetadataBySlug(
  slug: string,
): Promise<AlbumCanonicalMetadata | null> {
  const albumSlug = (slug ?? "").trim().toLowerCase();
  if (!albumSlug) return null;

  const doc = await getCachedAlbumDocumentBySlug(albumSlug);
  if (!doc?._id) return null;

  return {
    title: normStr(doc.title) ?? null,
    displayTitle: normStr(doc.displayTitle) ?? null,
    slug: normStr(doc.slug) ?? null,
    artworkUrl: doc.artwork
      ? urlFor(doc.artwork).width(1200).height(1200).quality(90).url()
      : null,
  };
}

export async function getTrackCanonicalMetadataBySlugAndDisplayId(params: {
  slug: string;
  displayId: string;
}): Promise<TrackCanonicalMetadata | null> {
  const albumSlug = (params.slug ?? "").trim().toLowerCase();
  const requestedDisplayId = (params.displayId ?? "").trim();

  if (!albumSlug || !requestedDisplayId) return null;

  const doc = await getCachedAlbumDocumentBySlug(albumSlug);
  if (!doc?._id) return null;

  const matchingTrack =
    doc.tracks?.find(
      (track) => normStr(track.displayId) === requestedDisplayId,
    ) ?? null;

  return {
    albumTitle: normStr(doc.title) ?? null,
    albumDisplayTitle: normStr(doc.displayTitle) ?? null,
    albumSlug: normStr(doc.slug) ?? null,
    trackTitle: normStr(matchingTrack?.title) ?? null,
    displayId: normStr(matchingTrack?.displayId) ?? null,
    artworkUrl: doc.artwork
      ? urlFor(doc.artwork).width(1200).height(1200).quality(90).url()
      : null,
  };
}

export async function listAlbumsForBrowse(): Promise<AlbumBrowseItem[]> {
  const items = await getCachedAlbumBrowseDocs();
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

export type RecordingSearchResult = {
  recordingId: string;
  title: string;
  artist?: string | null;
  albumSlug?: string | null;
  albumTitle?: string | null;
};

export async function searchRecordingsForAdmin(args: {
  query: string;
  limit?: number;
}): Promise<RecordingSearchResult[]> {
  const rawQuery = normStr(args.query);
  if (!rawQuery) return [];

  const limit = Math.max(1, Math.min(25, Math.floor(args.limit ?? 12)));

  const wildcard = `*${rawQuery}*`;
  const exactId = rawQuery;

  const q = `
    *[
      _type == "album" &&
      count(
        tracks[
          defined(recordingId) && (
            recordingId == $exactId ||
            recordingId match $wildcard ||
            title match $wildcard ||
            artist match $wildcard
          )
        ]
      ) > 0
    ] | order(title asc) {
      "albumSlug": slug.current,
      "albumTitle": title,
      "albumArtist": artist,
      "matches": tracks[
        defined(recordingId) && (
          recordingId == $exactId ||
          recordingId match $wildcard ||
          title match $wildcard ||
          artist match $wildcard
        )
      ]{
        recordingId,
        title,
        artist
      }
    }
  `;

  const docs = await client.fetch<
    Array<{
      albumSlug?: string;
      albumTitle?: string;
      albumArtist?: string;
      matches?: Array<{
        recordingId?: string;
        title?: string;
        artist?: string;
      }>;
    }>
  >(q, {
    exactId,
    wildcard,
  });

  const flattened: RecordingSearchResult[] = [];
  const seen = new Set<string>();

  for (const doc of Array.isArray(docs) ? docs : []) {
    const albumSlug = normStr(doc?.albumSlug) ?? null;
    const albumTitle = normStr(doc?.albumTitle) ?? null;
    const albumArtist = normStr(doc?.albumArtist) ?? null;

    for (const match of Array.isArray(doc?.matches) ? doc.matches : []) {
      const recordingId = normStr(match?.recordingId);
      const title = normStr(match?.title);

      if (!recordingId || !title || seen.has(recordingId)) continue;
      seen.add(recordingId);

      flattened.push({
        recordingId,
        title,
        artist: normStr(match?.artist) ?? albumArtist,
        albumSlug,
        albumTitle,
      });
    }
  }

  const normalizedQuery = rawQuery.toLowerCase();

  flattened.sort((a, b) => {
    const aId = a.recordingId.toLowerCase();
    const bId = b.recordingId.toLowerCase();
    const aTitle = a.title.toLowerCase();
    const bTitle = b.title.toLowerCase();

    const aExact = aId === normalizedQuery ? 1 : 0;
    const bExact = bId === normalizedQuery ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;

    const aTitleStarts = aTitle.startsWith(normalizedQuery) ? 1 : 0;
    const bTitleStarts = bTitle.startsWith(normalizedQuery) ? 1 : 0;
    if (aTitleStarts !== bTitleStarts) return bTitleStarts - aTitleStarts;

    const aTitleIncludes = aTitle.includes(normalizedQuery) ? 1 : 0;
    const bTitleIncludes = bTitle.includes(normalizedQuery) ? 1 : 0;
    if (aTitleIncludes !== bTitleIncludes) {
      return bTitleIncludes - aTitleIncludes;
    }

    return a.title.localeCompare(b.title);
  });

  return flattened.slice(0, limit);
}

export async function getRecordingSummaryByRecordingId(
  recordingId: string,
): Promise<RecordingSummary | null> {
  const id = normStr(recordingId);
  if (!id) return null;

  const q = `
        *[_type == "album" && count(tracks[recordingId == $recordingId]) > 0][0]{
      "albumCatalogueId": catalogueId,
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
    albumCatalogueId?: string;
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
    albumCatalogueId: normStr(doc?.albumCatalogueId) ?? null,
    albumSlug: normStr(doc?.albumSlug) ?? null,
    albumTitle: normStr(doc?.albumTitle) ?? null,
  };
}

export type RecordingSummary = {
  recordingId: string;
  title: string;
  artist?: string | null;
  albumCatalogueId?: string | null;
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
