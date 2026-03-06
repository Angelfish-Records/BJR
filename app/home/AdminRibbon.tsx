"use client";

import React from "react";
import Link from "next/link";
import AdminOverlayShell from "./admin/AdminOverlayShell";
import { type AdminPanelId } from "./admin/adminPanels";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

function ChevronIcon(props: { collapsed: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
      style={{
        display: "block",
        transform: props.collapsed ? "rotate(180deg)" : "rotate(0deg)",
        transition: "transform 160ms ease",
      }}
    >
      <path
        d="M3.25 9.75 8 5.25l4.75 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
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
    transition: "background 140ms ease, opacity 140ms ease, transform 140ms ease",
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
              height: collapsed ? 9 : 52,
              minHeight: 0,
              borderRadius: 0,
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gridTemplateColumns: "28px minmax(0, 1fr)",
              alignItems: "center",
              columnGap: 12,
              padding: collapsed ? "0 14px" : "9px 14px",
              background: `
                radial-gradient(circle at 12% 0%, rgba(255,223,160,0.12), transparent 24%),
                linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)),
                rgba(10,10,14,0.92)
              `,
              overflow: "hidden",
              transition: "height 160ms ease, padding 160ms ease, background 160ms ease",
            }}
          >
            <button
              type="button"
              aria-label={collapsed ? "Expand admin ribbon" : "Collapse admin ribbon"}
              title={collapsed ? "Expand" : "Collapse"}
              onClick={() => setCollapsed((v) => !v)}
              style={{
                width: 28,
                height: 28,
                padding: 0,
                margin: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.92)",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                justifySelf: "start",
                alignSelf: "center",
                lineHeight: 0,
                opacity: collapsed ? 0.82 : 0.94,
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
                opacity: collapsed ? 0 : 1,
                pointerEvents: collapsed ? "none" : "auto",
                transition: "opacity 120ms ease",
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