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
  if (ua.includes("Android")) return "Android Chrome";
  if (ua.includes("iPhone")) return "iPhone Safari";
  if (ua.includes("Macintosh")) return "Desktop Chrome";
  return ua.slice(0, 80);
}

function summarize(events: PlaybackDebugEvent[]): string {
  return events
    .slice(-24)
    .map((e) => {
      const t = typeof e.t === "number" ? `${Math.floor(e.t / 1000)}s` : "?";
      const name = norm(e.event, 60) ?? "unknown";
      const rec = norm(e.recordingId, 40);
      const detail = norm(e.detail, 90);
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