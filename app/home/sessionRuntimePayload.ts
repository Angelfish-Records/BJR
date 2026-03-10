//web/app/home/sessionRuntimePayload.ts
import type { AlbumNavItem, AlbumPlayerBundle } from "@/lib/types";
import type { PortalModule } from "@/lib/portal";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

/**
 * Server → persistent session shell payload contract.
 *
 * This is intentionally distinct from PortalAreaProps.
 * The runtime layer delivers route payload; the shell decides how to
 * reconcile that payload into concrete component props.
 */
export type SessionRuntimePayload = {
  portalModules: PortalModule[];
  memberId: string | null;
  entitlementKeys: string[];
  memberSummary?: PortalMemberSummary | null;
  initialPortalTabId?: string | null;
  initialExegesisDisplayId?: string | null;
  bundle: AlbumPlayerBundle;
  albums: AlbumNavItem[];
  attentionMessage?: string | null;
  tier?: string | null;
  isPatron?: boolean;
  canManageBilling?: boolean;
};
