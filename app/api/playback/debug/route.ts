import "server-only";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type PlaybackDebugBody = {
  event?: string;
  albumId?: string | null;
  recordingId?: string | null;
  playbackId?: string | null;
  source?: string | null;
  detail?: string | null;
};

function norm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, 240) : null;
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

  const event = norm(body?.event) ?? "unknown";
  const albumId = norm(body?.albumId);
  const recordingId = norm(body?.recordingId);
  const playbackId = norm(body?.playbackId);
  const source = norm(body?.source);
  const detail = norm(body?.detail);

  console.info("[audio-debug]", {
    event,
    albumId,
    recordingId,
    playbackId,
    source,
    detail,
    ua: req.headers.get("user-agent") ?? null,
  });

  return NextResponse.json({ ok: true });
}
