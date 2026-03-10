// web/app/(site)/(session)/@runtime/SessionRuntime.tsx
import React from "react";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureMemberByClerk } from "@/lib/members";
import { listCurrentEntitlementKeys } from "@/lib/entitlements";
import { deriveTier } from "@/lib/vocab";
import type { Tier } from "@/lib/types";
import {
  emptyPortalMemberSummary,
  type PortalMemberSummary,
} from "@/lib/memberDashboard";
import { buildPortalMemberSummary } from "@/lib/memberDashboardServer";
import { SessionRuntimePayloadBridge } from "@/app/home/SessionRuntimePayloadContext";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";
import { getAlbumBySlug } from "@/lib/albums";

export default async function SessionRuntime(props: {
  // When present, this is the “player album” canonical slug for /album/:slug routes.
  albumSlugOverride?: string | null;
  featuredAlbumSlug?: string | null;
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

  let member: null | { id: string; created: boolean; email: string } = null;
  let entitlementKeys: string[] = [];
  let tier: Tier = "none";
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

  const selectedAlbumSlug =
    (props.albumSlugOverride ?? "").trim() ||
    (props.featuredAlbumSlug ?? "").trim() ||
    "god-defend";

  const bundle = await getAlbumBySlug(selectedAlbumSlug);

  const payload: SessionRuntimePayload = {
    memberId: member?.id ?? null,
    entitlementKeys,
    memberSummary,
    initialPortalTabId: props.initialPortalTabId ?? null,
    initialExegesisDisplayId: props.initialExegesisDisplayId ?? null,
    bundle,
    tier,
    canManageBilling: !!member,
  };

  const routeKey = JSON.stringify({
    selectedAlbumSlug: bundle.albumSlug,
    initialPortalTabId: props.initialPortalTabId ?? null,
    initialExegesisDisplayId: props.initialExegesisDisplayId ?? null,
  });

  return <SessionRuntimePayloadBridge routeKey={routeKey} payload={payload} />;
}
