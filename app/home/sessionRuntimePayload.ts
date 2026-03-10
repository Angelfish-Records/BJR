import type React from "react";
import type { AlbumNavItem, AlbumPlayerBundle } from "@/lib/types";

export type SessionRuntimePayload = {
  portalPanel: React.ReactNode;
  topLogoUrl?: string | null;
  topLogoHeight?: number | null;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
  bundle: AlbumPlayerBundle;
  albums: AlbumNavItem[];
  attentionMessage?: string | null;
  tier?: string | null;
  isPatron?: boolean;
  canManageBilling?: boolean;
};