// web/app/(site)/album/[slug]/page.tsx
import React from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth, currentUser } from "@clerk/nextjs/server";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

import { musicAlbumJsonLd } from "@/lib/structuredData";
import { ensureMemberByClerk } from "@/lib/members";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";
import { ENTITLEMENTS, deriveTier } from "@/lib/vocab";
import { checkAccess } from "@/lib/access";
import { fetchPortalPage } from "@/lib/portal";
import {
  listAlbumsForBrowse,
  getAlbumBySlug,
} from "@/lib/albums";
import type { AlbumNavItem } from "@/lib/types";

import AdminDebugBar from "@/app/home/AdminDebugBar";
import PortalModules from "@/app/home/PortalModules";
import PortalArea from "@/app/home/PortalArea";
import StageInline from "@/app/home/player/StageInline";
import FooterDrawer from "@/app/home/FooterDrawer";

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
  return {
    title: slug,
    alternates: {
      canonical: `/album/${encodeURIComponent(slug)}`,
    },
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

  let isAdmin = false;
  if (member?.id) {
    const d = await checkAccess(
      member.id,
      { kind: "global", required: [ENTITLEMENTS.ADMIN] },
      { log: false },
    );
    isAdmin = d.allowed;
  }

  const bgUrl = page?.backgroundImage
    ? urlFor(page.backgroundImage).width(2400).height(1400).quality(80).url()
    : null;

  const mainStyle: React.CSSProperties = {
    minHeight: "100svh",
    position: "relative",
    backgroundColor: "#050506",
    color: "rgba(255,255,255,0.92)",
  };

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
    <main style={mainStyle}>
      {jsonLd ? <JsonLdScript data={jsonLd} /> : null}
      {isAdmin ? <AdminDebugBar isAdmin /> : null}

      {/* background layers (copied from /home) */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: bgUrl
              ? `url(${bgUrl})`
              : `radial-gradient(1200px 800px at 20% 20%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 60%),
                 radial-gradient(900px 700px at 80% 40%, rgba(255,255,255,0.06), transparent 55%),
                 linear-gradient(180deg, #050506 0%, #0b0b10 70%, #050506 100%)`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: bgUrl ? "saturate(0.9) contrast(1.05)" : undefined,
            transform: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.70) 0%, rgba(0,0,0,0.55) 40%, rgba(0,0,0,0.78) 100%)",
          }}
        />
      </div>

      <div
        className="shadowHomeOuter"
        style={{
          position: "relative",
          minHeight: "100svh",
          display: "grid",
          justifyItems: "center",
          alignItems: "start",
          padding: `calc(18px + env(safe-area-inset-top, 0px)) 24px calc(42px + var(--af-mini-player-h, 96px) + env(safe-area-inset-bottom, 0px))`,
        }}
      >
        <section
          style={{
            width: "100%",
            maxWidth: 1120,
            display: "grid",
            gridTemplateRows: "auto auto 1fr",
            alignItems: "start",
            gap: "12px 26px",
          }}
        >
          <div className="shadowHomeGrid" style={{ minHeight: 0 }}>
            <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <div id="af-portal-topbar-slot" />
            </div>

            <div className="shadowHomeMain" style={{ display: "grid", gap: 18 }}>
              <PortalArea
                portalPanel={portalPanel}
                albumSlug={slug}
                album={albumData.album}
                tracks={albumData.tracks}
                albums={browseAlbums}
                attentionMessage={null}
                tier={tier}
                isPatron={isPatron}
                isAdmin={isAdmin}
                canManageBilling={!!member}
                topLogoUrl={page?.topLogoUrl ?? null}
                topLogoHeight={page?.topLogoHeight ?? null}
              />
            </div>

            <aside
              className="shadowHomeSidebar"
              style={{
                position: "sticky",
                top: 22,
                alignSelf: "start",
                display: "grid",
                gap: 14,
              }}
            >
              <StageInline
                height={560}
                cuesByTrackId={albumData.lyrics.cuesByTrackId}
                offsetByTrackId={albumData.lyrics.offsetByTrackId}
              />
            </aside>
          </div>

          <FooterDrawer
            licensingHref={process.env.NEXT_PUBLIC_LABEL_SITE_URL ?? ""}
            emailTo={
              process.env.NEXT_PUBLIC_CONTACT_EMAIL ??
              "administration@angelfishrecords.com"
            }
          />
        </section>
      </div>
    </main>
  );
}
