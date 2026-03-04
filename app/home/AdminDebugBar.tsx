// web/app/home/AdminDebugBar.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

type AdminPanelId = "access" | "share_tokens" | "mailbag" | "exegesis";

export default function AdminDebugBar(props: { isAdmin: boolean }) {
  const [tokensOpen, setTokensOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [adminPanel, setAdminPanel] = React.useState<AdminPanelId>("access");

  React.useEffect(() => setMounted(true), []);

  // ESC to close + lock scroll while modal open
  React.useEffect(() => {
    if (!tokensOpen) return;

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setTokensOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.documentElement.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [tokensOpen]);

  function openAdmin(panel: AdminPanelId) {
    setAdminPanel(panel);
    setTokensOpen(true);
  }

  function adminTitle(panel: AdminPanelId) {
    if (panel === "access") return "Admin — Access";
    if (panel === "share_tokens") return "Admin — Share tokens";
    if (panel === "mailbag") return "Admin — Mailbag";
    return "Admin — Exegesis";
  }

  function adminSrc(panel: AdminPanelId) {
    if (panel === "access") return "/admin/access?embed=1";
    if (panel === "share_tokens") return "/admin/access?tab=tokens&embed=1";
    if (panel === "mailbag") return "/admin/mailbag?embed=1";
    return "/admin/exegesis?embed=1";
  }

  if (!ENABLED) return null;
  if (!props.isAdmin) return null;

  const btn: React.CSSProperties = {
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.22)",
    color: "rgba(255,255,255,0.90)",
    fontSize: 12,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const modal =
    mounted && tokensOpen
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Admin modal"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setTokensOpen(false);
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              zIndex: 100000,
              display: "grid",
              placeItems: "center",
              padding: 16,
            }}
          >
            <div
              style={{
                width: "min(1040px, 100%)",
                height: "min(78vh, 760px)",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(10,10,12,0.85)",
                boxShadow: "0 22px 70px rgba(0,0,0,0.55)",
                overflow: "hidden",
                display: "grid",
                gridTemplateRows: "auto 1fr",
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  borderBottom: "1px solid rgba(255,255,255,0.10)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 650, opacity: 0.92 }}>
                    {adminTitle(adminPanel)}
                  </div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>
                    Admin panel (server page inside iframe)
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {(
                    ["access", "share_tokens", "mailbag", "exegesis"] as const
                  ).map((id) => {
                    const active = adminPanel === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAdminPanel(id)}
                        style={{
                          height: 28,
                          padding: "0 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(255,255,255,0.14)",
                          background: active
                            ? "rgba(255,255,255,0.10)"
                            : "rgba(255,255,255,0.04)",
                          color: "rgba(255,255,255,0.90)",
                          cursor: "pointer",
                          fontSize: 12,
                          opacity: active ? 1 : 0.78,
                          userSelect: "none",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {id === "access"
                          ? "Access"
                          : id === "share_tokens"
                            ? "Share tokens"
                            : id === "mailbag"
                              ? "Mailbag"
                              : "Exegesis"}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={() => setTokensOpen(false)}
                  aria-label="Close"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.90)",
                    cursor: "pointer",
                    lineHeight: 0,
                  }}
                >
                  ×
                </button>
              </div>

              <iframe
                title={adminTitle(adminPanel)}
                src={adminSrc(adminPanel)}
                style={{
                  width: "100%",
                  height: "100%",
                  border: 0,
                  background: "transparent",
                }}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        id="af-admin-configbar"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 9999,
          width: "100%",
          minHeight: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "6px 12px",
          background: "rgba(10,10,14,0.88)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            opacity: 0.6,
            userSelect: "none",
          }}
        >
          Admin
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "flex-end",
          }}
        >
          <button type="button" style={btn} onClick={() => openAdmin("access")}>
            Access
          </button>
          <button
            type="button"
            style={btn}
            onClick={() => openAdmin("share_tokens")}
          >
            Share tokens
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
            Exegesis
          </button>
          <Link
            href="/admin/campaigns"
            style={{
              ...btn,
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            Campaigns
          </Link>
        </div>
      </div>

      {modal}
    </>
  );
}
