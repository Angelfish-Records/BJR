"use client";

import React from "react";
import Link from "next/link";
import AdminOverlayShell from "./admin/AdminOverlayShell";
import { type AdminPanelId } from "./admin/adminPanels";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

/**
 * Canonical ribbon colours used by both the bar and the collapsed tab.
 * Keep these shared so the chevron feels like part of the same structure.
 */
const ADMIN_RIBBON_BG = "rgba(10,10,14,0.92)";
const ADMIN_RIBBON_GOLD = "rgba(255,215,130,0.95)";

/**
 * Main tuning lever for the collapsed tab position.
 * Increase this number to pull the tab upward further into the ribbon.
 * Decrease it to let the tab hang lower.
 */
const COLLAPSED_TAB_RAISE_PX = 8;

function ChevronIcon(props: { collapsed: boolean }) {
  if (props.collapsed) {
    return (
      <svg
        width="24"
        height="20"
        viewBox="0 0 24 20"
        aria-hidden="true"
        style={{
          display: "block",
          overflow: "visible",
        }}
      >
        {/* inner dark triangle to make the chevron read as a hollow tab */}
        <path d="M7.2 5.6 L12 10.2 L16.8 5.6 Z" fill="rgba(60,50,34,0.96)" />

        {/* gold chevron edge, matched to ribbon border tone */}
        <path
          d="M6 5.6 12 11.8l6-6.2"
          fill="none"
          stroke={ADMIN_RIBBON_GOLD}
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      width="24"
      height="20"
      viewBox="0 0 24 20"
      aria-hidden="true"
      style={{
        display: "block",
        overflow: "visible",
      }}
    >
      <path
        d="M6 12.4 12 6.2l6 6.2"
        fill="none"
        stroke={ADMIN_RIBBON_GOLD}
        strokeWidth="2.6"
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

  const btn: React.CSSProperties = {
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
              height: collapsed ? 6 : 52,
              minHeight: 0,
              borderRadius: 0,
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gridTemplateColumns: "1fr",
              alignItems: "center",
              padding: collapsed ? "0 14px" : "9px 14px",
              background: `
                radial-gradient(circle at 12% 0%, rgba(255,223,160,0.12), transparent 24%),
                linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)),
                ${ADMIN_RIBBON_BG}
              `,
              overflow: collapsed ? "visible" : "hidden",
              position: "relative",
              transition:
                "height 160ms ease, padding 160ms ease, background 160ms ease",
            }}
          >
            <button
              type="button"
              aria-label={
                collapsed ? "Expand admin ribbon" : "Collapse admin ribbon"
              }
              title={collapsed ? "Expand" : "Collapse"}
              onClick={() => setCollapsed((v) => !v)}
              style={{
                width: 34,
                height: 28,
                padding: 0,
                margin: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: ADMIN_RIBBON_GOLD,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 0,
                opacity: 1,
                position: "absolute",
                left: 12,
                top: collapsed ? "100%" : "50%",
                transform: collapsed
                  ? `translateY(-${COLLAPSED_TAB_RAISE_PX}px)`
                  : "translateY(-50%)",
                zIndex: 3,
                pointerEvents: "auto",
              }}
            >
              <ChevronIcon collapsed={collapsed} />
            </button>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                minWidth: 0,
                paddingLeft: 40,
                opacity: collapsed ? 0 : 1,
                pointerEvents: collapsed ? "none" : "auto",
                transition: "opacity 120ms ease",
                visibility: collapsed ? "hidden" : "visible",
              }}
            >
              <button
                type="button"
                style={btn}
                onClick={() => openAdmin("access")}
              >
                Member Access
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => openAdmin("share_tokens")}
              >
                Share Tokens
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => openAdmin("mailbag")}
              >
                Mailbag
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => openAdmin("exegesis")}
              >
                Exegesis Mod
              </button>
              <Link
                href="/admin/campaigns"
                target="_blank"
                style={{
                  ...btn,
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
                  ...btn,
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

      {modal}
    </>
  );
}
