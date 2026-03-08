import React from "react";
import PortalModules from "@/app/home/PortalModules";
import PortalMemberPanel from "@/app/home/modules/PortalMemberPanel";
import type { PortalModule } from "@/lib/portal";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

type Props = {
  modules: PortalModule[];
  memberId: string | null;
  memberSummary?: PortalMemberSummary | null;
};

function hasMeaningfulMemberSummary(
  summary: PortalMemberSummary | null | undefined,
): boolean {
  if (!summary) return false;
  if (summary.identity) return true;
  if (summary.contributionCount != null) return true;
  if (summary.minutesStreamed != null) return true;
  if (summary.favouriteTrack) return true;
  if (summary.badges.length > 0) return true;
  return false;
}

export default function PortalSurface(props: Props) {
  // Runtime-native portal composition boundary.
  // Viewer-specific surfaces (member dashboard, future telemetry cards, etc.)
  // should be assembled here, above the authored-module renderer.
  const { modules, memberId, memberSummary } = props;

  const showMemberPanel = hasMeaningfulMemberSummary(memberSummary);

  if (!showMemberPanel || !memberSummary) {
    return <PortalModules modules={modules} memberId={memberId} />;
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 14,
        minWidth: 0,
      }}
    >
      <div
        className="portalSurfaceRuntimeGrid"
        style={{
          display: "grid",
          gap: 14,
          gridTemplateColumns: "repeat(1, minmax(0, 1fr))",
          minWidth: 0,
        }}
      >
        <PortalMemberPanel summary={memberSummary} />
      </div>

      <PortalModules modules={modules} memberId={memberId} />
    </div>
  );
}