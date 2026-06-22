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
import { getRecordingPlayCountsByRecordingIds } from "@/lib/recordingListenTotals";

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
  args?: { albumTheme?: string | undefined },
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
    tracks?: Array<{
      recordingId?: string;
      displayId?: string;
      muxPlaybackId?: string;
      durationMs?: number;
    }>;
  } | null>(q, { albumId }, { next: { tags: ["albums"] } });

  const resolvedAlbumId = normStr(doc?.catalogueId) ?? normStr(doc?._id) ?? "";
  const albumScopeId = resolvedAlbumId ? `alb:${resolvedAlbumId}` : "";

  const tracks: AlbumPlaybackSessionAsset[] = [];

  if (Array.isArray(doc?.tracks)) {
    for (const t of doc.tracks) {
      const recordingId = normStr(t.recordingId);
      const displayId = normStr(t.displayId);
      const playbackId = normStr(t.muxPlaybackId);

      if (!recordingId || !displayId || !playbackId) continue;

      const durationMs =
        typeof t.durationMs === "number" &&
        Number.isFinite(t.durationMs) &&
        t.durationMs > 0
          ? Math.floor(t.durationMs)
          : undefined;

      tracks.push({
        recordingId,
        displayId,
        playbackId,
        ...(typeof durationMs === "number" ? { durationMs } : {}),
      });
    }
  }

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
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  const playCountsByRecordingId =
    await getRecordingPlayCountsByRecordingIds(recordingIds);

  const tracksWithPlayCounts: PlayerTrack[] = tracks.map((t) => ({
    ...t,
    playCount: playCountsByRecordingId[t.recordingId] ?? 0,
  }));

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
    tracks: tracksWithPlayCounts,
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
