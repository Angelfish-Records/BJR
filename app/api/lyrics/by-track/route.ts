//web/app/api/lyrics/by-track/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { sql } from "@vercel/postgres";
import { normalizeLyricCuesFromSanity } from "@/lib/types";
import type { LyricCue, LyricGroupMap } from "@/lib/types";

export const runtime = "nodejs";

type TrackLyricsDoc = {
  trackId?: string;
  offsetMs?: number;
  version?: string;
  geniusUrl?: string | null;
  cues?: Array<{ _key?: string; tMs?: number; text?: string; endMs?: number }>;
};

type TrackMetaBundle = {
  albumTitle?: string | null;
  albumSlug?: string | null;
  albumCatalogueId?: string | null;
  track?: {
    title?: string | null;
    artist?: string | null;
    trackCatalogueId?: string | null;
  } | null;
};

type LyricsQueryResult = {
  lyrics?: TrackLyricsDoc | null;
  meta?: TrackMetaBundle | null;
};

function safeUrl(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return null;
  // Keep validation light; just ensure it parses as a URL.
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

async function fetchGroupMap(trackId: string): Promise<LyricGroupMap> {
  const r = await sql<{
    anchor_line_key: string;
    canonical_group_key: string;
    updated_at: string;
  }>`
    select anchor_line_key, canonical_group_key, updated_at
    from exegesis_group_map
    where track_id = ${trackId}
  `;

  const map: LyricGroupMap = {};
  {
  }

  for (const row of r.rows ?? []) {
    const lk = (row.anchor_line_key ?? "").trim();
    const gk = (row.canonical_group_key ?? "").trim();
    if (!lk || !gk) continue;
    map[lk] = { canonicalGroupKey: gk, updatedAt: row.updated_at };
  }

  return map;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const trackIdRaw = searchParams.get("trackId");
  const trackId = typeof trackIdRaw === "string" ? trackIdRaw.trim() : "";

  if (!trackId) {
    return NextResponse.json(
      { ok: false, error: "missing_trackId" },
      { status: 400 },
    );
  }

  const q = `
    {
      "lyrics": *[_type == "lyrics" && trackId == $trackId][0]{
        trackId,
        offsetMs,
        version,
        geniusUrl,
        cues[]{ _key, tMs, text, endMs }
      },
      "meta": *[_type == "album" && $trackId in tracks[].id][0]{
        "albumTitle": title,
        "albumSlug": slug.current,
        "albumCatalogueId": catalogueId,
        "track": tracks[id == $trackId][0]{
          title,
          artist,
          "trackCatalogueId": catalogueId
        }
      }
    }
  `;

  const bundle = await client.fetch<LyricsQueryResult | null>(q, {
    trackId,
  });

  const doc = bundle?.lyrics ?? null;
  const metaRaw = bundle?.meta ?? null;

  const trackTitle =
    typeof metaRaw?.track?.title === "string" && metaRaw.track.title.trim()
      ? metaRaw.track.title.trim()
      : null;

  const trackArtist =
    typeof metaRaw?.track?.artist === "string" && metaRaw.track.artist.trim()
      ? metaRaw.track.artist.trim()
      : null;

  const albumTitle =
    typeof metaRaw?.albumTitle === "string" && metaRaw.albumTitle.trim()
      ? metaRaw.albumTitle.trim()
      : null;

  const albumSlug =
    typeof metaRaw?.albumSlug === "string" && metaRaw.albumSlug.trim()
      ? metaRaw.albumSlug.trim()
      : null;

  const albumCatalogueId =
    typeof metaRaw?.albumCatalogueId === "string" &&
    metaRaw.albumCatalogueId.trim()
      ? metaRaw.albumCatalogueId.trim()
      : null;

  const trackCatalogueId =
    typeof metaRaw?.track?.trackCatalogueId === "string" &&
    metaRaw.track.trackCatalogueId.trim()
      ? metaRaw.track.trackCatalogueId.trim()
      : null;

  const cues = normalizeLyricCuesFromSanity(doc?.cues);
  const offsetMs =
    typeof doc?.offsetMs === "number" && Number.isFinite(doc.offsetMs)
      ? Math.floor(doc.offsetMs)
      : 0;

  const version =
    typeof doc?.version === "string" && doc.version.trim()
      ? doc.version.trim()
      : "v1";

  const geniusUrl = safeUrl(doc?.geniusUrl);

  // Embed exegesis grouping map (admin-auth not needed; it's just presentation data)
  const groupMap = await fetchGroupMap(trackId);

  // Annotate cues with canonicalGroupKey when mapped (unmapped cues omit the field)
  const cuesWithGroups: LyricCue[] = cues.map((c) => {
    const hit = groupMap[c.lineKey];
    return hit ? { ...c, canonicalGroupKey: hit.canonicalGroupKey } : c;
  });

  // Important: prevent any caching weirdness during rapid track switching
  return NextResponse.json(
    {
      ok: true,
      trackId,

      // ✅ new meta (all nullable)
      trackTitle,
      trackArtist,
      trackCatalogueId,
      albumTitle,
      albumSlug,
      albumCatalogueId,

      cues: cuesWithGroups,
      offsetMs,
      version,
      geniusUrl,
      groupMap, // keyed by lineKey
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
