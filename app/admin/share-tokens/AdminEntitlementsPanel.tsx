"use client";

import React from "react";

type MemberRow = {
  id: string;
  email: string;
  clerk_user_id: string | null;
  created_at: string;
};

type GrantRow = {
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

type AlbumForScope = { id: string; slug: string; title: string };

type CurrentEntitlementRow = {
  entitlement_key: string;
  scope_id: string | null;
  granted_at?: string | null;
  expires_at?: string | null;
};

type SelectedMemberDetails = {
  id: string;
  email: string;
  clerk_user_id: string | null;
  stripe_customer_id: string | null;
  source: string;
  created_at: string;
  updated_at: string;
};

type DashboardTierStat = {
  entitlement_key: string;
  count: number;
};

type DashboardRecentJoin = {
  date: string;
  count: number;
};

type DashboardStats = {
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

type DashboardResponseOk = {
  ok: true;
} & DashboardStats;

type DashboardResponseError = {
  ok?: false;
  error?: string;
};

type DashboardResponse = DashboardResponseOk | DashboardResponseError;

export default function AdminEntitlementsPanel(props: {
  albums: AlbumForScope[];
}) {
  const { albums } = props;

  const [q, setQ] = React.useState("");
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [selected, setSelected] = React.useState<MemberRow | null>(null);

  const [grants, setGrants] = React.useState<GrantRow[]>([]);
  const [current, setCurrent] = React.useState<CurrentEntitlementRow[]>([]);
  const [memberDetails, setMemberDetails] =
    React.useState<SelectedMemberDetails | null>(null);

  const [dashboard, setDashboard] = React.useState<DashboardStats | null>(null);
  const [periodDays, setPeriodDays] = React.useState<number>(30);

  const [key, setKey] = React.useState("");
  const [scopeId, setScopeId] = React.useState<string>("");
  const [reason, setReason] = React.useState("admin_ui");

  const [dashboardBusy, setDashboardBusy] = React.useState(false);
  const [searchBusy, setSearchBusy] = React.useState(false);
  const [memberBusy, setMemberBusy] = React.useState(false);
  const [grantBusy, setGrantBusy] = React.useState(false);
  const [revokeBusyId, setRevokeBusyId] = React.useState<string | null>(null);

  const [error, setError] = React.useState<string | null>(null);

  const tierLabelMap = React.useMemo<Record<string, string>>(
    () => ({
      tier_friend: "Friend",
      tier_patron: "Patron",
      tier_partner: "Partner",
    }),
    [],
  );

  function formatDateTime(value: string | null | undefined): string {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleString();
  }

  function formatDateOnly(value: string | null | undefined): string {
    if (!value) return "—";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return value;
    return parsed.toLocaleDateString();
  }

  function isDashboardResponseOk(
    value: DashboardResponse,
  ): value is DashboardResponseOk {
    return value.ok === true;
  }

  const loadDashboard = React.useCallback(async (nextPeriodDays: number) => {
    setError(null);
    setDashboardBusy(true);
    try {
      const res = await fetch(
        `/api/admin/members/dashboard?periodDays=${encodeURIComponent(
          String(nextPeriodDays),
        )}`,
      );
      const json = (await res.json()) as DashboardResponse;

      if (!res.ok || !isDashboardResponseOk(json)) {
        throw new Error(
          isDashboardResponseOk(json)
            ? "Dashboard load failed"
            : (json.error ?? "Dashboard load failed"),
        );
      }

      setDashboard({
        periodDays: json.periodDays,
        totals: json.totals,
        tiers: Array.isArray(json.tiers) ? json.tiers : [],
        recentJoins: Array.isArray(json.recentJoins) ? json.recentJoins : [],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dashboard load failed");
    } finally {
      setDashboardBusy(false);
    }
  }, []);

  React.useEffect(() => {
    void loadDashboard(periodDays);
  }, [loadDashboard, periodDays]);

  async function runSearch() {
    const query = q.trim();
    setError(null);
    setSearchBusy(true);

    try {
      if (!query) {
        setMembers([]);
        return;
      }

      const res = await fetch(
        `/api/admin/members/search?q=${encodeURIComponent(query)}`,
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Search failed");
      }
      setMembers(Array.isArray(json.members) ? json.members : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setSearchBusy(false);
    }
  }

  async function loadMember(memberId: string) {
    setError(null);
    setMemberBusy(true);
    try {
      const res = await fetch(
        `/api/admin/members/${encodeURIComponent(memberId)}/entitlements`,
      );
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        member?: SelectedMemberDetails | null;
        grants?: GrantRow[];
        current?: CurrentEntitlementRow[];
      };

      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Load failed");
      }

      setMemberDetails(json.member ?? null);
      setGrants(Array.isArray(json.grants) ? json.grants : []);
      setCurrent(
        Array.isArray(json.current)
          ? (json.current as CurrentEntitlementRow[])
          : [],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setMemberBusy(false);
    }
  }

  async function grant() {
    if (!selected) return;
    if (!key.trim()) return;

    setGrantBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/entitlements/grant", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          memberId: selected.id,
          key: key.trim(),
          scopeId: scopeId.trim() || null,
          reason: reason.trim() || "admin_ui",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Grant failed");

      await Promise.all([loadMember(selected.id), loadDashboard(periodDays)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grant failed");
    } finally {
      setGrantBusy(false);
    }
  }

  async function revoke(grantId: string) {
    if (!selected) return;
    setRevokeBusyId(grantId);
    setError(null);
    try {
      const res = await fetch("/api/admin/entitlements/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantId, reason: reason.trim() || "admin_ui" }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Revoke failed");

      await Promise.all([loadMember(selected.id), loadDashboard(periodDays)]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setRevokeBusyId(null);
    }
  }

  const cardStyle: React.CSSProperties = {
    padding: 14,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.04)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(255,255,255,0.92)",
    outline: "none",
  };

  const subtleButtonStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: "rgba(255,255,255,0.9)",
    cursor: "pointer",
  };

  const primaryButtonStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.12)",
    color: "rgba(255,255,255,0.94)",
    fontWeight: 800,
    cursor: "pointer",
  };

  const albumScopeButtons = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 2 }}>
      <button
        type="button"
        onClick={() => setScopeId("catalogue")}
        style={subtleButtonStyle}
      >
        scope: catalogue
      </button>
      {albums.slice(0, 6).map((a) => (
        <button
          key={a.slug}
          type="button"
          onClick={() => setScopeId(`alb:${a.id}`)}
          style={subtleButtonStyle}
          title={a.title}
        >
          alb:{a.id}
        </button>
      ))}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={cardStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}
            >
              MEMBERSHIP DASHBOARD
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>
              Membership overview
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[7, 30, 90].map((days) => {
              const active = periodDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  onClick={() => setPeriodDays(days)}
                  disabled={dashboardBusy}
                  style={{
                    ...subtleButtonStyle,
                    background: active
                      ? "rgba(255,255,255,0.12)"
                      : "rgba(255,255,255,0.04)",
                    opacity: dashboardBusy && !active ? 0.7 : 1,
                    cursor: dashboardBusy ? "default" : "pointer",
                  }}
                >
                  {days}d
                </button>
              );
            })}
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 10,
            marginTop: 14,
          }}
        >
          {[
            {
              label: "Total members",
              value: dashboard?.totals.members ?? "—",
            },
            {
              label: `New in ${periodDays}d`,
              value: dashboard?.totals.joinedInPeriod ?? "—",
            },
            {
              label: "Linked Clerk",
              value: dashboard?.totals.linkedClerk ?? "—",
            },
            {
              label: "Linked Stripe",
              value: dashboard?.totals.linkedStripe ?? "—",
            },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                padding: "12px 12px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.03)",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.58 }}>{item.label}</div>
              <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.8fr)",
            gap: 14,
            marginTop: 14,
          }}
        >
          <div
            style={{
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
              Paid tiers
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {dashboard?.tiers.length ? (
                dashboard.tiers.map((tier) => (
                  <div
                    key={tier.entitlement_key}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.025)",
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 700 }}>
                      {tierLabelMap[tier.entitlement_key] ??
                        tier.entitlement_key}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.82 }}>
                      {tier.count}
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, opacity: 0.58 }}>
                  No active paid tiers found.
                </div>
              )}
            </div>
          </div>

          <div
            style={{
              padding: "12px 12px",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
              Recent joins
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {dashboard?.recentJoins.length ? (
                dashboard.recentJoins.map((entry) => (
                  <div
                    key={entry.date}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      fontSize: 12,
                    }}
                  >
                    <span style={{ opacity: 0.72 }}>{entry.date}</span>
                    <span style={{ fontWeight: 700 }}>{entry.count}</span>
                  </div>
                ))
              ) : (
                <div style={{ fontSize: 12, opacity: 0.58 }}>
                  No recent join data.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}>
          MEMBER SEARCH
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
            marginTop: 12,
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
            placeholder="Search member email prefix…"
            style={{
              ...fieldStyle,
              flex: "1 1 320px",
            }}
          />
          <button
            type="button"
            onClick={() => {
              void runSearch();
            }}
            disabled={searchBusy}
            style={{
              ...primaryButtonStyle,
              minWidth: 96,
              opacity: searchBusy ? 0.6 : 1,
              cursor: searchBusy ? "default" : "pointer",
            }}
          >
            {searchBusy ? "Searching…" : "Search"}
          </button>
        </div>

        {members.length > 0 ? (
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {members.map((m) => {
              const isActive = selected?.id === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={async () => {
                    setSelected(m);
                    await loadMember(m.id);
                  }}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: isActive
                      ? "rgba(255,255,255,0.10)"
                      : "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.92)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.96 }}>
                    {m.email}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 12, opacity: 0.62 }}>
                    member_id: {m.id}
                  </div>
                </button>
              );
            })}
            {q.trim() && !searchBusy && members.length === 0 ? (
              <div style={{ marginTop: 12, fontSize: 12, opacity: 0.58 }}>
                No matching members found.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <div
          style={{
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(255,140,140,0.22)",
            background: "rgba(120,0,0,0.16)",
            color: "#ffd0d0",
          }}
        >
          {error}
        </div>
      ) : null}

      {selected ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={cardStyle}>
            <div
              style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}
            >
              SELECTED MEMBER
            </div>
            <div style={{ marginTop: 6, fontSize: 14, fontWeight: 700 }}>
              {selected.email}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
              member_id: {selected.id}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
                gap: 10,
                marginTop: 14,
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.58 }}>Source</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                  {memberDetails?.source ?? "—"}
                </div>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.58 }}>Clerk</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                  {memberDetails?.clerk_user_id ? "Linked" : "Not linked"}
                </div>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.58 }}>Stripe</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                  {memberDetails?.stripe_customer_id ? "Linked" : "Not linked"}
                </div>
              </div>

              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontSize: 11, opacity: 0.58 }}>Joined</div>
                <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700 }}>
                  {formatDateOnly(
                    memberDetails?.created_at ?? selected.created_at,
                  )}
                </div>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 0.9fr)",
                gap: 14,
                marginTop: 14,
              }}
            >
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
                  Grant entitlement
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    Entitlement key
                  </div>
                  <input
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="e.g. tier_patron, play_album"
                    style={fieldStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>Scope ID</div>
                  <input
                    value={scopeId}
                    onChange={(e) => setScopeId(e.target.value)}
                    placeholder="catalogue OR alb:<albumId>"
                    style={fieldStyle}
                  />
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    Quick scope helpers
                  </div>
                  {albumScopeButtons}
                </div>

                <div style={{ display: "grid", gap: 6 }}>
                  <div style={{ fontSize: 12, opacity: 0.66 }}>Reason</div>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="reason"
                    style={fieldStyle}
                  />
                </div>

                <div style={{ paddingTop: 2 }}>
                  <button
                    type="button"
                    onClick={() => {
                      void grant();
                    }}
                    disabled={grantBusy}
                    style={{
                      ...primaryButtonStyle,
                      opacity: grantBusy ? 0.6 : 1,
                      cursor: grantBusy ? "default" : "pointer",
                    }}
                  >
                    {grantBusy ? "Granting…" : "Grant"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
                    Effective entitlements
                  </div>
                  {memberBusy ? (
                    <div style={{ fontSize: 11, opacity: 0.56 }}>
                      Refreshing…
                    </div>
                  ) : null}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: 8,
                    alignContent: "start",
                  }}
                >
                  {current.map((c, i) => (
                    <div
                      key={`${c.entitlement_key}-${c.scope_id ?? "global"}-${i}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.10)",
                        background: "rgba(255,255,255,0.03)",
                        fontSize: 12,
                      }}
                    >
                      <div style={{ opacity: 0.92, fontWeight: 700 }}>
                        {c.entitlement_key}
                        {c.scope_id ? (
                          <span style={{ opacity: 0.62, fontWeight: 400 }}>
                            {" "}
                            — {c.scope_id}
                          </span>
                        ) : null}
                      </div>

                      {c.granted_at || c.expires_at ? (
                        <div
                          style={{ marginTop: 4, fontSize: 11, opacity: 0.56 }}
                        >
                          {c.granted_at
                            ? `granted ${formatDateTime(c.granted_at)}`
                            : "granted —"}
                          {c.expires_at
                            ? ` · expires ${formatDateTime(c.expires_at)}`
                            : ""}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!current.length ? (
                    <div style={{ fontSize: 12, opacity: 0.58 }}>None.</div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
              Grants (raw history)
            </div>

            <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
              {grants.map((g) => {
                const active =
                  !g.revoked_at &&
                  (!g.expires_at ||
                    new Date(g.expires_at).getTime() > Date.now());

                const revokeBusy = revokeBusyId === g.id;

                return (
                  <div
                    key={g.id}
                    style={{
                      display: "flex",
                      gap: 12,
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "11px 12px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12, opacity: 0.94 }}>
                        <span style={{ fontWeight: 700 }}>
                          {g.entitlement_key}
                        </span>
                        {g.scope_id ? (
                          <span style={{ opacity: 0.62 }}> — {g.scope_id}</span>
                        ) : null}
                      </div>
                      <div
                        style={{ marginTop: 4, fontSize: 11, opacity: 0.56 }}
                      >
                        {active ? "active" : "inactive"} · created{" "}
                        {formatDateTime(g.created_at)}
                        {g.expires_at
                          ? ` · expires ${formatDateTime(g.expires_at)}`
                          : ""}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!active || revokeBusy}
                      onClick={() => {
                        void revoke(g.id);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid rgba(255,120,120,0.22)",
                        background: active
                          ? "rgba(120,0,0,0.16)"
                          : "rgba(255,255,255,0.03)",
                        color: "rgba(255,255,255,0.92)",
                        opacity: !active ? 0.35 : revokeBusy ? 0.6 : 1,
                        cursor: !active || revokeBusy ? "default" : "pointer",
                        flex: "0 0 auto",
                        fontWeight: 700,
                      }}
                    >
                      {revokeBusy ? "Revoking…" : "Revoke"}
                    </button>
                  </div>
                );
              })}

              {!grants.length ? (
                <div style={{ fontSize: 12, opacity: 0.58 }}>No grants.</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
