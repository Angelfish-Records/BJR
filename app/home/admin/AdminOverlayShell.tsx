"use client";

import React from "react";
import { createPortal } from "react-dom";
import {
  ADMIN_PANELS,
  getAdminPanel,
  type AdminPanelId,
} from "./adminPanels";

type Props = {
  open: boolean;
  activePanel: AdminPanelId;
  onClose: () => void;
  onSelectPanel: (panel: AdminPanelId) => void;
};

export default function AdminOverlayShell(props: Props) {
  const { open, activePanel, onClose, onSelectPanel } = props;

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    if (!open) return;

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.documentElement.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const panel = getAdminPanel(activePanel);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin modal"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        display: "grid",
        placeItems: "center",
        padding: "clamp(14px, 2.2vw, 24px)",
        background: `
          radial-gradient(circle at 50% 18%, rgba(255,220,160,0.09), transparent 34%),
          radial-gradient(circle at 50% 100%, rgba(255,255,255,0.04), transparent 42%),
          rgba(0,0,0,0.62)
        `,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
    >
      <div
        className="portalPanel--gold"
        style={{
          width: "min(92vw, 1480px)",
          height: "min(90vh, 1040px)",
          borderRadius: 28,
          padding: 2,
        }}
      >
        <div
          className="portalPanelFrame--gold"
          style={{
            width: "100%",
            height: "100%",
            borderRadius: 28,
            padding: 1.5,
          }}
        >
          <div
            className="portalPanelInner--gold"
            style={{
              width: "100%",
              height: "100%",
              borderRadius: 26,
              overflow: "hidden",
              display: "grid",
              gridTemplateRows: "auto 1fr",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "relative",
                padding: "16px 18px 14px",
                borderBottom: "1px solid rgba(255,255,255,0.09)",
                background: `
                  linear-gradient(
                    180deg,
                    rgba(255,255,255,0.055),
                    rgba(255,255,255,0.02)
                  )
                `,
                boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  background:
                    "radial-gradient(circle at 12% 0%, rgba(255,223,160,0.14), transparent 28%)",
                  opacity: 0.85,
                }}
              />

              <div
                style={{
                  position: "relative",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto auto",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <div style={{ minWidth: 0, paddingLeft: 2 }}>
                  <div
                    style={{
                      fontSize: 11,
                      letterSpacing: "0.16em",
                      textTransform: "uppercase",
                      opacity: 0.52,
                      userSelect: "none",
                    }}
                  >
                    Admin workspace
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 18,
                      lineHeight: 1.15,
                      fontWeight: 700,
                      color: "rgba(255,255,255,0.96)",
                      textWrap: "balance",
                    }}
                  >
                    {panel.modalTitle}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    padding: 4,
                    background: "none",
                    border: "none",
                    boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset",
                  }}
                >
                  {ADMIN_PANELS.map((item) => {
                    const active = item.id === activePanel;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectPanel(item.id)}
                        style={{
                          height: 34,
                          padding: "0 14px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid rgba(255,230,180,0.26)"
                            : "1px solid rgba(255,255,255,0.10)",
                          background: active
                            ? `
                              linear-gradient(
                                180deg,
                                rgba(255,228,176,0.18),
                                rgba(255,255,255,0.09)
                              )
                            `
                            : "rgba(255,255,255,0.035)",
                          color: "rgba(255,255,255,0.94)",
                          cursor: "pointer",
                          fontSize: 12,
                          fontWeight: active ? 800 : 700,
                          opacity: active ? 1 : 0.82,
                          userSelect: "none",
                          whiteSpace: "nowrap",
                          boxShadow: active
                            ? "0 8px 20px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.12)"
                            : "none",
                          transition:
                            "background 140ms ease, opacity 140ms ease, transform 140ms ease",
                        }}
                      >
                        {item.pillLabel}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: `
                      linear-gradient(
                        180deg,
                        rgba(255,255,255,0.10),
                        rgba(255,255,255,0.05)
                      )
                    `,
                    color: "rgba(255,255,255,0.94)",
                    cursor: "pointer",
                    lineHeight: 0,
                    flex: "0 0 auto",
                    fontSize: 22,
                    boxShadow:
                      "0 8px 20px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.08)",
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div
              style={{
                position: "relative",
                minHeight: 0,
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.015), rgba(255,255,255,0))",
              }}
            >
              <iframe
                title={panel.modalTitle}
                src={panel.src}
                style={{
                  width: "100%",
                  height: "100%",
                  border: 0,
                  background: "transparent",
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}