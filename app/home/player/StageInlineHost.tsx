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

  // IMPORTANT: do NOT shrink to 1px.
  // Keep a stable, “real” box so WebGL/canvas code doesn’t treat it as effectively unmounted.
  el.style.width = "720px";
  el.style.height = "560px";

  el.style.overflow = "hidden";
  el.style.pointerEvents = "none";
  el.style.opacity = "0";
  el.style.contain = "layout paint size";
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

function readSlotConfig(
  slot: HTMLElement | null,
  fallback: SlotConfig,
): SlotConfig {
  if (!slot) return fallback;

  const height = safeParseHeight(
    slot.getAttribute("data-height"),
    fallback.height,
  );
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

  // Important: first client render must match the server render.
  // So we start with null and only create the host after mount.
  const [hostEl, setHostEl] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    setHostEl(ensureStableHostEl());
  }, []);

  // Config is stateful (allowed to change), but portal container is NOT.
  const [cfg, setCfg] = React.useState<SlotConfig>(fallback);

  // Every session layout renders the inline-stage slot. Attach during hydration
  // and once again on the next paint, rather than permanently observing every
  // mutation beneath document.body for a slot that does not disappear.
  React.useEffect(() => {
    if (!hostEl) return;

    const parking = ensureOffscreenParking();
    let cancelled = false;
    let retryFrame: number | null = null;

    const attach = () => {
      if (cancelled) return;

      const slot = document.getElementById(slotId) as HTMLElement | null;
      const targetParent = slot ?? parking;

      // Move hostEl only if its parent actually changed.
      if (hostEl.parentElement !== targetParent) {
        try {
          targetParent.appendChild(hostEl);
          dbg(
            "moved hostEl into",
            slot ? `#${slotId}` : "#af-stage-inline-offscreen",
          );
        } catch (error) {
          dbg("appendChild failed", error);
        }
      }

      const nextCfg = readSlotConfig(slot, fallback);

      // Keep the fallback parking box sized correctly even though ordinary
      // session layouts should keep the host in the visible stage slot.
      parking.style.height = `${Math.max(1, Math.floor(nextCfg.height))}px`;

      setCfg((previous) =>
        previous.height === nextCfg.height ? previous : nextCfg,
      );
    };

    // The microtask covers ordinary hydration; the next-frame retry covers
    // any late sibling commit without keeping a permanent global observer.
    queueMicrotask(attach);
    retryFrame = window.requestAnimationFrame(attach);

    return () => {
      cancelled = true;

      if (retryFrame != null) {
        window.cancelAnimationFrame(retryFrame);
      }

      // Do NOT remove hostEl; preserving it retains stage and WebGL state.
    };
  }, [hostEl, slotId, fallback]);

  if (!hostEl) return null;

  // StageInline now owns its own data source (lyricsSurface + fetch), host only provides stable mount + height.
  return createPortal(<StageInline height={cfg.height} />, hostEl);
}
