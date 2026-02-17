"use client";

import React from "react";
import type { Tier } from "@/lib/types";

type ViewerCtx = {
  viewerTier: Tier;        // "none" | "friend" | "patron" | "partner"
  rawTier: string | null;  // whatever was passed from server (for display/debug if needed)
  isSignedIn: boolean;
  isPatron: boolean;
  isPartner: boolean;
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
  value: ViewerCtx;
  children: React.ReactNode;
}) {
  return (
    <PortalViewerContext.Provider value={props.value}>
      {props.children}
    </PortalViewerContext.Provider>
  );
}
