// web/app/home/AdminRibbon.tsx
"use client";

import React from "react";
import Link from "next/link";
import AdminOverlayShell from "./admin/AdminOverlayShell";
import { type AdminPanelId } from "./admin/adminPanels";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

const ADMIN_RIBBON_BG = "rgba(10,10,14,0.92)";
const ADMIN_RIBBON_GOLD = "rgba(255,215,130,0.95)";
const ADMIN_RIBBON_GOLD_EDGE = "rgba(255,225,160,0.55)";
const ADMIN_TAG_BG = "rgba(40,30,18,0.96)";

function ChevronIcon(props: { collapsed: boolean }) {
  return props.collapsed ? (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d="M3.25 5.25 7 8.85l3.75-3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
      style={{ display: "block" }}
    >
      <path
        d="M3.25 8.75 7 5.15l3.75 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PullTag(props: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={
        props.collapsed ? "Expand admin ribbon" : "Collapse admin ribbon"
      }
      title={props.collapsed ? "Expand admin ribbon" : "Collapse admin ribbon"}
      aria-expanded={!props.collapsed}
      onClick={props.onClick}
      style={{
        position: "absolute",
        left: 14,
        top: "100%",
        transform: "translateY(-1px)",
        width: 34,
        height: props.collapsed ? 28 : 24,
        padding: 0,
        border: `1px solid ${ADMIN_RIBBON_GOLD_EDGE}`,
        borderTop: "none",
        borderBottomLeftRadius: 11,
        borderBottomRightRadius: 11,
        background: `
          linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.01)),
          ${ADMIN_TAG_BG}
        `,
        color: ADMIN_RIBBON_GOLD,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        boxShadow:
          "0 8px 18px rgba(0,0,0,0.26), inset 0 1px 0 rgba(255,255,255,0.05)",
        zIndex: 4,
        transition:
          "height 160ms ease, transform 160ms ease, background 160ms ease, box-shadow 160ms ease, opacity 160ms ease",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          transform: props.collapsed ? "translateY(1px)" : "translateY(0)",
          transition: "transform 160ms ease",
          lineHeight: 0,
        }}
      >
        <ChevronIcon collapsed={props.collapsed} />
      </span>
    </button>
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
          padding: collapsed ? "0 0 0" : "0 0 2px",
          background: "transparent",
          overflow: "visible",
        }}
      >
        <div
          className="portalPanelFrame--gold"
          style={{
            borderRadius: 0,
            padding: collapsed ? "0" : "0 0 1px",
            boxShadow: collapsed
              ? "none"
              : "0 14px 36px rgba(0,0,0,0.32), 0 28px 70px rgba(0,0,0,0.24)",
            overflow: "visible",
            transition: "padding 160ms ease, box-shadow 160ms ease",
          }}
        >
          <div
            className="portalPanelInner--gold"
            style={{
              height: collapsed ? 2 : 52,
              minHeight: 0,
              borderRadius: 0,
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              borderBottom: collapsed
                ? "1px solid rgba(255,255,255,0.12)"
                : "1px solid rgba(255,255,255,0.08)",
              display: "grid",
              gridTemplateColumns: "1fr",
              alignItems: "center",
              padding: collapsed ? "0 14px" : "9px 14px",
              background: collapsed
                ? `linear-gradient(180deg, rgba(255,255,255,0.045), ${ADMIN_RIBBON_BG})`
                : `
                  radial-gradient(circle at 12% 0%, rgba(255,223,160,0.12), transparent 24%),
                  linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015)),
                  ${ADMIN_RIBBON_BG}
                `,
              overflow: "visible",
              position: "relative",
              transition:
                "height 160ms ease, padding 160ms ease, background 160ms ease, border-color 160ms ease",
            }}
          >
            <PullTag
              collapsed={collapsed}
              onClick={() => setCollapsed((value) => !value)}
            />

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
                transition: "opacity 100ms ease",
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
                onClick={() => openAdmin("badges")}
              >
                Badges
              </button>
              <button
                type="button"
                style={btn}
                onClick={() => openAdmin("playback")}
              >
                Playback
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
