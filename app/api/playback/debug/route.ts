// web/app/api/playback/debug/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";

type PlaybackDebugEvent = {
  t?: number;
  event?: string;
  albumId?: string | null;
  recordingId?: string | null;
  playbackId?: string | null;
  source?: string | null;
  detail?: string | null;
};

type PlaybackDebugBody = {
  sessionId?: string;
  href?: string;
  events?: PlaybackDebugEvent[];
};

function norm(v: unknown, max = 240): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function shortUa(ua: string | null): string {
  if (!ua) return "unknown";

  const isAppleMobile = /iPad|iPhone|iPod/i.test(ua);

  if (isAppleMobile) {
    if (/Brave/i.test(ua)) return "iPhone Brave";
    if (/CriOS/i.test(ua)) return "iPhone Chrome";
    if (/FxiOS/i.test(ua)) return "iPhone Firefox";
    if (/OPiOS/i.test(ua)) return "iPhone Opera";
    return "iPhone WebKit";
  }

  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Desktop macOS";
  return ua.slice(0, 120);
}

function renderDetailValue(value: unknown): string | null {
  if (typeof value === "string") return norm(value, 120);

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.round(value * 100) / 100);
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }

  return null;
}

function summarizeDetail(detail: unknown): string | null {
  const raw = norm(detail, 1_200);

  if (!raw) return null;

  let parsed: unknown = null;

  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return raw.slice(0, 320);
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return raw.slice(0, 320);
  }

  const fields = parsed as Record<string, unknown>;
  const keys = [
    "reason",
    "visibility",
    "activeDeck",
    "hlsPath",
    "path",
    "audioOutputMode",
    "audioContextState",
    "mediaCurrentTimeSec",
    "currentTimeSec",
    "mediaPaused",
    "paused",
    "mediaEnded",
    "ended",
    "mediaReadyState",
    "readyState",
    "mediaNetworkState",
    "networkState",
    "nativeHlsCanPlay",
    "hlsJsSupported",
  ];

  const parts: string[] = [];

  for (const key of keys) {
    const value = renderDetailValue(fields[key]);
    if (value) parts.push(`${key}=${value}`);
  }

  return parts.length > 0 ? parts.join(";") : raw.slice(0, 320);
}

function summarize(events: PlaybackDebugEvent[]): string {
  return events
    .slice(-24)
    .map((e) => {
      const t = typeof e.t === "number" ? `${Math.floor(e.t / 1000)}s` : "?";
      const name = norm(e.event, 80) ?? "unknown";
      const rec = norm(e.recordingId, 40);
      const detail = summarizeDetail(e.detail);

      return [t, name, rec, detail].filter(Boolean).join(" | ");
    })
    .join("  →  ");
}

export async function POST(req: NextRequest) {
  if (process.env.AUDIO_DEBUG_SERVER_LOGS !== "1") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  let body: PlaybackDebugBody | null = null;
  try {
    body = (await req.json()) as PlaybackDebugBody;
  } catch {
    body = null;
  }

  const sessionId = norm(body?.sessionId, 80) ?? "no-session";
  const href = norm(body?.href, 300);
  const events = Array.isArray(body?.events) ? body.events : [];

  console.info("[audio-debug-batch]", {
    sessionId,
    ua: shortUa(req.headers.get("user-agent")),
    count: events.length,
    href,
    timeline: summarize(events),
  });

  return NextResponse.json({ ok: true });
}
