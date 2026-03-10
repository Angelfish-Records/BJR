//web/app/home/StableSessionShell.tsx
"use client";

import React from "react";
import PortalArea, { type PortalAreaProps } from "@/app/home/PortalArea";
import {
  SessionRuntimePayloadProvider,
  useSessionRuntimePayloadRecord,
} from "@/app/home/SessionRuntimePayloadContext";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";

type ShellConfig = {
  topLogoUrl: string | null;
  topLogoHeight: number | null;
  featuredAlbumSlug: string;
  albums: PortalAreaProps["albums"];
  portalModules: PortalAreaProps["portalModules"];
};

function toPortalAreaProps(
  payload: SessionRuntimePayload,
  shell: ShellConfig,
): PortalAreaProps {
  return {
    portalModules: shell.portalModules,
    memberId: payload.memberId,
    entitlementKeys: payload.entitlementKeys,
    memberSummary: payload.memberSummary,

    topLogoUrl: shell.topLogoUrl,
    topLogoHeight: shell.topLogoHeight,

    initialPortalTabId: payload.initialPortalTabId,
    initialExegesisDisplayId: payload.initialExegesisDisplayId,

    bundle: payload.bundle,
    albums: shell.albums,
    featuredAlbumSlug: shell.featuredAlbumSlug,

    tier: payload.tier,
    isPatron: payload.tier === "patron",
    canManageBilling: payload.canManageBilling,
  };
}

function StableSessionViewport(props: {
  runtime: React.ReactNode;
  shell: ShellConfig;
}) {
  const record = useSessionRuntimePayloadRecord();
  const payload = record?.payload ?? null;

  const portalAreaProps = React.useMemo(() => {
    if (!payload) return null;
    return toPortalAreaProps(payload, props.shell);
  }, [payload, props.shell]);

  return (
    <>
      {/* Runtime payload bridge subtree */}
      <div aria-hidden="true" hidden>
        {props.runtime}
      </div>

      {/* Persistent UI shell */}
      {portalAreaProps ? <PortalArea {...portalAreaProps} /> : null}
    </>
  );
}

export default function StableSessionShell(props: {
  runtime: React.ReactNode;
  topLogoUrl: string | null;
  topLogoHeight: number | null;
  featuredAlbumSlug: string;
  albums: PortalAreaProps["albums"];
  portalModules: PortalAreaProps["portalModules"];
}) {
  const shell: ShellConfig = {
    topLogoUrl: props.topLogoUrl,
    topLogoHeight: props.topLogoHeight,
    featuredAlbumSlug: props.featuredAlbumSlug,
    albums: props.albums,
    portalModules: props.portalModules,
  };

  return (
    <SessionRuntimePayloadProvider>
      <StableSessionViewport runtime={props.runtime} shell={shell} />
    </SessionRuntimePayloadProvider>
  );
}
