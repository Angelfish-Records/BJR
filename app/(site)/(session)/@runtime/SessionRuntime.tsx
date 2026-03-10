// web/app/(site)/(session)/@runtime/SessionRuntime.tsx
import React from "react";
import { auth, currentUser } from "@clerk/nextjs/server";

import { client } from "@/sanity/lib/client";
import { urlFor } from "@/sanity/lib/image";

import { ensureMemberByClerk } from "@/lib/members";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";
import { deriveTier } from "@/lib/vocab";

import { fetchPortalPage } from "@/lib/portal";
import {
  emptyPortalMemberSummary,
  type PortalMemberSummary,
} from "@/lib/memberDashboard";
import { buildPortalMemberSummary } from "@/lib/memberDashboardServer";
import PortalSurface from "@/app/home/PortalSurface";
import { SessionRuntimePayloadBridge } from "@/app/home/SessionRuntimePayloadContext";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";

import {
  listAlbumsForBrowse,
  getAlbumBySlug,
  getFeaturedAlbumSlugFromSanity,
} from "@/lib/albums";
import type { AlbumNavItem } from "@/lib/types";

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

export default async function SessionRuntime(props: {
  // When present, this is the “player album” canonical slug for /album/:slug routes.
  albumSlugOverride?: string | null;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
}) {
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
  let memberSummary: PortalMemberSummary = emptyPortalMemberSummary();

  if (userId && email) {
    const ensured = await ensureMemberByClerk({
      clerkUserId: userId,
      email,
      source: "session_runtime_clerk",
      sourceDetail: { route: "(session)" },
    });

    member = { id: ensured.id, created: ensured.created, email };
    entitlementKeys = await listCurrentEntitlementKeys(ensured.id);
    tier = deriveTier(entitlementKeys);

    memberSummary = await buildPortalMemberSummary(ensured.id);
  }

  const isPatron = tier === "patron";

  const portalPanel = portal?.modules?.length ? (
    <PortalSurface
      modules={portal.modules}
      memberId={member?.id ?? null}
      memberSummary={memberSummary}
    />
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

  const featuredAlbumSlug =
    featured.slug ?? featured.fallbackSlug ?? "god-defend";

  const albumSlug = (props.albumSlugOverride ?? "").trim() || featuredAlbumSlug;

  const bundle = await getAlbumBySlug(albumSlug);

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

  const payload: SessionRuntimePayload = {
    portalPanel,
    bundle,
    albums: browseAlbums,
    attentionMessage: null,
    tier,
    isPatron,
    canManageBilling: !!member,
    topLogoUrl: page?.topLogoUrl ?? null,
    topLogoHeight: page?.topLogoHeight ?? null,
    initialPortalTabId: props.initialPortalTabId ?? null,
    initialExegesisDisplayId: props.initialExegesisDisplayId ?? null,
  };

  const routeKey = JSON.stringify({
    albumSlugOverride: props.albumSlugOverride ?? null,
    initialPortalTabId: props.initialPortalTabId ?? null,
    initialExegesisDisplayId: props.initialExegesisDisplayId ?? null,
    resolvedAlbumSlug: bundle.albumSlug,
  });

  return <SessionRuntimePayloadBridge routeKey={routeKey} payload={payload} />;
}
