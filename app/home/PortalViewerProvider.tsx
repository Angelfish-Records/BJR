//web/app/home/PortalViewerProvider.tsx
"use client";

import React from "react";
import type { Tier } from "@/lib/types";
import { isPartnerTier, isPatronTier } from "./membershipTier";

type ViewerCtx = {
  tier: Tier;
  isSignedIn: boolean;
  isPatron: boolean;
  isPartner: boolean;
  portalTabId: string | null;
  setPortalTabId: (next: string | null) => void;
  exegesisDisplayId: string | null;
  setExegesisDisplayId: (next: string | null) => void;
};

const PortalViewerContext = React.createContext<ViewerCtx | null>(null);

export function usePortalViewer(): ViewerCtx {
  const ctx = React.useContext(PortalViewerContext);
  if (!ctx) {
    throw new Error("usePortalViewer must be used within PortalViewerProvider");
  }
  return ctx;
}

export function PortalViewerProvider(props: {
  value: {
    tier: Tier;
    isSignedIn: boolean;
  };
  children: React.ReactNode;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
}) {
  const [portalTabId, setPortalTabId] = React.useState<string | null>(
    (props.initialPortalTabId ?? null)
      ? String(props.initialPortalTabId)
      : null,
  );

  const [exegesisDisplayId, setExegesisDisplayId] = React.useState<
    string | null
  >(
    (props.initialExegesisDisplayId ?? null)
      ? String(props.initialExegesisDisplayId)
      : null,
  );

  const ctxValue: ViewerCtx = React.useMemo(
    () => ({
      tier: props.value.tier,
      isSignedIn: props.value.isSignedIn,
      isPatron: isPatronTier(props.value.tier),
      isPartner: isPartnerTier(props.value.tier),
      portalTabId,
      setPortalTabId,
      exegesisDisplayId,
      setExegesisDisplayId,
    }),
    [props.value, portalTabId, exegesisDisplayId],
  );

  return (
    <PortalViewerContext.Provider value={ctxValue}>
      {props.children}
    </PortalViewerContext.Provider>
  );
}
