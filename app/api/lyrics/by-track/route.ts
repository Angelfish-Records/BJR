import { NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

export type LyricCue = { lineKey: string; tMs: number; text: string; endMs?: number };

type TrackLyricsDoc = {
  trackId?: string;
  offsetMs?: number;
  version?: string;
  geniusUrl?: string | null;
  cues?: Array<{ _key?: string; tMs?: number; text?: string; endMs?: number }>;
};

function normalizeCues(input: TrackLyricsDoc["cues"]): LyricCue[] {
  if (!Array.isArray(input)) return [];
  const out: LyricCue[] = [];

  for (const c of input) {
    const lineKey = typeof c?._key === "string" ? c._key.trim() : "";
    const tMs = c?.tMs;
    const text = c?.text;
    const endMs = c?.endMs;

    if (!lineKey) continue;
    if (typeof tMs !== "number" || !Number.isFinite(tMs) || tMs < 0) continue;
    if (typeof text !== "string" || text.trim().length === 0) continue;

    const cue: LyricCue = {
      lineKey,
      tMs: Math.floor(tMs),
      text: text.trim(),
    };

    if (typeof endMs === "number" && Number.isFinite(endMs) && endMs >= 0) {
      cue.endMs = Math.floor(endMs);
    }

    out.push(cue);
  }

  out.sort((a, b) => a.tMs - b.tMs);
  return out;
}

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
    *[_type == "lyrics" && trackId == $trackId][0]{
      trackId,
      offsetMs,
      version,
      geniusUrl,
      cues[]{ _key, tMs, text, endMs }
    }
  `;

  const doc = await client.fetch<TrackLyricsDoc | null>(q, { trackId });

  const cues = normalizeCues(doc?.cues);

  const offsetMs =
    typeof doc?.offsetMs === "number" && Number.isFinite(doc.offsetMs)
      ? Math.floor(doc.offsetMs)
      : 0;

  const version =
    typeof doc?.version === "string" && doc.version.trim()
      ? doc.version.trim()
      : "v1";

  const geniusUrl = safeUrl(doc?.geniusUrl);

  // Important: prevent any caching weirdness during rapid track switching
  return NextResponse.json(
    { ok: true, trackId, cues, offsetMs, version, geniusUrl },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}