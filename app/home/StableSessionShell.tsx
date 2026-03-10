"use client";

import React from "react";
import PortalArea from "@/app/home/PortalArea";
import {
  SessionRuntimePayloadProvider,
  useSessionRuntimePayloadRecord,
} from "@/app/home/SessionRuntimePayloadContext";

function StableSessionViewport(props: { runtime: React.ReactNode }) {
  const record = useSessionRuntimePayloadRecord();
  const payload = record?.payload ?? null;

  return (
    <>
      <div aria-hidden="true" hidden>
        {props.runtime}
      </div>

      {payload ? (
        <PortalArea
          portalPanel={payload.portalPanel}
          bundle={payload.bundle}
          albums={payload.albums}
          attentionMessage={payload.attentionMessage ?? null}
          tier={payload.tier ?? null}
          isPatron={payload.isPatron ?? false}
          canManageBilling={payload.canManageBilling ?? false}
          topLogoUrl={payload.topLogoUrl ?? null}
          topLogoHeight={payload.topLogoHeight ?? null}
          initialPortalTabId={payload.initialPortalTabId ?? null}
          initialExegesisDisplayId={payload.initialExegesisDisplayId ?? null}
        />
      ) : null}
    </>
  );
}

export default function StableSessionShell(props: {
  runtime: React.ReactNode;
}) {
  return (
    <SessionRuntimePayloadProvider>
      <StableSessionViewport runtime={props.runtime} />
    </SessionRuntimePayloadProvider>
  );
}