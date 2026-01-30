// web/lib/albums.ts
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import type { AlbumInfo, PlayerTrack, TierName } from "@/lib/types";
import type { LyricCue } from "@/app/home/player/stage/LyricsOverlay";

type AlbumDoc = {
  _id?: string;
  catalogId?: string | null;
  title?: string;
  artist?: string;
  year?: number;
  description?: string;
  artwork?: unknown;
  visualTheme?: string;
  // ⬇️ new
  publicPageVisible?: boolean;
  releaseAt?: string;
  embargoNote?: string;
  earlyAccessEnabled?: boolean;
  earlyAccessTiers?: string[];
  minTierToLoad?: string;
  tracks?: Array<{
    id: string; // legacy
    catalogId?: string; // new canonical
    title?: string;
    artist?: string;
    durationMs?: number;
    muxPlaybackId?: string;
    visualTheme?: string;
  }>;
};

type TrackLyricsDoc = {
  trackId?: string; // still legacy for now
  offsetMs?: number;
  cues?: Array<{ tMs?: number; text?: string; endMs?: number }>;
};

export type AlbumBrowseItem = {
  id: string;
  slug: string;
  catalogId?: string | null;
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

export type AlbumLyricsBundle = {
  cuesByTrackId: Record<string, LyricCue[]>;
  offsetByTrackId: Record<string, number>;
};

function normalizeCues(input: TrackLyricsDoc["cues"]): LyricCue[] {
  if (!Array.isArray(input)) return [];
  const out: LyricCue[] = [];
  for (const c of input) {
    const tMs = c?.tMs;
    const text = c?.text;
    const endMs = c?.endMs;
    if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0) continue;
    if (typeof text !== "string" || text.trim().length === 0) continue;
    const cue: LyricCue = { tMs: Math.floor(tMs), text: text.trim() };
    if (typeof endMs === "number" && Number.isFinite(endMs) && endMs >= 0)
      cue.endMs = Math.floor(endMs);
    out.push(cue);
  }
  out.sort((a, b) => a.tMs - b.tMs);
  return out;
}

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

export async function getAlbumBySlug(
  slug: string,
): Promise<{
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  lyrics: AlbumLyricsBundle;
}> {
  const q = `
    *[_type == "album" && slug.current == $slug][0]{
      _id,
      catalogId,
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
      "tracks": tracks[]{
        id,
        catalogId,
        title,
        artist,
        durationMs,
        muxPlaybackId,
        visualTheme
      }
    }
  `;

  const doc = await client.fetch<AlbumDoc | null>(q, { slug });

  if (!doc?._id) {
    return {
      album: null,
      tracks: [],
      lyrics: { cuesByTrackId: {}, offsetByTrackId: {} },
    };
  }

  const albumCatalogId = normStr(doc.catalogId) ?? undefined;
  const albumTheme = normTheme(doc.visualTheme);

  const releaseAt = doc.releaseAt ?? null;
  const releaseAtMs = releaseAt ? Date.parse(releaseAt) : NaN;
  const isEmbargoedByDate = Boolean(
    releaseAt && Number.isFinite(releaseAtMs) && releaseAtMs > Date.now(),
  );

  const embargoNote = normStr(doc.embargoNote) ?? null;

  const album: AlbumInfo = {
    id: doc._id,
    catalogId: albumCatalogId,
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
    policy: {
      publicPageVisible: doc.publicPageVisible !== false,
      releaseAt: doc.releaseAt ?? null,
      earlyAccessEnabled: !!doc.earlyAccessEnabled,
      earlyAccessTiers: parseTierNameArray(doc.earlyAccessTiers),
      minTierToLoad: parseTierName(doc.minTierToLoad),
    },
    // ✅ optimistic embargo UI (still not an entitlement decision)
    embargo: {
      embargoed: isEmbargoedByDate,
      releaseAt,
      note: embargoNote,
    },
  };

  // Tracks: keep legacy id as the runtime player id (so lyrics + existing wiring keep working),
  // but attach catalogId for future-proofing and entitlement scoping if you later go track-level.
  const tracks: PlayerTrack[] = Array.isArray(doc.tracks)
    ? doc.tracks
        .filter((t) => t?.id)
        .map((t) => {
          const raw = t.durationMs;
          const n =
            typeof raw === "number" && Number.isFinite(raw) ? raw : undefined;
          const trackTheme = normTheme(t.visualTheme);

          return {
            id: t.id, // legacy runtime ID (matches lyrics today)
            catalogId: normStr(t.catalogId) ?? null,
            title: normStr(t.title),
            artist: normStr(t.artist),
            muxPlaybackId: normStr(t.muxPlaybackId),
            durationMs: typeof n === "number" && n > 0 ? n : undefined,
            visualTheme: trackTheme ?? albumTheme,
          };
        })
    : [];

  // Lyrics are still keyed by legacy trackId for now.
  const trackIds = tracks
    .map((t) => t.id)
    .filter((x): x is string => typeof x === "string" && x.length > 0);

  const lyricsQ = `
    *[_type == "lyrics" && trackId in $trackIds]{
      trackId,
      offsetMs,
      cues[]{ tMs, text, endMs }
    }
  `;

  const lyricDocs = trackIds.length
    ? await client.fetch<TrackLyricsDoc[]>(lyricsQ, { trackIds })
    : [];

  const cuesByTrackId: Record<string, LyricCue[]> = {};
  const offsetByTrackId: Record<string, number> = {};

  for (const d of Array.isArray(lyricDocs) ? lyricDocs : []) {
    const id = d?.trackId;
    if (!id) continue;
    cuesByTrackId[id] = normalizeCues(d.cues);
    offsetByTrackId[id] =
      typeof d.offsetMs === "number" && Number.isFinite(d.offsetMs)
        ? Math.floor(d.offsetMs)
        : 0;
  }

  return { album, tracks, lyrics: { cuesByTrackId, offsetByTrackId } };
}

export async function listAlbumsForBrowse(): Promise<AlbumBrowseItem[]> {
  const q = `
    *[_type=="album"]|order(year desc, _createdAt desc){
      "id": _id,
      "catalogId": catalogId,
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
    catalogId: normStr(a.catalogId) ?? null,
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

// web/lib/albums.ts

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
