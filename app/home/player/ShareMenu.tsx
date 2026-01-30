// web/app/home/player/ShareMenu.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getViewport() {
  // Use visualViewport when available (Android address bar / DPR quirks),
  // but keep numbers in the same coordinate space as getBoundingClientRect().
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const width = vv?.width ?? window.innerWidth;
  const height = vv?.height ?? window.innerHeight;
  const offsetLeft = vv?.offsetLeft ?? 0;
  const offsetTop = vv?.offsetTop ?? 0;
  return { width, height, offsetLeft, offsetTop };
}

function useAnchorPosition(
  open: boolean,
  anchorRef: React.RefObject<HTMLElement>,
) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const el = anchorRef.current;
    if (!el) return;

    let raf: number | null = null;

    const computeNow = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const r = el.getBoundingClientRect();
      setPos({ x: r.left + r.width / 2, y: r.bottom + 8 });
    };

    const schedule = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        computeNow();
      });
    };

    // prime
    schedule();

    const onScroll = () => schedule();
    const onResize = () => schedule();

    window.addEventListener("scroll", onScroll, {
      capture: true,
      passive: true,
    });
    window.addEventListener("resize", onResize, { passive: true });

    const vv = window.visualViewport;
    vv?.addEventListener("resize", onResize, { passive: true });
    vv?.addEventListener("scroll", onScroll, { passive: true });

    const onVis = () => {
      if (typeof document !== "undefined" && !document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVis, { passive: true });

    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
      raf = null;
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      vv?.removeEventListener("resize", onResize as EventListener);
      vv?.removeEventListener("scroll", onScroll as EventListener);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [open, anchorRef]);

  return pos;
}

export function ShareMenu(props: {
  open: boolean;
  anchorRef: React.RefObject<HTMLElement>;
  onClose: () => void;
  items: Array<{ label: string; onClick: () => void; disabled?: boolean }>;
}) {
  const { open, anchorRef, onClose, items } = props;
  const pos = useAnchorPosition(open, anchorRef);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !pos) return null;

  const PAD = 12;
  const MENU_W = 220;

  const { width: vw, offsetLeft } = getViewport();

  // Clamp the *center point* so the menu cannot exceed viewport bounds even with translateX(-50%).
  const minCenter = offsetLeft + PAD + MENU_W / 2;
  const maxCenter = offsetLeft + vw - PAD - MENU_W / 2;
  const clampedX = clamp(pos.x, minCenter, maxCenter);

  return createPortal(
    <>
      {/* click-catcher */}
      <div
        onMouseDown={(e) => {
          e.preventDefault();
          onClose();
        }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 100000,
          // guardrail: never widen document
          overflowX: "clip",
        }}
      />

      <div
        role="menu"
        style={{
          position: "fixed",
          left: clampedX,
          top: pos.y,
          transform: "translateX(-50%)",
          width: MENU_W,
          maxWidth: `calc(100vw - ${PAD * 2}px)`,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(0,0,0,0.70)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          boxShadow: "0 18px 55px rgba(0,0,0,0.45)",
          padding: 6,
          zIndex: 100001,
          // guardrail: prevent text/content from forcing wider boxes
          overflowX: "clip",
          boxSizing: "border-box",
        }}
      >
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return;
              it.onClick();
              onClose();
            }}
            style={{
              width: "100%",
              textAlign: "left",
              padding: "10px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.00)",
              background: "transparent",
              color: "rgba(255,255,255,0.92)",
              cursor: it.disabled ? "default" : "pointer",
              opacity: it.disabled ? 0.45 : 0.92,
              fontSize: 12,
              // if labels ever get long, do not widen the menu
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "rgba(255,255,255,0.07)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "transparent";
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>,
    document.body,
  );
}
