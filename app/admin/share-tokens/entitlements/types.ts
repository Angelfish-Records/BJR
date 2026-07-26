"use client";

export type MemberRow = {
  id: string;
  email: string;
  clerk_user_id: string | null;
  created_at: string;
};

export type GrantRow = {
  id: string;
  entitlement_key: string;
  scope_id: string | null;
  scope_meta: unknown;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
  granted_by: string | null;
  grant_reason: string | null;
  grant_source: string | null;
};

export type AlbumForScope = {
  id: string;
  slug: string;
  title: string;
};

export type CurrentEntitlementRow = {
  entitlement_key: string;
  scope_id: string | null;
  granted_at?: string | null;
  expires_at?: string | null;
};

export type SelectedMemberDetails = {
  id: string;
  email: string;
  clerk_user_id: string | null;
  stripe_customer_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

export type StripeWebhookEventRow = {
  event_id: string;
  type: string;
  stripe_object_id: string | null;
  stripe_customer_id: string | null;
  checkout_session_id: string | null;
  subscription_id: string | null;
  handled_at: string | null;
  handler_error: string | null;
  handler_error_at: string | null;
};

export type DashboardTierStat = {
  entitlement_key: string;
  count: number;
};

export type DashboardRecentJoin = {
  date: string;
  count: number;
};

export type DashboardStats = {
  periodDays: number;
  totals: {
    members: number;
    joinedInPeriod: number;
    linkedClerk: number;
    linkedStripe: number;
  };
  tiers: DashboardTierStat[];
  recentJoins: DashboardRecentJoin[];
};

export type DashboardResponse =
  | ({ ok: true } & DashboardStats)
  | {
      ok?: false;
      error?: string;
    };

export type MembersSearchResponse =
  | {
      ok: true;
      members: MemberRow[];
    }
  | {
      ok?: false;
      error?: string;
    };

export type MemberDetailsResponse =
  | {
      ok: true;
      member?: SelectedMemberDetails | null;
      grants?: GrantRow[];
      current?: CurrentEntitlementRow[];
      stripeWebhookEvents?: StripeWebhookEventRow[];
    }
  | {
      ok?: false;
      error?: string;
    };

export type MutationResponse =
  | {
      ok: true;
    }
  | {
      ok?: false;
      error?: string;
    };

export type JoinChartPoint = DashboardRecentJoin & {
  x: number;
  y: number;
};

export type JoinChartModel = {
  points: JoinChartPoint[];
  maxCount: number;
  path: string;
  areaPath: string;
};

export type AccessHealth = {
  tier: "partner" | "patron" | "friend" | "none";
  hasStripeCustomer: boolean;
  hasCataloguePlayback: boolean;
  hasGodDefendDownload: boolean;
  failedWebhookCount: number;
};

export type AdminEntitlementsController = {
  query: string;
  setQuery: (value: string) => void;
  members: MemberRow[];
  selected: MemberRow | null;
  dashboard: DashboardStats | null;
  periodDays: number;
  setPeriodDays: (value: number) => void;
  grants: GrantRow[];
  current: CurrentEntitlementRow[];
  stripeWebhookEvents: StripeWebhookEventRow[];
  memberDetails: SelectedMemberDetails | null;
  entitlementKey: string;
  setEntitlementKey: (value: string) => void;
  scopeId: string;
  setScopeId: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  dashboardBusy: boolean;
  searchBusy: boolean;
  memberBusy: boolean;
  grantBusy: boolean;
  reconcileBusy: boolean;
  revokeBusyId: string | null;
  manualOpen: boolean;
  setManualOpen: (value: boolean) => void;
  auditOpen: boolean;
  setAuditOpen: (value: boolean) => void;
  error: string | null;
  searchMembers: (queryValue: string) => Promise<void>;
  selectMember: (member: MemberRow) => Promise<void>;
  grantEntitlement: () => Promise<void>;
  revokeGrant: (grantId: string) => Promise<void>;
  reconcileStripe: () => Promise<void>;
};
