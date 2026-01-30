// web/app/api/albums/route.ts
import "server-only";

import { NextResponse } from "next/server";
import { sanity } from "@/lib/sanityClient";

type AlbumPayload = {
  album: {
    id: string;
    title: string;
    artist?: string;
    year?: number;
    description?: string;
  } | null;
  tracks: Array<{
    id: string;
    title?: string;
    artist?: string;
    durationMs?: number;
    muxPlaybackId?: string;
  }>;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") ?? "").trim();

  if (!slug) {
    return NextResponse.json({ error: "Missing ?slug=" }, { status: 400 });
  }

  const data = await sanity.fetch(
    `
    *[_type == "album" && slug.current == $slug][0]{
      _id,
      title,
      artist,
      year,
      description,
      "tracks": tracks[]{
        id,
        title,
        artist,
        durationMs,
        muxPlaybackId
      }
    }
    `,
    { slug },
  );

  if (!data?._id) {
    const empty: AlbumPayload = { album: null, tracks: [] };
    return NextResponse.json(empty, { status: 200 });
  }

  const payload: AlbumPayload = {
    album: {
      id: data._id as string,
      title: (data.title as string) ?? "Untitled",
      artist: (data.artist as string) ?? undefined,
      year: (data.year as number) ?? undefined,
      description: (data.description as string) ?? undefined,
    },
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
  };

  return NextResponse.json(payload, { status: 200 });
}
