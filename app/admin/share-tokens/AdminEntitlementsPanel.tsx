"use client";

import { MemberSearchSection } from "./entitlements/MemberSearchSection";
import { MembershipDashboardSection } from "./entitlements/MembershipDashboardSection";
import { SelectedMemberSections } from "./entitlements/SelectedMemberSections";
import { useAdminEntitlementsController } from "./entitlements/useAdminEntitlementsController";
import type { AlbumForScope } from "./entitlements/types";

type Props = Readonly<{
  albums: AlbumForScope[];
}>;

export default function AdminEntitlementsPanel(props: Props) {
  const controller = useAdminEntitlementsController();

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <MembershipDashboardSection
        dashboard={controller.dashboard}
        periodDays={controller.periodDays}
        selectedId={controller.selected?.id ?? null}
        busy={controller.dashboardBusy}
        onPeriodChange={controller.setPeriodDays}
        onSelectMember={controller.selectMember}
      />

      <MemberSearchSection
        query={controller.query}
        members={controller.members}
        selectedId={controller.selected?.id ?? null}
        busy={controller.searchBusy}
        onQueryChange={controller.setQuery}
        onSearch={controller.searchMembers}
        onSelectMember={controller.selectMember}
      />

      {controller.error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,140,140,0.22)",
            background: "rgba(120,0,0,0.16)",
            color: "#ffd0d0",
          }}
        >
          {controller.error}
        </div>
      ) : null}

      {controller.selected ? (
        <SelectedMemberSections
          albums={props.albums}
          selected={controller.selected}
          memberDetails={controller.memberDetails}
          current={controller.current}
          stripeWebhookEvents={controller.stripeWebhookEvents}
          memberBusy={controller.memberBusy}
          reconcileBusy={controller.reconcileBusy}
          grantBusy={controller.grantBusy}
          manualOpen={controller.manualOpen}
          entitlementKey={controller.entitlementKey}
          scopeId={controller.scopeId}
          reason={controller.reason}
          onManualOpenChange={controller.setManualOpen}
          onEntitlementKeyChange={controller.setEntitlementKey}
          onScopeIdChange={controller.setScopeId}
          onReasonChange={controller.setReason}
          onGrant={controller.grantEntitlement}
          onReconcileStripe={controller.reconcileStripe}
          events={controller.stripeWebhookEvents}
          grants={controller.grants}
          open={controller.auditOpen}
          revokeBusyId={controller.revokeBusyId}
          onOpenChange={controller.setAuditOpen}
          onRevoke={controller.revokeGrant}
        />
      ) : null}
    </div>
  );
}
