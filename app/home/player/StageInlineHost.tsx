// web/app/home/player/StageInlineHost.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import StageInline from "@/app/home/player/StageInline";

type StageInlineProps = React.ComponentProps<typeof StageInline>;
type CuesByTrackId = NonNullable<StageInlineProps["cuesByTrackId"]>;
type OffsetByTrackId = NonNullable<StageInlineProps["offsetByTrackId"]>;

type SlotConfig = {
  height: number;
  cuesJson: string;
  offsetsJson: string;
  sig: string;
};

let _hostEl: HTMLDivElement | null = null;

function safeParseHeight(v: string | null | undefined, fallback: number) {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function readSlotConfig(slot: HTMLElement | null, fallback: SlotConfig): SlotConfig {
  if (!slot) return fallback;
  return {
    height: safeParseHeight(slot.getAttribute("data-height"), fallback.height),
    cuesJson: slot.getAttribute("data-cues") ?? fallback.cuesJson,
    offsetsJson: slot.getAttribute("data-offsets") ?? fallback.offsetsJson,
    sig: slot.getAttribute("data-sig") ?? fallback.sig,
  };
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

function getOrCreateHostEl(): HTMLDivElement {
  if (_hostEl && document.body.contains(_hostEl)) return _hostEl;

  const el = document.createElement("div");
  el.id = "af-stage-inline-host";
  el.style.width = "100%";
  el.style.height = "100%";
  el.style.borderRadius = "18px";
  el.style.overflow = "hidden";

  ensureOffscreenHost().appendChild(el);
  _hostEl = el;
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
  height?: number;
  cuesJson?: string;
  offsetsJson?: string;
  sig?: string;
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

  const [cfg, setCfg] = useState<SlotConfig>(fallback);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const offscreen = ensureOffscreenHost();

    const apply = () => {
      const hostEl = getOrCreateHostEl();
      const slot = document.getElementById(slotId) as HTMLElement | null;

      // Reparent the SAME hostEl. Portal target stays constant => no remount.
      const parent = slot ?? offscreen;
      if (hostEl.parentElement !== parent) parent.appendChild(hostEl);

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
        return nextCfg;
      });

      setReady(true);
    };

    queueMicrotask(apply);

    const mo = new MutationObserver(() => apply());
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
    return safeParseJsonObject<OffsetByTrackId>(
      cfg.offsetsJson,
      {} as OffsetByTrackId,
    );
  }, [cfg.offsetsJson]);

  if (!ready) return null;

  const hostEl = getOrCreateHostEl();

  return createPortal(
    <StageInline
      height={cfg.height}
      cuesByTrackId={cuesByTrackId}
      offsetByTrackId={offsetByTrackId}
    />,
    hostEl,
  );
}