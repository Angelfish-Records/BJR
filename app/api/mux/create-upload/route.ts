import { NextResponse } from "next/server";
import Mux from "@mux/mux-node";

export const runtime = "nodejs";

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});

export async function POST() {
  // audio-only: keep it simple; you can tweak later
  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: ["signed"], // matches your tokenized playback flow
    },
    cors_origin: "*", // tighten later; for dev it's fine
  });

  return NextResponse.json({
    ok: true,
    uploadId: upload.id,
    url: upload.url,
  });
}
