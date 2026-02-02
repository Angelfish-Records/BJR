// web/app/(site)/albums/[slug]/page.tsx
import React from "react";
import { notFound } from "next/navigation";

import AlbumDeepLinkBridge from "./AlbumDeepLinkBridge";
import { getAlbumBySlug } from "@/lib/albums";
import type { AlbumInfo } from "@/lib/types";
import type { PlayerTrack } from "@/lib/types";
import { urlFor } from "@/sanity/lib/image";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type PageSearchParams = Record<string, string | string[] | undefined>;

type WithArtwork = { artwork?: unknown };
function hasArtwork(x: unknown): x is WithArtwork {
  return typeof x === "object" && x !== null && "artwork" in x;
}

// ✅ OG / Twitter / canonical handling for album + track deep-links
export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { slug } = await props.params;
  const sp = (props.searchParams ? await props.searchParams : {}) ?? {};
  const tRaw = sp.t;
  const t = Array.isArray(tRaw) ? tRaw[0] : tRaw;

  const albumData = await getAlbumBySlug(slug);
  if (!albumData.album) return {};

  const album = albumData.album as AlbumInfo;
  const tracks = albumData.tracks as PlayerTrack[];

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "";
  const canonicalPath = t
    ? `/albums/${slug}?t=${encodeURIComponent(t)}`
    : `/albums/${slug}`;
  const canonical = origin ? `${origin}${canonicalPath}` : canonicalPath;

  const artist = (album.artist ?? "").toString().trim();
  const albumTitle = (album.title ?? "").toString().trim() || slug;

  const track = t ? tracks.find((x) => x?.id === t) : undefined;
  const trackTitle = track?.title ? String(track.title).trim() : "";

  const title = trackTitle
    ? `${trackTitle} — ${albumTitle}${artist ? ` — ${artist}` : ""}`
    : `${albumTitle}${artist ? ` — ${artist}` : ""}`;

  const description = trackTitle
    ? `Listen to “${trackTitle}” on ${albumTitle}${artist ? ` by ${artist}` : ""}.`
    : `Listen to ${albumTitle}${artist ? ` by ${artist}` : ""}.`;

  const ogImg =
    hasArtwork(album) && album.artwork
      ? urlFor(album.artwork)
          .width(1200)
          .height(630)
          .fit("crop") // or "clip" depending on your preference
          .quality(85)
          .url()
      : undefined;

  const squareImg =
    hasArtwork(album) && album.artwork
      ? urlFor(album.artwork).width(1200).height(1200).quality(85).url()
      : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "music.album",
      images: ogImg
        ? [
            {
              url: ogImg,
              width: 1200,
              height: 630,
              alt: `${albumTitle} cover`,
            },
            ...(squareImg
              ? [
                  {
                    url: squareImg,
                    width: 1200,
                    height: 1200,
                    alt: `${albumTitle} cover (square)`,
                  },
                ]
              : []),
          ]
        : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ogImg ? [ogImg] : squareImg ? [squareImg] : undefined,
    },
  };
}

export default async function AlbumPage(props: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<PageSearchParams>;
}) {
  const { slug } = await props.params;

  // Validate slug exists (keeps 404 behaviour consistent)
  const albumData = await getAlbumBySlug(slug);
  if (!albumData.album) notFound();

  return (
    <>
      {/* Client-side resolver: /albums/:slug(?t=) -> /home?p=player&album=...&track=... */}
      <AlbumDeepLinkBridge />

      {/* Minimal fallback content (in case the redirect is delayed/blocked) */}
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.04)",
            padding: 16,
            fontSize: 13,
            opacity: 0.82,
            lineHeight: 1.55,
            maxWidth: 680,
            width: "100%",
          }}
        >
          Redirecting to the player…
          <noscript>
            <div style={{ marginTop: 10 }}>
              JavaScript is required to open the player. You can try:{" "}
              <a href={`/home?p=player&album=${encodeURIComponent(slug)}`}>
                open player
              </a>
              .
            </div>
          </noscript>
        </div>
      </div>
    </>
  );
}
