//web/app/home/PortalViewerProvider.tsx
"use client";

import React from "react";
import type { Tier } from "@/lib/types";

type ViewerCtx = {
  viewerTier: Tier; // "none" | "friend" | "patron" | "partner"
  rawTier: string | null; // whatever was passed from server (for display/debug if needed)
  isSignedIn: boolean;
  isPatron: boolean;
  isPartner: boolean;

  // ✅ portal navigation state (client-owned, seeded from server/runtime)
  portalTabId: string | null;
  setPortalTabId: (next: string | null) => void;

  // ✅ exegesis pin state (client-owned, seeded from server/runtime)
  exegesisrecordingId: string | null;
  setExegesisrecordingId: (next: string | null) => void;
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
  value: Omit<
    ViewerCtx,
    "portalTabId" | "setPortalTabId" | "exegesisrecordingId" | "setExegesisrecordingId"
  >;
  children: React.ReactNode;
  initialPortalTabId?: string | null;
  initialExegesisRecordingId?: string | null;
}) {
  const [portalTabId, setPortalTabId] = React.useState<string | null>(
    (props.initialPortalTabId ?? null)
      ? String(props.initialPortalTabId)
      : null,
  );

  const [exegesisrecordingId, setExegesisrecordingId] = React.useState<string | null>(
    (props.initialExegesisRecordingId ?? null)
      ? String(props.initialExegesisRecordingId)
      : null,
  );

  const ctxValue: ViewerCtx = React.useMemo(
    () => ({
      ...props.value,
      portalTabId,
      setPortalTabId,
      exegesisrecordingId,
      setExegesisrecordingId,
    }),
    [props.value, portalTabId, exegesisrecordingId],
  );

  return (
    <PortalViewerContext.Provider value={ctxValue}>
      {props.children}
    </PortalViewerContext.Provider>
  );
}
