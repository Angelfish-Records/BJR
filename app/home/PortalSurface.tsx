// web/app/home/PortalSurface.tsx
import React from "react";
import PortalModules from "@/app/home/PortalModules";
import type { PortalModule } from "@/lib/portal";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

type Props = {
  modules: PortalModule[];
  memberId: string | null;
  entitlementKeys: string[];
  memberSummary?: PortalMemberSummary | null;
};

export default function PortalSurface(props: Props) {
  // Runtime-native portal composition boundary.
  // Viewer-specific surfaces (member dashboard, future telemetry cards, etc.)
  // should be routed through this layer, then injected into the appropriate
  // tab content rather than rendered above the tab system.
  const { modules, memberId, entitlementKeys, memberSummary } = props;

  return (
    <PortalModules
      modules={modules}
      memberId={memberId}
      entitlementKeys={entitlementKeys}
      memberSummary={memberSummary ?? null}
    />
  );
}
