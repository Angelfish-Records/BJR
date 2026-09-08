import { NextResponse } from "next/server";
import Mux from "@mux/mux-node";

export const runtime = "nodejs";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export async function POST(req: Request) {
  const { uploadId } = (await req.json()) as { uploadId?: string };
  if (!uploadId)
    return NextResponse.json(
      { ok: false, error: "Missing uploadId" },
      { status: 400 },
    );

  const upload = await mux.video.uploads.retrieve(uploadId);

  // When the upload is done, Mux creates the asset; asset_id becomes available
  const assetId = upload.asset_id;
  if (!assetId) {
    return NextResponse.json({ ok: true, status: upload.status, ready: false });
  }

  const asset = await mux.video.assets.retrieve(assetId);
  const playbackId = asset.playback_ids?.[0]?.id;
  const staticAudio = asset.static_renditions?.files?.find(
    (file) => file.name === "audio.m4a" || file.resolution === "audio-only",
  );
  const staticAudioStatus = staticAudio?.status ?? "preparing";

  if (staticAudioStatus === "errored" || staticAudioStatus === "skipped") {
    return NextResponse.json(
      {
        ok: false,
        error: `Static audio rendition ${staticAudioStatus}`,
      },
      { status: 502 },
    );
  }

  const ready = Boolean(playbackId) && staticAudioStatus === "ready";

  return NextResponse.json({
    ok: true,
    status: upload.status,
    ready,
    assetId,
    playbackId: ready ? playbackId : null,
    staticAudioStatus,
  });
}
