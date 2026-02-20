// web/app/home/player/StageInlineHost.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import StageInline from "@/app/home/player/StageInline";

// Derive the cue/offset prop types from StageInline itself (future-proof)
type StageInlineProps = React.ComponentProps<typeof StageInline>;
type CuesByTrackId = NonNullable<StageInlineProps["cuesByTrackId"]>;
type OffsetByTrackId = NonNullable<StageInlineProps["offsetByTrackId"]>;

type SlotConfig = {
  height: number;
  cuesJson: string;
  offsetsJson: string;
  sig: string; // for cheap change detection only; StageInline doesn't consume it
};

function safeParseHeight(v: string | null | undefined, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function safeParseJsonObject<T>(json: string, fallback: T): T {
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object") return v as T;
  } catch {
    // ignore
  }
  return fallback;
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
  const cuesJson = slot.getAttribute("data-cues") ?? fallback.cuesJson;
  const offsetsJson = slot.getAttribute("data-offsets") ?? fallback.offsetsJson;
  const sig = slot.getAttribute("data-sig") ?? fallback.sig;

  return { height, cuesJson, offsetsJson, sig };
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
  cuesJson?: string;
  offsetsJson?: string;
  sig?: string;
  /** Slot id to attach the host into when present */
  slotId?: string;
}) {
  const slotId = props.slotId ?? "af-stage-inline-slot";

  const fallback = React.useMemo<SlotConfig>(
    () => ({
      height: props.height ?? 560,
      cuesJson: props.cuesJson ?? "{}",
      offsetsJson: props.offsetsJson ?? "{}",
      sig: props.sig ?? "default",
    }),
    [props.height, props.cuesJson, props.offsetsJson, props.sig],
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
      setCfg((prev) => {
        if (
          prev.height === nextCfg.height &&
          prev.sig === nextCfg.sig &&
          prev.cuesJson === nextCfg.cuesJson &&
          prev.offsetsJson === nextCfg.offsetsJson
        ) {
          return prev;
        }
        dbg("cfg updated", { prev, next: nextCfg });
        return nextCfg;
      });
    };

    // Initial attach in a microtask so we’re not doing sync state changes on mount timing edges.
    queueMicrotask(attach);

    const mo = new MutationObserver(() => attach());
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-height", "data-cues", "data-offsets", "data-sig"],
    });

    return () => {
      mo.disconnect();
      // Do NOT remove hostEl; leaving it parked preserves state even if tree reorders.
      // If you *want* to remove it on unmount, you can, but it will reset state.
    };
  }, [hostEl, slotId, fallback]);

  const cuesByTrackId = React.useMemo(() => {
    return safeParseJsonObject<CuesByTrackId>(cfg.cuesJson, {} as CuesByTrackId);
  }, [cfg.cuesJson]);

  const offsetByTrackId = React.useMemo(() => {
    return safeParseJsonObject<OffsetByTrackId>(cfg.offsetsJson, {} as OffsetByTrackId);
  }, [cfg.offsetsJson]);

  if (!hostEl) return null;

  return createPortal(
    <StageInline
      height={cfg.height}
      cuesByTrackId={cuesByTrackId}
      offsetByTrackId={offsetByTrackId}
    />,
    hostEl,
  );
}