// web/app/api/lyrics/by-track/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { sql } from "@vercel/postgres";
import { normalizeLyricCuesFromSanity } from "@/lib/types";
import type { LyricCue, LyricGroupMap } from "@/lib/types";

export const runtime = "nodejs";

type TrackLyricsDoc = {
  recordingId?: string;
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

    // canonical internal id
    recordingId?: string | null;

    // canonical URL id (per-album unique)
    displayId?: string | null;
  } | null;
};

type LyricsQueryResult = {
  lyrics?: TrackLyricsDoc | null;
  meta?: TrackMetaBundle | null;
};

function trimStr(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function safeUrl(raw: unknown): string | null {
  const s = trimStr(raw);
  if (!s) return null;
  try {
    new URL(s);
    return s;
  } catch {
    return null;
  }
}

async function fetchGroupMap(recordingId: string): Promise<LyricGroupMap> {
  const r = await sql<{
    anchor_line_key: string;
    canonical_group_key: string;
    updated_at: string;
  }>`
    select anchor_line_key, canonical_group_key, updated_at
    from exegesis_group_map
    where track_id = ${recordingId}
  `;

  const map: LyricGroupMap = {};
  for (const row of r.rows ?? []) {
    const lk = trimStr(row.anchor_line_key);
    const gk = trimStr(row.canonical_group_key);
    if (!lk || !gk) continue;
    map[lk] = { canonicalGroupKey: gk, updatedAt: row.updated_at };
  }
  return map;
}

async function resolveRecordingIdFromAlbumDisplayId(args: {
  albumSlug: string;
  displayId: string;
}): Promise<{
  ok: true;
  recordingId: string;
  meta: TrackMetaBundle;
} | null> {
  const albumSlug = trimStr(args.albumSlug);
  const displayId = trimStr(args.displayId);
  if (!albumSlug || !displayId) return null;

  const q = `
    *[_type == "album" && slug.current == $albumSlug][0]{
      "albumTitle": title,
      "albumSlug": slug.current,
      "albumCatalogueId": catalogueId,
      "track": tracks[displayId == $displayId][0]{
        title,
        artist,
        recordingId,
        displayId
      }
    }
  `;

  const meta = await client.fetch<TrackMetaBundle | null>(q, {
    albumSlug,
    displayId,
  });

  const rec = trimStr(meta?.track?.recordingId);
  if (!rec) return null;

  return {
    ok: true,
    recordingId: rec,
    meta: meta ?? {
      albumTitle: null,
      albumSlug: albumSlug,
      albumCatalogueId: null,
      track: { title: null, artist: null, recordingId: rec, displayId },
    },
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // Back-compat: allow direct internal-id lookups
  const recordingIdParam = trimStr(searchParams.get("recordingId"));

  // New canonical URL-facing surface: albumSlug + displayId
  const albumSlugParam = trimStr(searchParams.get("albumSlug"));
  const displayIdParam = trimStr(searchParams.get("displayId"));

  let recordingId = recordingIdParam;
  let forcedMeta: TrackMetaBundle | null = null;

  if (!recordingId) {
    const resolved = await resolveRecordingIdFromAlbumDisplayId({
      albumSlug: albumSlugParam,
      displayId: displayIdParam,
    });

    if (!resolved) {
      return NextResponse.json(
        {
          ok: false,
          error: "missing_recordingId_or_albumSlug_displayId",
        },
        { status: 400 },
      );
    }

    recordingId = resolved.recordingId;
    forcedMeta = resolved.meta;
  }

  if (recordingId.length > 200) {
    return NextResponse.json(
      { ok: false, error: "invalid_recordingId" },
      { status: 400 },
    );
  }

  // We always fetch lyrics by internal recordingId.
  // Meta is fetched either via (albumSlug+displayId) or a recordingId lookup.
  const q = `
    {
      "lyrics": *[_type == "lyrics" && recordingId == $recordingId][0]{
        recordingId,
        offsetMs,
        version,
        geniusUrl,
        cues[]{ _key, tMs, text, endMs }
      },
      "meta": *[_type == "album" && $recordingId in tracks[].recordingId][0]{
        "albumTitle": title,
        "albumSlug": slug.current,
        "albumCatalogueId": catalogueId,
        "track": tracks[recordingId == $recordingId][0]{
          title,
          artist,
          recordingId,
          displayId
        }
      }
    }
  `;

  const bundle = await client.fetch<LyricsQueryResult | null>(q, { recordingId });

  const doc = bundle?.lyrics ?? null;
  const metaRaw = forcedMeta ?? bundle?.meta ?? null;

  const trackTitle = trimStr(metaRaw?.track?.title) || null;
  const trackArtist = trimStr(metaRaw?.track?.artist) || null;

  const albumTitle = trimStr(metaRaw?.albumTitle) || null;
  const albumSlug = trimStr(metaRaw?.albumSlug) || null;
  const albumCatalogueId = trimStr(metaRaw?.albumCatalogueId) || null;

  const metaRecordingId = trimStr(metaRaw?.track?.recordingId) || null;
  const metaDisplayId = trimStr(metaRaw?.track?.displayId) || null;

  const cues = normalizeLyricCuesFromSanity(doc?.cues);
  const offsetMs =
    typeof doc?.offsetMs === "number" && Number.isFinite(doc.offsetMs)
      ? Math.floor(doc.offsetMs)
      : 0;

  const version = trimStr(doc?.version) || "v1";
  const geniusUrl = safeUrl(doc?.geniusUrl);

  // Embed exegesis grouping map (admin-auth not needed; it's just presentation data)
  const groupMap = await fetchGroupMap(recordingId);

  // Annotate cues with canonicalGroupKey when mapped (unmapped cues omit the field)
  const PARA_BREAK = "__PARA_BREAK__";

  const cuesWithGroups: LyricCue[] = cues.map((c) => {
    if (c.text === PARA_BREAK) return c; // never group-map paragraph breaks
    const hit = groupMap[c.lineKey];
    return hit ? { ...c, canonicalGroupKey: hit.canonicalGroupKey } : c;
  });

  return NextResponse.json(
    {
      ok: true,

      // canonical internal id (used for exegesis db + lyrics docs)
      recordingId,

      // canonical URL id when we can resolve it
      displayId: metaDisplayId,

      // meta (all nullable)
      trackTitle,
      trackArtist,
      albumTitle,
      albumSlug,
      albumCatalogueId,

      // explicit copies for callers that want them
      trackRecordingId: metaRecordingId,
      trackDisplayId: metaDisplayId,

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