// web/app/(site)/(portal)/layout.tsx
import React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { createHash } from "crypto";

import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureMemberByClerk } from "@/lib/members";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";
import { deriveTier } from "@/lib/vocab";

import { fetchPortalPage } from "@/lib/portal";
import PortalModules from "@/app/home/PortalModules";
import PortalArea from "@/app/home/PortalArea";
import {
  listAlbumsForBrowse,
  getAlbumBySlug,
  getFeaturedAlbumSlugFromSanity,
} from "@/lib/albums";
import type { AlbumNavItem } from "@/lib/types";

import StageInlineHost from "@/app/home/player/StageInlineHost";
import FooterDrawer from "@/app/home/FooterDrawer";
import { notFound } from "next/navigation";

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

// ✅ allow-list only. Any random /foo should NOT become a “portal tab”.
const ALLOWED_TABS = new Set<string>([
  "posts",
  "download",
  "about",
  "contact",
  "license",
  "subscribe",
  "faq",
]);

export async function generateMetadata(): Promise<Metadata> {
  const page = await client.fetch<{ subtitle?: string }>(
    `*[_type == "shadowHomePage" && slug.current == "home"][0]{ subtitle }`,
    {},
    { next: { tags: ["shadowHome"] } },
  );

  return {
    title: "Brendan John Roch",
    description: page?.subtitle ?? "Music, posts, downloads, and more.",
  };
}

export default async function PortalTabsLayout(props: {
  children: React.ReactNode;
  params: Promise<{ tab: string }>;
}) {
  headers();

  const { tab } = await props.params;
  const tabKey = (tab ?? "").trim().toLowerCase();

  if (!ALLOWED_TABS.has(tabKey)) notFound();

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const [page, portal, featured] = await Promise.all([
    client.fetch<ShadowHomeDoc>(
      shadowHomeQuery,
      { slug: "home" },
      { next: { tags: ["shadowHome"] } },
    ),
    fetchPortalPage("home"),
    getFeaturedAlbumSlugFromSanity(),
  ]);

  let member: null | { id: string; created: boolean; email: string } = null;
  let entitlementKeys: string[] = [];
  let tier = "none";

  if (userId && email) {
    const ensured = await ensureMemberByClerk({
      clerkUserId: userId,
      email,
      source: "portal_tabs_layout_clerk",
      sourceDetail: { route: `/${tabKey}` },
    });

    member = { id: ensured.id, created: ensured.created, email };
    entitlementKeys = await listCurrentEntitlementKeys(ensured.id);
    tier = deriveTier(entitlementKeys);
  }

  const isPatron = tier === "patron";

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
      No portal modules yet. Create a <code>portalPage</code> with slug{" "}
      <code>home</code> in Sanity Studio.
    </div>
  );

  // Featured album is used for visualizer cues in portal shell.
  const featuredAlbumSlug =
    featured.slug ?? featured.fallbackSlug ?? "consolers";

  const albumSlug = featuredAlbumSlug;
  const albumData = await getAlbumBySlug(albumSlug);

  const cuesObj = albumData.lyrics.cuesByTrackId ?? {};
  const offsetsObj = albumData.lyrics.offsetByTrackId ?? {};

  const cuesJson = JSON.stringify(cuesObj);
  const offsetsJson = JSON.stringify(offsetsObj);

  const sig = createHash("sha1")
    .update(cuesJson)
    .update("|")
    .update(offsetsJson)
    .digest("hex");

  const browseAlbumsRaw = await listAlbumsForBrowse();

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

  return (
    <main style={mainStyle}>
      <style>{`
        .shadowHomeGrid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) clamp(300px, 34vw, 380px);
          gap: 8px 18px;
          align-items: start;
        }
        .shadowHomeMain,
        .shadowHomeSidebar,
        .shadowHomeGrid > * { min-width: 0; }
        .shadowHomeSidebar > * { width: 100%; }

        .portalCardGrid2up {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        @media (max-width: 700px) {
          .portalCardGrid2up { grid-template-columns: 1fr; }
        }
        @media (max-width: 1060px) {
          .shadowHomeGrid { grid-template-columns: 1fr; }
          .shadowHomeSidebar { order: 1; position: static !important; top: auto !important; }
          .shadowHomeMain { order: 0; }
        }
        @media (max-width: 520px) {
          .shadowHomeOuter { padding-left: 14px !important; padding-right: 14px !important; }
          @media (max-width: 1060px) {
            .shadowHomeSidebar { position: static !important; }
          }
        }
      `}</style>

      {/* background layers */}
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
                albumSlug={albumSlug}
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
              {props.children}
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
              <StageInlineHost
                height={560}
                cuesJson={cuesJson}
                offsetsJson={offsetsJson}
                sig={sig}
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