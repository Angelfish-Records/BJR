// web/app/(site)/album/[slug]/page.tsx
import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import { deriveTier } from "@/lib/vocab";
import { musicAlbumJsonLd } from "@/lib/structuredData";
import { ensureMemberByClerk } from "@/lib/members";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";
import { fetchPortalPage } from "@/lib/portal";
import { listAlbumsForBrowse, getAlbumBySlug } from "@/lib/albums";
import type { AlbumNavItem } from "@/lib/types";

import PortalModules from "@/app/home/PortalModules";
import PortalArea from "@/app/home/PortalArea";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ShadowHomeDoc = {
  title?: string;
  subtitle?: string;
  backgroundImage?: unknown;
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
};

const shadowHomeQuery = `
  *[_type == "shadowHomePage" && slug.current == $slug][0]{
    title,
    subtitle,
    backgroundImage,
    "topLogoUrl": topLogo.asset->url,
    topLogoHeight
  }
`;

function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export async function generateMetadata(props: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await props.params;

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const canonical = appUrl
    ? `${appUrl}/album/${encodeURIComponent(slug)}`
    : `/album/${encodeURIComponent(slug)}`;

  return {
    title: slug,
    alternates: { canonical },
  };
}

export default async function AlbumCanonicalPage(props: {
  params: Promise<{ slug: string }>;
}) {
  headers();

  const { slug } = await props.params;

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const [page, portal, albumData, browseAlbumsRaw] = await Promise.all([
    client.fetch<ShadowHomeDoc>(
      shadowHomeQuery,
      { slug: "home" },
      { next: { tags: ["shadowHome"] } },
    ),
    fetchPortalPage("home"),
    getAlbumBySlug(slug),
    listAlbumsForBrowse(),
  ]);

  if (!albumData.album) notFound();

  let member: null | { id: string; created: boolean; email: string } = null;
  let entitlementKeys: string[] = [];
  let tier = "none";

  if (userId && email) {
    const ensured = await ensureMemberByClerk({
      clerkUserId: userId,
      email,
      source: "album_route_clerk",
      sourceDetail: { route: `/album/${slug}` },
    });

    member = { id: ensured.id, created: ensured.created, email };

    entitlementKeys = await listCurrentEntitlementKeys(ensured.id);
    tier = deriveTier(entitlementKeys);
  }

  const isPatron = tier === "patron";

  const portalPanel = portal?.modules?.length ? (
    <PortalModules modules={portal.modules} memberId={member?.id ?? null} />
  ) : (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: 16,
        fontSize: 13,
        opacity: 0.78,
        lineHeight: 1.55,
      }}
    >
      No portal modules yet.
    </div>
  );

  const asTierName = (v: unknown): "friend" | "patron" | "partner" | null => {
    const s = typeof v === "string" ? v.trim().toLowerCase() : "";
    if (s === "friend" || s === "patron" || s === "partner") return s;
    return null;
  };

  const browseAlbums: AlbumNavItem[] = browseAlbumsRaw
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

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
  const pageUrl = appUrl ? `${appUrl}/album/${encodeURIComponent(slug)}` : "";

  const jsonLd =
    albumData.album && pageUrl
      ? musicAlbumJsonLd({
          album: albumData.album,
          tracks: albumData.tracks,
          pageUrl,
        })
      : null;

  return (
    <>
      {jsonLd ? <JsonLdScript data={jsonLd} /> : null}

      <PortalArea
        portalPanel={portalPanel}
        albumSlug={slug}
        album={albumData.album}
        tracks={albumData.tracks}
        albums={browseAlbums}
        attentionMessage={null}
        tier={tier}
        isPatron={isPatron}
        canManageBilling={!!member}
        topLogoUrl={page?.topLogoUrl ?? null}
        topLogoHeight={page?.topLogoHeight ?? null}
      />
    </>
  );
}
