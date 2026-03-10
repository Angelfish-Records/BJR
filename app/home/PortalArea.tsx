// web/app/home/PortalArea.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import PortalShell, { PortalPanelSpec } from "./PortalShell";
import { usePlayer } from "@/app/home/player/PlayerState";
import { useGlobalTransportKeys } from "./player/useGlobalTransportKeys";
import type { AlbumNavItem, Tier, AlbumPlayerBundle } from "@/lib/types";
import type { PortalModule } from "@/lib/portal";
import type { PortalMemberSummary } from "@/lib/memberDashboard";
import PlayerController from "./player/PlayerController";
import ActivationGate from "@/app/home/ActivationGate";
import { PortalViewerProvider } from "@/app/home/PortalViewerProvider";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import GateSpotlightOverlay from "@/app/home/gating/GateSpotlightOverlay";
import MiniPlayerHost from "./MiniPlayerHost";
import SessionChrome from "./SessionChrome";
import PortalSurface from "./PortalSurface";
import { useSessionSurfaceController } from "./useSessionSurfaceController";
import { usePlaybackReconciliation } from "./usePlaybackReconciliation";

export type PortalAreaProps = {
  portalModules: PortalModule[];
  memberId: string | null;
  entitlementKeys: string[];
  memberSummary?: PortalMemberSummary | null;
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
  bundle: AlbumPlayerBundle;
  albums: AlbumNavItem[];
  attentionMessage?: string | null;
  tier?: string | null;
  isPatron?: boolean;
  // isAdmin is owned at /(site)/layout.tsx via AdminRibbon.
  // PortalArea should not take it as input.
  canManageBilling?: boolean;
};

export default function PortalArea(props: PortalAreaProps) {
  const {
    portalModules,
    memberId,
    entitlementKeys,
    memberSummary = null,
    bundle,
    albums,
    attentionMessage = null,
    tier = null,
    isPatron = false,
    canManageBilling = false,
  } = props;

  const p = usePlayer();
  useGlobalTransportKeys(p, { enabled: true });
  const { isSignedIn: isSignedInRaw } = useAuth();

  const isSignedIn = Boolean(isSignedInRaw);

  const router = useRouter();

  const {
    sp,
    route,
    isPlayer,
    portalTabId,
    effectiveIsPlayer,
    patchQuery,
    forceSurface,
    prefetchPlayer,
    prefetchPortal,
    dismissBanner,
    bannerKind,
    bannerCode,
    openPlayer,
    openPortal,
  } = useSessionSurfaceController({
    defaultAlbumSlug: bundle.albumSlug,
  });

  const { gate: brokerGate } = useGateBroker();

  const brokerAttentionMessage = brokerGate.active?.message?.trim()
    ? brokerGate.active.message
    : null;

  // PortalArea is now broker-driven for gating presentation.
  // PlayerState may still hold transport safety state, but it must not drive UI gating.
  const derivedAttentionMessage =
    attentionMessage ?? brokerAttentionMessage ?? null;

  const spotlightAttention =
    !!derivedAttentionMessage &&
    brokerGate.uiMode === "spotlight" &&
    !isSignedIn;

  const isBrowsingAlbum = false;

  const { onSelectAlbum } = usePlaybackReconciliation({
    player: p,
    bundle,
    albums,
    route,
    isPlayer,
    sp,
    patchQuery,
    forceSurface,
    routerPush: (href) => {
      router.push(href, { scroll: false });
    },
  });

  const viewerTier: Tier =
    tier === "friend" || tier === "patron" || tier === "partner"
      ? tier
      : "none";

  const tierLower = (tier ?? "").toLowerCase();
  const isPartner = tierLower.includes("partner");

  const panels = React.useMemo<PortalPanelSpec[]>(
    () => [
      {
        id: "player",
        label: "Player",
        content: (
          <PlayerController
            bundle={bundle}
            albums={albums}
            onSelectAlbum={onSelectAlbum}
            isBrowsingAlbum={isBrowsingAlbum}
            openPlayerPanel={() => forceSurface("player")}
            viewerTier={viewerTier}
          />
        ),
      },
      {
        id: "portal",
        label: "Portal",
        content: portalModules.length ? (
          <PortalSurface
            modules={portalModules}
            memberId={memberId}
            entitlementKeys={entitlementKeys}
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
        ),
      },
    ],
    [
      bundle,
      albums,
      onSelectAlbum,
      isBrowsingAlbum,
      forceSurface,
      viewerTier,
      portalModules,
      memberId,
      entitlementKeys,
      memberSummary,
    ],
  );

  const gateNodeModal = (
    <ActivationGate
      placement="modal"
      attentionMessage={derivedAttentionMessage}
      canManageBilling={canManageBilling}
      isPatron={isPatron}
      tier={tier}
    >
      <div />
    </ActivationGate>
  );

  return (
    <>
      {/* ✅ All spotlight overlay mechanics are now owned by GateSpotlightOverlay */}
      <GateSpotlightOverlay
        active={spotlightAttention}
        gateNode={gateNodeModal}
      />

      <div
        style={{ height: "100%", minHeight: 0, minWidth: 0, display: "grid" }}
      >
        <PortalViewerProvider
          initialPortalTabId={props.initialPortalTabId ?? null}
          initialExegesisDisplayId={props.initialExegesisDisplayId ?? null}
          value={{
            viewerTier,
            rawTier: tier,
            isSignedIn,
            isPatron,
            isPartner,
          }}
        >
          <PortalShell
            panels={panels}
            defaultPanelId="player"
            syncToQueryParam={false}
            activePanelId={effectiveIsPlayer ? "player" : "portal"}
            keepMountedPanelIds={["player", "portal"]}
            onPanelChange={(panelId) => {
              if (panelId === "player") forceSurface("player");
              else forceSurface("portal");
            }}
            headerPortalId="af-portal-topbar-slot"
            header={() => (
              <SessionChrome
                topLogoUrl={props.topLogoUrl}
                topLogoHeight={props.topLogoHeight}
                effectiveIsPlayer={effectiveIsPlayer}
                portalTabId={portalTabId}
                spotlightAttention={spotlightAttention}
                attentionMessage={derivedAttentionMessage}
                canManageBilling={canManageBilling}
                isPatron={isPatron}
                tier={tier}
                bannerKind={bannerKind}
                bannerCode={bannerCode}
                onDismissBanner={dismissBanner}
                onPrefetchPlayer={prefetchPlayer}
                onPrefetchPortal={prefetchPortal}
                onOpenPlayer={openPlayer}
                onOpenPortal={openPortal}
              />
            )}
          />
        </PortalViewerProvider>
        <MiniPlayerHost onExpand={() => forceSurface("player")} />
      </div>
    </>
  );
}
