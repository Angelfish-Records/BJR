// web/app/home/AdminRibbon.tsx
"use client";

import React from "react";
import Link from "next/link";
import AdminOverlayShell from "./admin/AdminOverlayShell";
import { type AdminPanelId } from "./admin/adminPanels";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

export default function AdminRibbon(props: { isAdmin: boolean }) {
  const [adminOpen, setAdminOpen] = React.useState(false);
  const [adminPanel, setAdminPanel] = React.useState<AdminPanelId>("access");

  function openAdmin(panel: AdminPanelId) {
    setAdminPanel(panel);
    setAdminOpen(true);
  }

  if (!ENABLED) return null;
  if (!props.isAdmin) return null;

  const btn: React.CSSProperties = {
    height: 32,
    padding: "0 12px",
    borderRadius: 999,
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
              minHeight: 52,
              borderRadius: 0,
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              padding: "9px 14px",
              background: `
                radial-gradient(circle at 12% 0%, rgba(255,223,160,0.12), transparent 24%),
                linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)),
                rgba(10,10,14,0.92)
              `,
            }}
          >
            <div
              style={{
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 2,
                paddingLeft: 2,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  opacity: 0.5,
                  userSelect: "none",
                  lineHeight: 1,
                }}
              >
                Admin workspace
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.96)",
                  lineHeight: 1.15,
                  whiteSpace: "nowrap",
                }}
              >
                Control ribbon
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "flex-end",
                padding: 4,
                borderRadius: 999,
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
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