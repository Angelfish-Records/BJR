//web/app/home/sessionRuntimePayload.ts
import type { AlbumPlayerBundle, Tier } from "@/lib/types";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

/**
 * Server → persistent session shell payload contract.
 *
 * This is intentionally distinct from PortalAreaProps.
 * The runtime layer delivers volatile route/member payload; the shell decides
 * how to reconcile that payload into concrete component props.
 */
export type SessionRuntimePayload = {
  memberId: string | null;
  entitlementKeys: string[];
  memberSummary: PortalMemberSummary | null;
  initialPortalTabId: string | null;
  initialExegesisDisplayId: string | null;
  bundle: AlbumPlayerBundle;
  tier: Tier;
  canManageBilling: boolean;
};
