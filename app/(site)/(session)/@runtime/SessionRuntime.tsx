// web/app/(site)/(session)/@runtime/SessionRuntime.tsx
import React from "react";
import { auth, currentUser } from "@clerk/nextjs/server";

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
import { SessionRuntimePayloadBridge } from "@/app/home/SessionRuntimePayloadContext";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";

import {
  listAlbumsForBrowse,
  getAlbumBySlug,
  getFeaturedAlbumSlugFromSanity,
} from "@/lib/albums";
import type { AlbumNavItem } from "@/lib/types";

export default async function SessionRuntime(props: {
  // When present, this is the “player album” canonical slug for /album/:slug routes.
  albumSlugOverride?: string | null;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
}) {
  // Important: this file is now a route-payload loader only.
  // It must not directly instantiate the persistent session shell.
  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  const [portal, featured] = await Promise.all([
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
    portalModules: portal?.modules ?? [],
    memberId: member?.id ?? null,
    entitlementKeys,
    memberSummary,
    initialPortalTabId: props.initialPortalTabId ?? null,
    initialExegesisDisplayId: props.initialExegesisDisplayId ?? null,
    bundle,
    albums: browseAlbums,
    attentionMessage: null,
    tier,
    isPatron,
    canManageBilling: !!member,
  };

  const routeKey = JSON.stringify({
    albumSlugOverride: props.albumSlugOverride ?? null,
    initialPortalTabId: props.initialPortalTabId ?? null,
    initialExegesisDisplayId: props.initialExegesisDisplayId ?? null,
    resolvedAlbumSlug: bundle.albumSlug,
  });

  return <SessionRuntimePayloadBridge routeKey={routeKey} payload={payload} />;
}
