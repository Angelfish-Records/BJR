"use client";

import React from "react";
import { createPortal } from "react-dom";
import BadgeAwardRevealCard from "./BadgeAwardRevealCard";
import type { BadgeAwardNotice } from "./badgeAwardTypes";

type Props = {
  active: boolean;
  visible: boolean;
  badge: BadgeAwardNotice | null;
  onDismiss: () => void;
  allowAdminRibbonAbove?: boolean;
};

function BodyPortal(props: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  if (typeof document === "undefined") return null;

  return createPortal(props.children, document.body);
}

function useAdminRibbonAboveOverlay(active: boolean) {
  const debugbarStyleRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const getEl = () =>
      typeof document !== "undefined"
        ? document.getElementById("af-admin-debugbar")
        : null;

    const el = getEl();
    if (!el) return;

    if (debugbarStyleRef.current == null) {
      debugbarStyleRef.current = el.getAttribute("style") ?? "";
    }

    if (active) {
      el.setAttribute(
        "style",
        `${debugbarStyleRef.current}; position: relative; z-index: 50000; pointer-events: auto;`,
      );
    } else {
      const orig = debugbarStyleRef.current ?? "";
      if (orig.trim()) el.setAttribute("style", orig);
      else el.removeAttribute("style");
    }

    return () => {
      const el2 = getEl();
      if (!el2) return;
      const orig = debugbarStyleRef.current ?? "";
      if (orig.trim()) el2.setAttribute("style", orig);
      else el2.removeAttribute("style");
    };
  }, [active]);
}

export default function BadgeAwardOverlay(props: Props) {
  const {
    active,
    visible,
    badge,
    onDismiss,
    allowAdminRibbonAbove = true,
  } = props;

  useAdminRibbonAboveOverlay(allowAdminRibbonAbove && active);

  if (!active || !badge) return null;

  return (
    <BodyPortal>
      <div
        aria-hidden="true"
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 21000,
          pointerEvents: "auto",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          background: visible
            ? "rgba(0,0,0,0.24)"
            : "rgba(0,0,0,0.00)",
          opacity: visible ? 1 : 0,
          transition:
            "opacity 220ms ease, background-color 220ms ease, backdrop-filter 220ms ease",
        }}
      />

      <div
        onClick={onDismiss}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 31000,
          pointerEvents: "auto",
          display: "grid",
          placeItems: "center",
          padding: "min(8vh, 64px) 16px",
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1)" : "scale(0.985)",
          transition: "opacity 220ms ease, transform 220ms ease",
        }}
      >
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          style={{
            width: "100%",
            display: "grid",
            placeItems: "center",
          }}
        >
          <BadgeAwardRevealCard
            badge={badge}
            dismissHintVisible={visible}
          />
        </div>
      </div>
    </BodyPortal>
  );
}