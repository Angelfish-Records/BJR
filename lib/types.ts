// web/lib/types.ts

export type TierName = "friend" | "patron" | "partner";
export type Tier = "none" | TierName;

export type AlbumEmbargoInfo = {
  embargoed: boolean;
  releaseAt: string | null;
  note?: string | null;
};

export type AlbumInfo = {
  id: string;
  catalogueId?: string;
  title: string;
  artist?: string;
  year?: number;
  description?: string;
  artworkUrl?: string | null;
  policy?: AlbumPolicy;
  embargo?: AlbumEmbargoInfo;
  platformLinks?: { platform: string; url: string }[];
};

export type AlbumPolicy = {
  publicPageVisible: boolean;
  releaseAt?: string | null;
  earlyAccessEnabled?: boolean;
  earlyAccessTiers?: TierName[];
  minTierToLoad?: TierName | null;
};

export type AlbumPlayerBundle = {
  albumSlug: string;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  albumLyrics: AlbumLyricsBundle | null;
};

// Optional helper (keeps call-sites tidy)
export function makeAlbumPlayerBundle(args: {
  albumSlug: string;
  album: AlbumInfo | null;
  tracks: PlayerTrack[];
  albumLyrics?: AlbumLyricsBundle | null;
}): AlbumPlayerBundle {
  return {
    albumSlug: args.albumSlug,
    album: args.album,
    tracks: Array.isArray(args.tracks) ? args.tracks : [],
    albumLyrics: args.albumLyrics ?? null,
  };
}

export type AlbumNavItem = {
  id: string;
  slug: string;
  title: string;
  artist?: string;
  year?: number;
  coverUrl?: string | null;

  // browse-click gating (load gate)
  policy?: {
    publicPageVisible: boolean;
    minTierToLoad: TierName | null;
  };
};

export type PlayerTrack = {
  recordingId: string;
  displayId: string;
  title?: string;
  artist?: string;
  durationMs?: number;
  muxPlaybackId?: string;
  visualTheme?: string;
  explicit?: boolean;
  playCount?: number;
};

export type AlbumLyricsBundle = {
  cuesByRecordingId: Record<string, LyricCue[]>;
  offsetByRecordingId: Record<string, number>;
};

export type LyricGroupMapEntry = {
  canonicalGroupKey: string;
  updatedAt: string; // ISO string from DB
};

export type LyricGroupMap = Record<string, LyricGroupMapEntry>; // keyed by lineKey

export type LyricCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;

  /**
   * Optional enrichment: if this cue's lineKey is mapped into a canonical exegesis group.
   * Present when known; omitted otherwise.
   */
  canonicalGroupKey?: string;
};

export type TrackLyricsApiOk = {
  ok: true;
  recordingId: string;
  offsetMs: number;
  cues: LyricCue[];

  // present in API today, but optional for consumers
  version?: string;
  geniusUrl?: string | null;
  groupMap?: LyricGroupMap;

  // meta fields the API returns (nullable)
  trackTitle?: string | null;
  trackArtist?: string | null;
  trackCatalogueId?: string | null;
  albumTitle?: string | null;
  albumSlug?: string | null;
  albumCatalogueId?: string | null;
};

export function normalizeLyricCues(input: unknown): LyricCue[] {
  if (!Array.isArray(input)) return [];
  const out: LyricCue[] = [];

  for (const c of input) {
    if (!c || typeof c !== "object") continue;

    const lineKey = (c as { lineKey?: unknown }).lineKey;
    const tMs = (c as { tMs?: unknown }).tMs;
    const text = (c as { text?: unknown }).text;
    const endMs = (c as { endMs?: unknown }).endMs;
    const canonicalGroupKey = (c as { canonicalGroupKey?: unknown })
      .canonicalGroupKey;

    if (typeof lineKey !== "string" || lineKey.trim().length === 0) continue;
    if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0) continue;
    if (typeof text !== "string" || text.trim().length === 0) continue;

    const cue: LyricCue = {
      lineKey: lineKey.trim(),
      tMs: Math.floor(tMs),
      text: text.trim(),
    };

    if (typeof endMs === "number" && Number.isFinite(endMs) && endMs >= 0) {
      cue.endMs = Math.floor(endMs);
    }

    // optional enrichment
    if (typeof canonicalGroupKey === "string" && canonicalGroupKey.trim()) {
      cue.canonicalGroupKey = canonicalGroupKey.trim();
    }

    out.push(cue);
  }

  out.sort((a, b) => a.tMs - b.tMs);
  return out;
}

export type SanityLyricCue = {
  _key?: string;
  tMs?: number;
  text?: string;
  endMs?: number;
};

// Adapts Sanity cue shape into canonical cue normalization.
// (Sanity uses `_key` for the line key.)
export function normalizeLyricCuesFromSanity(
  input: SanityLyricCue[] | undefined | null,
): LyricCue[] {
  if (!Array.isArray(input)) return [];
  return normalizeLyricCues(
    input.map((c) => ({
      lineKey: c?._key,
      tMs: c?.tMs,
      text: c?.text,
      endMs: c?.endMs,
      // canonicalGroupKey not present in Sanity lyrics docs
    })),
  );
}

export function parseTrackLyricsApiOk(raw: unknown): TrackLyricsApiOk | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.ok !== true) return null;

  if (typeof o.recordingId !== "string" || !o.recordingId.trim()) return null;
  if (typeof o.offsetMs !== "number" || !Number.isFinite(o.offsetMs))
    return null;

  const cues = normalizeLyricCues(o.cues);

  // groupMap is optional; keep it only if it looks like the right shape
  const groupMap =
    o.groupMap && typeof o.groupMap === "object" && !Array.isArray(o.groupMap)
      ? (o.groupMap as LyricGroupMap)
      : undefined;

  const out: TrackLyricsApiOk = {
    ok: true,
    recordingId: o.recordingId.trim(),
    offsetMs: Math.floor(o.offsetMs),
    cues,
  };

  // Optional fields (keep them if present, but don’t over-validate here)
  if (typeof o.version === "string" && o.version.trim())
    out.version = o.version.trim();
  if (typeof o.geniusUrl === "string" || o.geniusUrl === null)
    out.geniusUrl = o.geniusUrl as string | null;
  if (groupMap) out.groupMap = groupMap;

  // Nullable meta fields (type-safe, no `any`)
  const nullableMetaKeys = [
    "trackTitle",
    "trackArtist",
    "trackCatalogueId",
    "albumTitle",
    "albumSlug",
    "albumCatalogueId",
  ] as const;

  type NullableMetaKey = (typeof nullableMetaKeys)[number];

  for (const k of nullableMetaKeys) {
    const v = o[k];
    if (typeof v === "string") {
      out[k as NullableMetaKey] = v.trim() || null;
    } else if (v === null) {
      out[k as NullableMetaKey] = null;
    }
  }

  return out;
}
