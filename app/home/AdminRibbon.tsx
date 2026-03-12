// web/app/home/AdminRibbon.tsx
"use client";

import React from "react";
import Link from "next/link";
import AdminOverlayShell from "./admin/AdminOverlayShell";
import { type AdminPanelId } from "./admin/adminPanels";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

const ADMIN_RIBBON_BG = "rgba(10,10,14,0.92)";
const ADMIN_RIBBON_GOLD = "rgba(255,215,130,0.95)";
const ADMIN_RIBBON_GOLD_SOFT = "rgba(255,215,130,0.2)";

function ChevronIcon(props: { collapsed: boolean }) {
  return props.collapsed ? (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <path
        d="M3.5 6 8 10.25 12.5 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{ display: "block", flex: "0 0 auto" }}
    >
      <path
        d="M3.5 10 8 5.75 12.5 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function AdminRibbon(props: { isAdmin: boolean }) {
  const [adminOpen, setAdminOpen] = React.useState(false);
  const [adminPanel, setAdminPanel] = React.useState<AdminPanelId>("access");
  const [collapsed, setCollapsed] = React.useState(false);

  function openAdmin(panel: AdminPanelId) {
    setAdminPanel(panel);
    setAdminOpen(true);
  }

  if (!ENABLED) return null;
  if (!props.isAdmin) return null;

  const actionBtn: React.CSSProperties = {
    height: 32,
    padding: "0 12px",
    borderRadius: 11,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(255,255,255,0.05)",
    color: "rgba(255,255,255,0.94)",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
    transition:
      "background 140ms ease, opacity 140ms ease, transform 140ms ease",
  };

  const toggleBtn: React.CSSProperties = {
    height: 32,
    padding: "0 12px 0 10px",
    borderRadius: 999,
    border: `1px solid ${ADMIN_RIBBON_GOLD_SOFT}`,
    background: "rgba(255,215,130,0.08)",
    color: ADMIN_RIBBON_GOLD,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.3,
    lineHeight: 1,
    cursor: "pointer",
    whiteSpace: "nowrap",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.05), 0 0 0 1px rgba(0,0,0,0.16)",
    transition:
      "background 140ms ease, border-color 140ms ease, transform 140ms ease, opacity 140ms ease",
  };

  const modal = (
    <AdminOverlayShell
      open={adminOpen}
      activePanel={adminPanel}
      onClose={() => setAdminOpen(false)}
      onSelectPanel={setAdminPanel}
    />
  );

  return (
    <>
      <div
        id="af-admin-configbar"
        className="portalPanel--gold"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          width: "100%",
          padding: "0 0 2px",
          background: "transparent",
        }}
      >
        <div
          className="portalPanelFrame--gold"
          style={{
            borderRadius: 0,
            padding: "0 0 1px",
            boxShadow:
              "0 14px 36px rgba(0,0,0,0.32), 0 28px 70px rgba(0,0,0,0.24)",
          }}
        >
          <div
            className="portalPanelInner--gold"
            style={{
              minHeight: 0,
              borderRadius: 0,
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              padding: collapsed ? "8px 14px" : "9px 14px",
              background: `
                radial-gradient(circle at 12% 0%, rgba(255,223,160,0.12), transparent 24%),
                linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)),
                ${ADMIN_RIBBON_BG}
              `,
              position: "relative",
              transition: "padding 160ms ease, background 160ms ease",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                minWidth: 0,
                flexWrap: "nowrap",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  minWidth: 0,
                  flex: "0 0 auto",
                }}
              >
                <button
                  type="button"
                  aria-expanded={!collapsed}
                  aria-controls="af-admin-ribbon-actions"
                  aria-label={
                    collapsed ? "Expand admin ribbon" : "Collapse admin ribbon"
                  }
                  title={collapsed ? "Show admin tools" : "Hide admin tools"}
                  onClick={() => setCollapsed((value) => !value)}
                  style={toggleBtn}
                >
                  <ChevronIcon collapsed={collapsed} />
                  <span>Admin tools</span>
                </button>

                {!collapsed ? (
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.35,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.5)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Debug ribbon
                  </div>
                ) : null}
              </div>

              <div
                id="af-admin-ribbon-actions"
                aria-hidden={collapsed}
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  minWidth: 0,
                  flex: "1 1 auto",
                  maxWidth: collapsed ? 0 : "100%",
                  opacity: collapsed ? 0 : 1,
                  overflow: "hidden",
                  pointerEvents: collapsed ? "none" : "auto",
                  visibility: collapsed ? "hidden" : "visible",
                  transition:
                    "opacity 120ms ease, max-width 180ms ease, visibility 120ms ease",
                }}
              >
                <button
                  type="button"
                  style={actionBtn}
                  onClick={() => openAdmin("access")}
                >
                  Member Access
                </button>
                <button
                  type="button"
                  style={actionBtn}
                  onClick={() => openAdmin("badges")}
                >
                  Badges
                </button>
                <button
                  type="button"
                  style={actionBtn}
                  onClick={() => openAdmin("playback")}
                >
                  Playback
                </button>
                <button
                  type="button"
                  style={actionBtn}
                  onClick={() => openAdmin("share_tokens")}
                >
                  Share Tokens
                </button>
                <button
                  type="button"
                  style={actionBtn}
                  onClick={() => openAdmin("mailbag")}
                >
                  Mailbag
                </button>
                <button
                  type="button"
                  style={actionBtn}
                  onClick={() => openAdmin("exegesis")}
                >
                  Exegesis Mod
                </button>
                <Link
                  href="/admin/campaigns"
                  target="_blank"
                  style={{
                    ...actionBtn,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  Campaigns
                </Link>
                <Link
                  href="/studio"
                  target="_blank"
                  style={{
                    ...actionBtn,
                    display: "inline-flex",
                    alignItems: "center",
                    textDecoration: "none",
                  }}
                >
                  Sanity Studio
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {modal}
    </>
  );
}
