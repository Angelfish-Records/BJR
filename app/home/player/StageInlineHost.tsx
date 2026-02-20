// web/app/home/player/StageInlineHost.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function readSlotConfig(slot: HTMLElement | null, fallback: SlotConfig): SlotConfig {
  if (!slot) return fallback;

  const height = safeParseHeight(slot.getAttribute("data-height"), fallback.height);
  const cuesJson = slot.getAttribute("data-cues") ?? fallback.cuesJson;
  const offsetsJson = slot.getAttribute("data-offsets") ?? fallback.offsetsJson;
  const sig = slot.getAttribute("data-sig") ?? fallback.sig;

  return { height, cuesJson, offsetsJson, sig };
}

function ensureOffscreenHost(): HTMLElement {
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

function safeParseJsonObject<T>(json: string, fallback: T): T {
  try {
    const v = JSON.parse(json);
    if (v && typeof v === "object") return v as T;
  } catch {
    // ignore
  }
  return fallback;
}

export default function StageInlineHost(props: {
  /** Optional defaults; portal layout can override via slot data-* attrs */
  height?: number;
  cuesJson?: string;
  offsetsJson?: string;
  sig?: string;
  /** Slot id to portal into when present */
  slotId?: string;
}) {
  const slotId = props.slotId ?? "af-stage-inline-slot";

  const fallback = useMemo<SlotConfig>(
    () => ({
      height: props.height ?? 560,
      cuesJson: props.cuesJson ?? "{}",
      offsetsJson: props.offsetsJson ?? "{}",
      sig: props.sig ?? "default",
    }),
    [props.height, props.cuesJson, props.offsetsJson, props.sig],
  );

  // Portal target + config. These only exist client-side.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [cfg, setCfg] = useState<SlotConfig>(fallback);

  // Subscribe to DOM changes (slot appearing/disappearing or data-* updating).
  // NOTE: any setState happens inside the observer callback (satisfies your eslint rule).
  useEffect(() => {
    const offscreen = ensureOffscreenHost();

    const compute = () => {
      const slot = document.getElementById(slotId) as HTMLElement | null;
      const nextContainer = (slot ?? offscreen) as HTMLElement;
      const nextCfg = readSlotConfig(slot, fallback);

      setContainer((prev) => (prev === nextContainer ? prev : nextContainer));
      setCfg((prev) => {
        if (
          prev.height === nextCfg.height &&
          prev.sig === nextCfg.sig &&
          prev.cuesJson === nextCfg.cuesJson &&
          prev.offsetsJson === nextCfg.offsetsJson
        ) {
          return prev;
        }
        return nextCfg;
      });
    };

    // Initial compute (still inside effect; but eslint rule you hit was specifically
    // about "setState synchronously within an effect body". If that rule is strict
    // enough to flag even this, we can move this call into a microtask.
    queueMicrotask(compute);

    const mo = new MutationObserver(() => compute());
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-height", "data-cues", "data-offsets", "data-sig"],
    });

    return () => mo.disconnect();
  }, [slotId, fallback]);

  const cuesByTrackId = useMemo(() => {
    return safeParseJsonObject<CuesByTrackId>(cfg.cuesJson, {} as CuesByTrackId);
  }, [cfg.cuesJson]);

  const offsetByTrackId = useMemo(() => {
    return safeParseJsonObject<OffsetByTrackId>(cfg.offsetsJson, {} as OffsetByTrackId);
  }, [cfg.offsetsJson]);

  if (!container) return null;

  return createPortal(
    <StageInline
      height={cfg.height}
      cuesByTrackId={cuesByTrackId}
      offsetByTrackId={offsetByTrackId}
    />,
    container,
  );
}