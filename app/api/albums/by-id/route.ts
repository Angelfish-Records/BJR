import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

type AlbumResolve = {
  _id: string;
  catalogId?: string;
  slug?: { current?: string };
  title?: string;
  artist?: string;
  artwork?: unknown;
};

function normStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s.length ? s : undefined;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const albumId = (url.searchParams.get("albumId") ?? "").trim();

  if (!albumId) {
    return NextResponse.json(
      { ok: false, error: "Missing albumId" },
      { status: 400 },
    );
  }

  // Transitional: allow lookup by catalogId OR by _id so you can use test IDs immediately.
  const q = `
    *[_type == "album" && (catalogId == $albumId || _id == $albumId)][0]{
      _id,
      catalogId,
      slug,
      title,
      artist,
      artwork
    }
  `;

  const doc = await client.fetch<AlbumResolve | null>(q, { albumId });

  if (!doc?._id) {
    return NextResponse.json(
      { ok: false, error: "Album not found" },
      { status: 404 },
    );
  }

  const slug = normStr(doc.slug?.current);
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Album is missing slug" },
      { status: 500 },
    );
  }

  const artworkUrl = doc.artwork
    ? urlFor(doc.artwork).width(900).height(900).quality(85).url()
    : null;

  return NextResponse.json({
    ok: true,
    album: {
      id: doc._id,
      catalogId: normStr(doc.catalogId) ?? null,
      slug,
      title: normStr(doc.title) ?? "Album",
      artist: normStr(doc.artist),
      artworkUrl,
    },
  });
}
