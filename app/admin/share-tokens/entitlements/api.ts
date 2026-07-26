"use client";

import type {
  CurrentEntitlementRow,
  DashboardResponse,
  DashboardStats,
  GrantRow,
  MemberDetailsResponse,
  MemberRow,
  MembersSearchResponse,
  MutationResponse,
  SelectedMemberDetails,
  StripeWebhookEventRow,
} from "./types";

function isDashboardResponseOk(
  value: DashboardResponse,
): value is Extract<DashboardResponse, { ok: true }> {
  return value.ok === true;
}

function isMembersSearchResponseOk(
  value: MembersSearchResponse,
): value is Extract<MembersSearchResponse, { ok: true }> {
  return value.ok === true;
}

function isMemberDetailsResponseOk(
  value: MemberDetailsResponse,
): value is Extract<MemberDetailsResponse, { ok: true }> {
  return value.ok === true;
}

function isMutationResponseOk(
  value: MutationResponse,
): value is Extract<MutationResponse, { ok: true }> {
  return value.ok === true;
}

function responseError(
  value: { error?: string },
  fallback: string,
): string {
  return value.error?.trim() || fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchDashboard(
  periodDays: number,
): Promise<DashboardStats> {
  const response = await fetch(
    `/api/admin/members/dashboard?periodDays=${encodeURIComponent(
      String(periodDays),
    )}`,
  );
  const json = await readJson<DashboardResponse>(response);

  if (!response.ok || !isDashboardResponseOk(json)) {
    throw new Error(
      isDashboardResponseOk(json)
        ? "Dashboard load failed"
        : responseError(json, "Dashboard load failed"),
    );
  }

  return {
    periodDays: json.periodDays,
    totals: json.totals,
    tiers: Array.isArray(json.tiers) ? json.tiers : [],
    recentJoins: Array.isArray(json.recentJoins) ? json.recentJoins : [],
  };
}

export async function searchMembers(
  queryValue: string,
): Promise<MemberRow[]> {
  const query = queryValue.trim();
  const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
  const response = await fetch(`/api/admin/members/search${suffix}`);
  const json = await readJson<MembersSearchResponse>(response);

  if (!response.ok || !isMembersSearchResponseOk(json)) {
    throw new Error(
      isMembersSearchResponseOk(json)
        ? "Member list load failed"
        : responseError(json, "Member list load failed"),
    );
  }

  return Array.isArray(json.members) ? json.members : [];
}

export type LoadedMemberState = {
  memberDetails: SelectedMemberDetails | null;
  grants: GrantRow[];
  current: CurrentEntitlementRow[];
  stripeWebhookEvents: StripeWebhookEventRow[];
};

export async function fetchMemberDetails(
  memberId: string,
): Promise<LoadedMemberState> {
  const response = await fetch(
    `/api/admin/members/${encodeURIComponent(memberId)}/entitlements`,
  );
  const json = await readJson<MemberDetailsResponse>(response);

  if (!response.ok || !isMemberDetailsResponseOk(json)) {
    throw new Error(
      isMemberDetailsResponseOk(json)
        ? "Load failed"
        : responseError(json, "Load failed"),
    );
  }

  return {
    memberDetails: json.member ?? null,
    grants: Array.isArray(json.grants) ? json.grants : [],
    current: Array.isArray(json.current) ? json.current : [],
    stripeWebhookEvents: Array.isArray(json.stripeWebhookEvents)
      ? json.stripeWebhookEvents
      : [],
  };
}

async function requireSuccessfulMutation(
  response: Response,
  fallback: string,
): Promise<void> {
  const json = await readJson<MutationResponse>(response);

  if (!response.ok || !isMutationResponseOk(json)) {
    throw new Error(
      isMutationResponseOk(json)
        ? fallback
        : responseError(json, fallback),
    );
  }
}

export async function grantEntitlement(input: {
  memberId: string;
  key: string;
  scopeId: string | null;
  reason: string;
}): Promise<void> {
  const response = await fetch("/api/admin/entitlements/grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  await requireSuccessfulMutation(response, "Grant failed");
}

export async function revokeEntitlement(input: {
  grantId: string;
  reason: string;
}): Promise<void> {
  const response = await fetch("/api/admin/entitlements/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });

  await requireSuccessfulMutation(response, "Revoke failed");
}

export async function reconcileStripeMember(memberId: string): Promise<void> {
  const response = await fetch(
    `/api/admin/members/${encodeURIComponent(memberId)}/stripe-reconcile`,
    { method: "POST" },
  );

  await requireSuccessfulMutation(response, "Stripe reconcile failed");
}
