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

  return NextResponse.json({
    ok: true,
    status: upload.status,
    ready: Boolean(playbackId),
    assetId,
    playbackId: playbackId ?? null,
  });
}
