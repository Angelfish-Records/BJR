import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";

type Params = {
  params: { recordingId: string };
};

export async function GET(_req: NextRequest, { params }: Params) {
  const recordingId = (params.recordingId ?? "").trim();

  if (!recordingId) {
    return NextResponse.json(
      { ok: false, error: "Missing recordingId" },
      { status: 400 },
    );
  }

  const q = `
    *[_type == "album" && count(tracks[recordingId == $recordingId]) > 0][0]{
      "track": tracks[recordingId == $recordingId][0]{
        recordingId,
        muxPlaybackId,
        durationMs
      }
    }
  `;

  const doc = await client.fetch<{
    track?: {
      recordingId?: string;
      muxPlaybackId?: string;
      durationMs?: number;
    };
  } | null>(q, { recordingId });

  const playbackId = doc?.track?.muxPlaybackId?.trim();

  if (!playbackId) {
    return NextResponse.json(
      { ok: false, error: "No playbackId found" },
      { status: 404 },
    );
  }

  return NextResponse.json({
    ok: true,
    playbackId,
    durationMs:
      typeof doc?.track?.durationMs === "number"
        ? doc.track.durationMs
        : null,
  });
}