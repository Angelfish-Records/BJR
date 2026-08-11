"use client";

import React from "react";

import {
  fetchDashboard,
  fetchMemberDetails,
  grantEntitlement as requestGrantEntitlement,
  reconcileStripeMember,
  revokeEntitlement as requestRevokeEntitlement,
  searchMembers as requestMembersSearch,
} from "./api";
import type {
  AdminEntitlementsController,
  CurrentEntitlementRow,
  DashboardStats,
  GrantRow,
  MemberRow,
  SelectedMemberDetails,
  StripeWebhookEventRow,
} from "./types";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useAdminEntitlementsController(): AdminEntitlementsController {
  const [query, setQuery] = React.useState("");
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [selected, setSelected] = React.useState<MemberRow | null>(null);

  const [grants, setGrants] = React.useState<GrantRow[]>([]);
  const [current, setCurrent] = React.useState<CurrentEntitlementRow[]>([]);
  const [stripeWebhookEvents, setStripeWebhookEvents] = React.useState<
    StripeWebhookEventRow[]
  >([]);
  const [memberDetails, setMemberDetails] =
    React.useState<SelectedMemberDetails | null>(null);

  const [dashboard, setDashboard] = React.useState<DashboardStats | null>(null);
  const [periodDays, setPeriodDays] = React.useState(30);

  const [entitlementKey, setEntitlementKey] = React.useState("");
  const [scopeId, setScopeId] = React.useState("");
  const [reason, setReason] = React.useState("");

  const [dashboardBusy, setDashboardBusy] = React.useState(false);
  const [searchBusy, setSearchBusy] = React.useState(false);
  const [memberBusy, setMemberBusy] = React.useState(false);
  const [grantBusy, setGrantBusy] = React.useState(false);
  const [reconcileBusy, setReconcileBusy] = React.useState(false);
  const [revokeBusyId, setRevokeBusyId] = React.useState<string | null>(null);

  const [manualOpen, setManualOpen] = React.useState(false);
  const [auditOpen, setAuditOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadDashboard = React.useCallback(async (nextPeriodDays: number) => {
    setError(null);
    setDashboardBusy(true);

    try {
      setDashboard(await fetchDashboard(nextPeriodDays));
    } catch (loadError: unknown) {
      setError(errorMessage(loadError, "Dashboard load failed"));
    } finally {
      setDashboardBusy(false);
    }
  }, []);

  const searchMembers = React.useCallback(async (queryValue: string) => {
    setError(null);
    setSearchBusy(true);

    try {
      setMembers(await requestMembersSearch(queryValue));
    } catch (searchError: unknown) {
      setError(errorMessage(searchError, "Member list load failed"));
    } finally {
      setSearchBusy(false);
    }
  }, []);

  const loadMember = React.useCallback(async (memberId: string) => {
    setError(null);
    setMemberBusy(true);

    try {
      const loaded = await fetchMemberDetails(memberId);
      setMemberDetails(loaded.memberDetails);
      setGrants(loaded.grants);
      setCurrent(loaded.current);
      setStripeWebhookEvents(loaded.stripeWebhookEvents);
    } catch (loadError: unknown) {
      setError(errorMessage(loadError, "Load failed"));
    } finally {
      setMemberBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDashboard(periodDays);
  }, [loadDashboard, periodDays]);

  React.useEffect(() => {
    void searchMembers("");
  }, [searchMembers]);

  const refreshAfterMutation = React.useCallback(
    async (memberId: string) => {
      await Promise.all([
        loadMember(memberId),
        loadDashboard(periodDays),
      ]);
    },
    [loadDashboard, loadMember, periodDays],
  );

  const selectMember = React.useCallback(
    async (member: MemberRow) => {
      setSelected(member);
      setEntitlementKey("");
      setScopeId("");
      setReason("");
      setManualOpen(false);
      setAuditOpen(false);
      await loadMember(member.id);
    },
    [loadMember],
  );

  const grantEntitlement = React.useCallback(async () => {
    const member = selected;
    const normalizedKey = entitlementKey.trim();

    if (!member || !normalizedKey) {
      return;
    }

    setGrantBusy(true);
    setError(null);

    try {
      await requestGrantEntitlement({
        memberId: member.id,
        key: normalizedKey,
        scopeId: scopeId.trim() || null,
        reason: reason.trim() || "admin_ui",
      });
      await refreshAfterMutation(member.id);
    } catch (grantError: unknown) {
      setError(errorMessage(grantError, "Grant failed"));
    } finally {
      setGrantBusy(false);
    }
  }, [
    entitlementKey,
    reason,
    refreshAfterMutation,
    scopeId,
    selected,
  ]);

  const revokeGrant = React.useCallback(
    async (grantId: string) => {
      const member = selected;

      if (!member) {
        return;
      }

      setRevokeBusyId(grantId);
      setError(null);

      try {
        await requestRevokeEntitlement({
          grantId,
          reason: reason.trim() || "admin_ui",
        });
        await refreshAfterMutation(member.id);
      } catch (revokeError: unknown) {
        setError(errorMessage(revokeError, "Revoke failed"));
      } finally {
        setRevokeBusyId(null);
      }
    },
    [reason, refreshAfterMutation, selected],
  );

  const reconcileStripe = React.useCallback(async () => {
    const member = selected;

    if (!member) {
      return;
    }

    setReconcileBusy(true);
    setError(null);

    try {
      await reconcileStripeMember(member.id);
      await refreshAfterMutation(member.id);
    } catch (reconcileError: unknown) {
      setError(errorMessage(reconcileError, "Stripe reconcile failed"));
    } finally {
      setReconcileBusy(false);
    }
  }, [refreshAfterMutation, selected]);

  return {
    query,
    setQuery,
    members,
    selected,
    dashboard,
    periodDays,
    setPeriodDays,
    grants,
    current,
    stripeWebhookEvents,
    memberDetails,
    entitlementKey,
    setEntitlementKey,
    scopeId,
    setScopeId,
    reason,
    setReason,
    dashboardBusy,
    searchBusy,
    memberBusy,
    grantBusy,
    reconcileBusy,
    revokeBusyId,
    manualOpen,
    setManualOpen,
    auditOpen,
    setAuditOpen,
    error,
    searchMembers,
    selectMember,
    grantEntitlement,
    revokeGrant,
    reconcileStripe,
  };
}
