// web/app/home/player/StageInlineHost.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import StageInline from "@/app/home/player/StageInline";

type SlotConfig = {
  height: number;
};

function safeParseHeight(v: string | null | undefined, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function ensureOffscreenParking(): HTMLElement {
  const existing = document.getElementById("af-stage-inline-offscreen");
  if (existing) return existing;

  const el = document.createElement("div");
  el.id = "af-stage-inline-offscreen";
  el.style.position = "fixed";
  el.style.left = "-100000px";
  el.style.top = "0";
  el.style.width = "1px";
  el.style.height = "1px";
  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  document.body.appendChild(el);
  return el;
}

/**
 * A single stable host element that React portals into forever.
 * We physically move this element into the current slot (if present),
 * otherwise park it offscreen. Moving the DOM node does NOT remount React.
 */
function ensureStableHostEl(): HTMLElement {
  const existing = document.getElementById("af-stage-inline-host");
  if (existing) return existing;

  const el = document.createElement("div");
  el.id = "af-stage-inline-host";
  el.style.width = "100%";
  el.style.height = "100%";
  // Important: do not position here; it inherits context from the slot container.
  return el;
}

function readSlotConfig(slot: HTMLElement | null, fallback: SlotConfig): SlotConfig {
  if (!slot) return fallback;

  const height = safeParseHeight(slot.getAttribute("data-height"), fallback.height);
  return { height };
}

function dbgEnabled(): boolean {
  try {
    return window.sessionStorage.getItem("af_dbg_stage_host") === "1";
  } catch {
    return false;
  }
}

function dbg(...args: unknown[]) {
  if (!dbgEnabled()) return;
  console.log("[StageInlineHost]", ...args);
}

export default function StageInlineHost(props: {
  /** Optional defaults; layouts can override via slot data-* attrs */
  height?: number;
  /** Slot id to attach the host into when present */
  slotId?: string;
}) {
  const slotId = props.slotId ?? "af-stage-inline-slot";

  const fallback = React.useMemo<SlotConfig>(
    () => ({ height: props.height ?? 560 }),
    [props.height],
  );

  // Create the stable host element exactly once (client-only).
  const [hostEl] = React.useState<HTMLElement | null>(() => {
    if (typeof document === "undefined") return null;
    return ensureStableHostEl();
  });

  // Config is stateful (allowed to change), but portal container is NOT.
  const [cfg, setCfg] = React.useState<SlotConfig>(fallback);

  // Ensure hostEl is attached somewhere, and move it as the slot appears/disappears.
  React.useEffect(() => {
    if (!hostEl) return;

    const parking = ensureOffscreenParking();

    const attach = () => {
      const slot = document.getElementById(slotId) as HTMLElement | null;
      const targetParent = slot ?? parking;

      // Move hostEl if parent changed.
      if (hostEl.parentElement !== targetParent) {
        try {
          targetParent.appendChild(hostEl);
          dbg("moved hostEl into", slot ? `#${slotId}` : "#af-stage-inline-offscreen");
        } catch (e) {
          dbg("appendChild failed", e);
        }
      }

      // Read config from slot (or fallback if no slot).
      const nextCfg = readSlotConfig(slot, fallback);
      setCfg((prev) => (prev.height === nextCfg.height ? prev : nextCfg));
    };

    // Initial attach in a microtask so we’re not doing sync state changes on mount timing edges.
    queueMicrotask(attach);

    const mo = new MutationObserver(() => attach());
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-height"],
    });

    return () => {
      mo.disconnect();
      // Do NOT remove hostEl; leaving it parked preserves state even if tree reorders.
    };
  }, [hostEl, slotId, fallback]);

  if (!hostEl) return null;

  // StageInline now owns its own data source (lyricsSurface + fetch), host only provides stable mount + height.
  return createPortal(<StageInline height={cfg.height} />, hostEl);
}