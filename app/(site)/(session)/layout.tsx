// web/app/(site)/(session)/layout.tsx
import React from "react";
import ShadowHomeFrame from "@/app/home/ShadowHomeFrame";
import StableSessionShell from "@/app/home/StableSessionShell";
import { fetchPortalPage } from "@/lib/portal";
import { client } from "@/sanity/lib/client";
import {
  getFeaturedAlbumSlugFromSanity,
  listAlbumsForBrowse,
} from "@/lib/albums";
import { urlFor } from "@/sanity/lib/image";
import type { AlbumNavItem } from "@/lib/types";

type SessionShellConfig = {
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
};

const sessionShellQuery = `
  *[_type == "shadowHomePage" && slug.current == $slug][0]{
    "topLogoUrl": topLogo.asset->url,
    topLogoHeight
  }
`;

function asTierName(v: unknown): "friend" | "patron" | "partner" | null {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "friend" || s === "patron" || s === "partner") return s;
  return null;
}

function toAlbumNavItems(
  browseAlbumsRaw: Awaited<ReturnType<typeof listAlbumsForBrowse>>,
): AlbumNavItem[] {
  return browseAlbumsRaw
    .filter((a) => a.slug && a.title)
    .filter((a) => a.policy?.publicPageVisible !== false)
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      artist: a.artist ?? undefined,
      year: a.year ?? undefined,
      coverUrl: a.artwork
        ? urlFor(a.artwork).width(400).height(400).quality(80).url()
        : null,
      policy: {
        publicPageVisible: a.policy?.publicPageVisible !== false,
        minTierToLoad: asTierName(a.policy?.minTierToLoad),
      },
    }));
}

export default async function SessionLayout(props: {
  // Parallel route slot:
  // we render ALL “player vs portal” runtime inside this slot.
  runtime: React.ReactNode;
}) {
  const [shellConfig, featured, browseAlbumsRaw] = await Promise.all([
    client.fetch<SessionShellConfig>(
      sessionShellQuery,
      { slug: "home" },
      { next: { tags: ["shadowHome"] } },
    ),
    getFeaturedAlbumSlugFromSanity(),
    listAlbumsForBrowse(),
  ]);

  const [portalPage] = await Promise.all([fetchPortalPage("home")]);

  const portalModules = portalPage?.modules ?? [];

  const featuredAlbumSlug =
    featured.slug ?? featured.fallbackSlug ?? "god-defend";

  const albums = toAlbumNavItems(browseAlbumsRaw);

  return (
    <ShadowHomeFrame
      lyricsOverlayZIndex={50}
      stageHeight={560}
      shadowHomeSlug="home"
    >
      <StableSessionShell
        runtime={props.runtime}
        topLogoUrl={shellConfig?.topLogoUrl ?? null}
        topLogoHeight={shellConfig?.topLogoHeight ?? null}
        featuredAlbumSlug={featuredAlbumSlug}
        albums={albums}
        portalModules={portalModules}
      />
    </ShadowHomeFrame>
  );
}
