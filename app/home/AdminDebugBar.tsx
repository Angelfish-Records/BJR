"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/app/home/player/PlayerState";

const ENABLED = process.env.NEXT_PUBLIC_ADMIN_DEBUG === "1";

async function setDebug(state: { tier?: string; force?: string }) {
  await fetch("/api/admin/debug", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(state),
  });
  window.location.reload();
}

async function clearDebug() {
  await fetch("/api/admin/debug", { method: "DELETE" });
  window.location.reload();
}

type ForceOpt = { id: string; label: string };

const FORCE_OPTS: ForceOpt[] = [
  { id: "none", label: "None" },
  { id: "AUTH_REQUIRED", label: "AUTH_REQUIRED" },
  { id: "ENTITLEMENT_REQUIRED", label: "ENTITLEMENT_REQUIRED" },
  { id: "ANON_CAP_REACHED", label: "ANON_CAP_REACHED" },
  { id: "CAP_REACHED", label: "CAP_REACHED" },
  { id: "EMBARGO", label: "EMBARGO" },
  { id: "TIER_REQUIRED", label: "TIER_REQUIRED" },
  { id: "PROVISIONING", label: "PROVISIONING" },
];

type BlockAction = "login" | "subscribe" | "buy" | "wait";

function actionForCode(code: string): BlockAction | undefined {
  if (
    code === "AUTH_REQUIRED" ||
    code === "ANON_CAP_REACHED" ||
    code === "CAP_REACHED"
  )
    return "login";
  if (code === "PROVISIONING") return "wait";
  return undefined;
}

type UiActionId =
  | "apply_ui"
  | "clear_ui"
  | "spotlight_on"
  | "spotlight_off"
  | "apply_cookie"
  | "clear_force_cookie"
  | "reset_cookie";

export default function AdminDebugBar(props: { isAdmin: boolean }) {
  // Hooks must always run, even if we return null later.
  const p = usePlayer();

  const [force, setForce] = React.useState<string>("none");
  const [tokensOpen, setTokensOpen] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);

  type AdminPanelId = "access" | "share_tokens" | "mailbag";
  const [adminPanel, setAdminPanel] = React.useState<AdminPanelId>("access");

  // NEW: combined dropdown for all buttons after Force state
  const [uiAction, setUiAction] = React.useState<UiActionId>("apply_ui");

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
    return "Admin — Mailbag";
  }

  function adminSrc(panel: AdminPanelId) {
    if (panel === "access") return "/admin/access?embed=1";
    if (panel === "share_tokens") return "/admin/access?tab=tokens&embed=1";
    return "/admin/mailbag?embed=1";
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

  const selectStyle: React.CSSProperties = {
    ...btn,
    appearance: "none",
    paddingRight: 28,
    position: "relative",
  };

  const modal =
    mounted && tokensOpen
      ? createPortal(
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Share tokens admin"
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
                    Inline modal shell (server page inside iframe)
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
                  {(["access", "share_tokens", "mailbag"] as const).map(
                    (id) => {
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
                              : "Mailbag"}
                        </button>
                      );
                    },
                  )}
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

  const runUiAction = (id: UiActionId) => {
    switch (id) {
      // NEW: immediate client-side forcing (tests spotlight/veil path)
      case "apply_ui": {
        if (force === "none") {
          p.clearBlocked();
          return;
        }
        p.setBlocked(`DEBUG: forced ${force}`, {
          code: force,
          action: actionForCode(force),
          correlationId: "debug",
        });
        return;
      }
      case "clear_ui": {
        p.clearBlocked();
        return;
      }
      case "spotlight_on": {
        try {
          window.sessionStorage.setItem("af:dbgSpotlight", "1");
        } catch {}
        window.location.reload();
        return;
      }
      case "spotlight_off": {
        try {
          window.sessionStorage.removeItem("af:dbgSpotlight");
        } catch {}
        window.location.reload();
        return;
      }

      // Cookie-based forcing (server-side behaviours)
      case "apply_cookie": {
        void setDebug({ force });
        return;
      }
      case "clear_force_cookie": {
        void setDebug({ force: "none" });
        return;
      }
      case "reset_cookie": {
        void clearDebug();
        return;
      }
    }
  };

  return (
    <>
      <div
        id="af-admin-debugbar"
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
          Admin debug
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
          <button style={btn} onClick={() => openAdmin("access")}>
            Access
          </button>
          <button style={btn} onClick={() => openAdmin("share_tokens")}>
            Share tokens
          </button>
          <button style={btn} onClick={() => openAdmin("mailbag")}>
            Mailbag
          </button>

          <span
            aria-hidden
            style={{
              width: 1,
              height: 18,
              background: "rgba(255,255,255,0.18)",
              margin: "0 4px",
            }}
          />

          <div style={{ position: "relative", display: "grid" }}>
            <select
              aria-label="Force state"
              value={force}
              onChange={(e) => setForce(e.currentTarget.value)}
              style={selectStyle}
            >
              {FORCE_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  Force: {o.label}
                </option>
              ))}
            </select>

            <div
              aria-hidden
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                opacity: 0.8,
                fontSize: 10,
              }}
            >
              ▼
            </div>
          </div>

          {/* NEW: single dropdown for all remaining actions */}
          <div style={{ position: "relative", display: "grid" }}>
            <select
              aria-label="UI Action"
              value={uiAction}
              onChange={(e) => setUiAction(e.currentTarget.value as UiActionId)}
              style={selectStyle}
            >
              <option value="apply_ui">UI Action: Apply (UI)</option>
              <option value="clear_ui">UI Action: Clear (UI)</option>
              <option value="spotlight_on">
                UI Action: Spotlight ON (debug)
              </option>
              <option value="spotlight_off">
                UI Action: Spotlight OFF (debug)
              </option>
              <option value="apply_cookie">UI Action: Apply (cookie)</option>
              <option value="clear_force_cookie">
                UI Action: Clear force (cookie)
              </option>
              <option value="reset_cookie">UI Action: Reset (cookie)</option>
            </select>

            <div
              aria-hidden
              style={{
                position: "absolute",
                right: 10,
                top: "50%",
                transform: "translateY(-50%)",
                pointerEvents: "none",
                opacity: 0.8,
                fontSize: 10,
              }}
            >
              ▼
            </div>
          </div>

          <button style={btn} onClick={() => runUiAction(uiAction)}>
            Run
          </button>
        </div>
      </div>

      {modal}
    </>
  );
}
