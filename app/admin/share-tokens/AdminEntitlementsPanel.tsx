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

export default function AdminEntitlementsPanel(props: {
  albums: AlbumForScope[];
}) {
  const { albums } = props;

  const [q, setQ] = React.useState("");
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [selected, setSelected] = React.useState<MemberRow | null>(null);

  const [grants, setGrants] = React.useState<GrantRow[]>([]);
  const [current, setCurrent] = React.useState<
    Array<{ entitlement_key: string; scope_id: string | null }>
  >([]);

  const [key, setKey] = React.useState("");
  const [scopeId, setScopeId] = React.useState<string>("");
  const [reason, setReason] = React.useState("admin_ui");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runSearch() {
    setError(null);
    const res = await fetch(
      `/api/admin/members/search?q=${encodeURIComponent(q.trim())}`,
    );
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error ?? "Search failed");
      return;
    }
    setMembers(Array.isArray(json.members) ? json.members : []);
  }

  async function loadMember(memberId: string) {
    setError(null);
    const res = await fetch(
      `/api/admin/members/${encodeURIComponent(memberId)}/entitlements`,
    );
    const json = await res.json();
    if (!res.ok || !json?.ok) {
      setError(json?.error ?? "Load failed");
      return;
    }
    setGrants(Array.isArray(json.grants) ? json.grants : []);
    setCurrent(Array.isArray(json.current) ? json.current : []);
  }

  async function grant() {
    if (!selected) return;
    if (!key.trim()) return;

    setBusy("grant");
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
      await loadMember(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Grant failed");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(grantId: string) {
    if (!selected) return;
    setBusy(`revoke:${grantId}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/entitlements/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grantId, reason: reason.trim() || "admin_ui" }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Revoke failed");
      await loadMember(selected.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(null);
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
      <div style={{ display: "grid", gap: 10 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search member email prefix…"
            style={{
              ...fieldStyle,
              flex: "1 1 320px",
            }}
          />
          <button
            type="button"
            onClick={runSearch}
            style={{
              ...primaryButtonStyle,
              minWidth: 96,
            }}
          >
            Search
          </button>
        </div>

        {members.length > 0 ? (
          <div style={{ display: "grid", gap: 8 }}>
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
            <div style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.56 }}>
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
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    Scope ID
                  </div>
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
                  <div style={{ fontSize: 12, opacity: 0.66 }}>
                    Reason
                  </div>
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
                    onClick={grant}
                    disabled={busy === "grant"}
                    style={{
                      ...primaryButtonStyle,
                      opacity: busy === "grant" ? 0.6 : 1,
                      cursor: busy === "grant" ? "default" : "pointer",
                    }}
                  >
                    {busy === "grant" ? "Granting…" : "Grant"}
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
                  Effective entitlements
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
                      <span style={{ opacity: 0.92, fontWeight: 700 }}>
                        {c.entitlement_key}
                      </span>
                      {c.scope_id ? (
                        <span style={{ opacity: 0.62 }}> — {c.scope_id}</span>
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

                const revokeBusy = busy === `revoke:${g.id}`;

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
                        <span style={{ fontWeight: 700 }}>{g.entitlement_key}</span>
                        {g.scope_id ? (
                          <span style={{ opacity: 0.62 }}> — {g.scope_id}</span>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.56 }}>
                        {active ? "active" : "inactive"} · {g.id}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!active || revokeBusy}
                      onClick={() => revoke(g.id)}
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