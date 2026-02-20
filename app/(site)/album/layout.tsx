// web/app/(site)/album/layout.tsx
import React from "react";
import { headers } from "next/headers";
import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

import StageInline from "@/app/home/player/StageInline";
import FooterDrawer from "@/app/home/FooterDrawer";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

type ShadowHomeDoc = {
  backgroundImage?: unknown;
};

const shadowHomeQuery = `
  *[_type == "shadowHomePage" && slug.current == $slug][0]{
    backgroundImage
  }
`;

export default async function AlbumLayout(props: { children: React.ReactNode }) {
  headers();

  const page = await client.fetch<ShadowHomeDoc>(
    shadowHomeQuery,
    { slug: "home" },
    { next: { tags: ["shadowHome"] } },
  );

  const bgUrl = page?.backgroundImage
    ? urlFor(page.backgroundImage).width(2400).height(1400).quality(80).url()
    : null;

  const mainStyle: React.CSSProperties = {
    minHeight: "100svh",
    position: "relative",
    backgroundColor: "#050506",
    color: "rgba(255,255,255,0.92)",
  };

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
        .shadowHomeGrid > * {
          min-width: 0;
        }

        .shadowHomeSidebar > * {
          width: 100%;
        }

        @media (max-width: 1060px) {
          .shadowHomeGrid { grid-template-columns: 1fr; }
          .shadowHomeSidebar {
            order: 1;
            position: static !important;
            top: auto !important;
          }
          .shadowHomeMain { order: 0; }
        }

        @media (max-width: 520px) {
          .shadowHomeOuter {
            padding-left: 14px !important;
            padding-right: 14px !important;
          }

          @media (max-width: 1060px) {
            .shadowHomeSidebar { position: static !important; }
          }
        }

        /* Shared hook: portal header slot exists on album pages too (PortalShell portals into this) */
        #af-portal-topbar-slot { min-width: 0; }

        /* Shared hook: keep children from forcing horizontal scroll in grid contexts */
        .shadowHomeMain > * { min-width: 0; }
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
            {/* GRID-WIDE TOP BAR SLOT (PortalShell portals into this) */}
            <div style={{ gridColumn: "1 / -1", minWidth: 0 }}>
              <div id="af-portal-topbar-slot" />
            </div>

            {/* LEFT: page content */}
            <div className="shadowHomeMain" style={{ display: "grid", gap: 18 }}>
              {props.children}
            </div>

            {/* RIGHT: persistent stage for ALL /album/* */}
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
              {/* Don’t pass album-bound cues/offsets here.
                  StageInline already lazy-loads by currentTrackId, so this stays stable. */}
              <StageInline height={560} />
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