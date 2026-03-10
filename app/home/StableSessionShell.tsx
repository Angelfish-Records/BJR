//web/app/home/StableSessionShell.tsx
"use client";

import React from "react";
import PortalArea, { type PortalAreaProps } from "@/app/home/PortalArea";
import {
  SessionRuntimePayloadProvider,
  useSessionRuntimePayloadRecord,
} from "@/app/home/SessionRuntimePayloadContext";
import type { SessionRuntimePayload } from "@/app/home/sessionRuntimePayload";

function toPortalAreaProps(
  payload: SessionRuntimePayload,
  shellConfig: {
    topLogoUrl: string | null;
    topLogoHeight: number | null;
  },
): PortalAreaProps {
  return {
    portalModules: payload.portalModules,
    memberId: payload.memberId,
    entitlementKeys: payload.entitlementKeys,
    memberSummary: payload.memberSummary ?? null,
    topLogoUrl: shellConfig.topLogoUrl,
    topLogoHeight: shellConfig.topLogoHeight,
    initialPortalTabId: payload.initialPortalTabId ?? null,
    initialExegesisDisplayId: payload.initialExegesisDisplayId ?? null,
    bundle: payload.bundle,
    albums: payload.albums,
    attentionMessage: payload.attentionMessage ?? null,
    tier: payload.tier ?? null,
    isPatron: payload.isPatron ?? false,
    canManageBilling: payload.canManageBilling ?? false,
  };
}
function StableSessionViewport(props: {
  runtime: React.ReactNode;
  topLogoUrl: string | null;
  topLogoHeight: number | null;
}) {
  const record = useSessionRuntimePayloadRecord();
  const payload = record?.payload ?? null;

  const portalAreaProps = React.useMemo(
    () =>
      payload
        ? toPortalAreaProps(payload, {
            topLogoUrl: props.topLogoUrl,
            topLogoHeight: props.topLogoHeight,
          })
        : null,
    [payload, props.topLogoUrl, props.topLogoHeight],
  );

  return (
    <>
      <div aria-hidden="true" hidden>
        {props.runtime}
      </div>

      {portalAreaProps ? <PortalArea {...portalAreaProps} /> : null}
    </>
  );
}

export default function StableSessionShell(props: {
  runtime: React.ReactNode;
  topLogoUrl: string | null;
  topLogoHeight: number | null;
}) {
  return (
    <SessionRuntimePayloadProvider>
      <StableSessionViewport
        runtime={props.runtime}
        topLogoUrl={props.topLogoUrl}
        topLogoHeight={props.topLogoHeight}
      />
    </SessionRuntimePayloadProvider>
  );
}
