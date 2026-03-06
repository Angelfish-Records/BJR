// web/app/home/gating/GateSpotlightOverlay.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";

function BodyPortal(props: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (typeof document === "undefined") return null;
  return createPortal(props.children, document.body);
}

function getScrollbarWidthPx(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(0, window.innerWidth - document.documentElement.clientWidth);
}

function lockScroll(active: boolean) {
  const root = document.documentElement;
  const body = document.body;

  const prevOverflow = root.style.overflow;
  const prevPaddingRight = body.style.paddingRight;

  if (active) {
    const sw = getScrollbarWidthPx();
    root.style.overflow = "hidden";
    if (sw > 0) body.style.paddingRight = `${sw}px`;

    return () => {
      root.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }

  return () => {};
}

function useFocusTrap(enabled: boolean, rootRef: React.RefObject<HTMLElement | null>) {
  React.useEffect(() => {
    if (!enabled) return;

    const root = rootRef.current;
    if (!root) return;

    const isElementDisabled = (el: Element): boolean => {
      if (el instanceof HTMLButtonElement) return el.disabled;
      if (el instanceof HTMLInputElement) return el.disabled;
      if (el instanceof HTMLSelectElement) return el.disabled;
      if (el instanceof HTMLTextAreaElement) return el.disabled;
      if (el instanceof HTMLOptGroupElement) return el.disabled;
      if (el instanceof HTMLOptionElement) return el.disabled;
      return false;
    };

    const isActuallyFocusable = (el: HTMLElement): boolean => {
      if (el.tabIndex < 0) return false;
      if (isElementDisabled(el)) return false;

      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;

      return true;
    };

    const isFocusable = (el: Element): el is HTMLElement => {
      if (!(el instanceof HTMLElement)) return false;

      const tag = el.tagName.toLowerCase();
      const focusableTags = new Set(["input", "button", "select", "textarea", "a"]);

      if (tag === "a") {
        const a = el as HTMLAnchorElement;
        if (!a.href && el.tabIndex <= 0) return false;
      } else if (!focusableTags.has(tag)) {
        if (el.getAttribute("role") !== "button") return false;
      }

      return isActuallyFocusable(el);
    };

    const getFocusable = (): HTMLElement[] => {
      const all = Array.from(root.querySelectorAll("*"));
      return all.filter(isFocusable);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!enabled) return;

      // Gate overlay currently is "blocking": Escape shouldn't close it implicitly,
      // but we also shouldn't nuke the event for the entire app.
      if (e.key !== "Tab") return;

      const items = getFocusable();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }

      const activeEl =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const idx = activeEl ? items.indexOf(activeEl) : -1;

      const nextIdx = e.shiftKey
        ? idx <= 0
          ? items.length - 1
          : idx - 1
        : idx >= items.length - 1
          ? 0
          : idx + 1;

      e.preventDefault();
      items[nextIdx]?.focus();
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, rootRef]);
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
      // Cleanup if route changes while spotlight is active.
      const el2 = getEl();
      if (!el2) return;
      const orig = debugbarStyleRef.current ?? "";
      if (orig.trim()) el2.setAttribute("style", orig);
      else el2.removeAttribute("style");
    };
  }, [active]);
}

export default function GateSpotlightOverlay(props: {
  active: boolean;
  gateNode: React.ReactNode;
  ariaLabel?: string;
  // Keep your current behavior: admin debugbar stays clickable above overlay.
  allowAdminRibbonAbove?: boolean;
}) {
  const { active, gateNode, ariaLabel = "Authentication required", allowAdminRibbonAbove = true } =
    props;

  const modalRef = React.useRef<HTMLDivElement | null>(null);

  useFocusTrap(active, modalRef);

  React.useEffect(() => {
    if (!active) return;
    return lockScroll(true);
  }, [active]);

  useAdminRibbonAboveOverlay(allowAdminRibbonAbove && active);

  if (!active) return null;

  return (
    <BodyPortal>
      {/* Veil */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 20000,
          pointerEvents: "auto",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          background: "rgba(0,0,0,0.30)",
        }}
      />

      {/* Modal */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30000,
          pointerEvents: "auto",
          display: "grid",
          placeItems: "center",
          padding: "min(7vh, 56px) 16px",
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          style={{
            width: "100%",
            maxWidth: "min(92vw, 520px)",
            borderRadius: 24,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(10,10,14,0.92)",
            backdropFilter: "blur(14px)",
            WebkitBackdropFilter: "blur(14px)",
            boxShadow: `
              0 28px 80px rgba(0,0,0,0.60),
              0 0 0 1px rgba(255,255,255,0.04),
              0 60px 160px rgba(0,0,0,0.80)
            `,
            padding: 20,
            display: "grid",
          }}
        >
          <div
            style={{
              width: "100%",
              border: "none",
              background: "rgba(0,0,0,0.22)",
              padding: 16,
              boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {gateNode}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}