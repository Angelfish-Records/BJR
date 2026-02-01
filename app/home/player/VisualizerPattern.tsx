// web/app/home/player/VisualizerPattern.tsx
"use client";

import React from "react";
import { visualSurface } from "./visualSurface";

type SourceRect =
  | { mode: "full" }
  | { mode: "center"; scale?: number }
  | { mode: "random"; seed: number; scale?: number };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function pickRect(
  srcW: number,
  srcH: number,
  rect: SourceRect,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 1 || srcH <= 1) return { sx: 0, sy: 0, sw: srcW, sh: srcH };

  if (rect.mode === "full") return { sx: 0, sy: 0, sw: srcW, sh: srcH };

  const scale = clamp(rect.scale ?? 0.55, 0.15, 1);
  const sw = Math.max(1, Math.floor(srcW * scale));
  const sh = Math.max(1, Math.floor(srcH * scale));

  if (rect.mode === "center") {
    const sx = Math.floor((srcW - sw) / 2);
    const sy = Math.floor((srcH - sh) / 2);
    return { sx, sy, sw, sh };
  }

  // deterministic “random”
  let x = rect.seed | 0;
  const rand = () => {
    // xorshift32
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    // -> [0,1)
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };

  const sx = Math.floor(rand() * (srcW - sw));
  const sy = Math.floor(rand() * (srcH - sh));
  return { sx, sy, sw, sh };
}

function cssBoxSize(el: HTMLCanvasElement): { cssW: number; cssH: number } {
  // Prefer integer box metrics to avoid fractional jitter/resizing loops.
  const cssW = Math.max(
    1,
    el.clientWidth || Math.round(el.getBoundingClientRect().width),
  );
  const cssH = Math.max(
    1,
    el.clientHeight || Math.round(el.getBoundingClientRect().height),
  );
  return { cssW, cssH };
}

function getSrcSize(src: HTMLCanvasElement): { srcW: number; srcH: number } {
  // WebGL canvas uses backing-store width/height; fall back to client box if needed.
  const srcW = src.width || src.clientWidth || 0;
  const srcH = src.height || src.clientHeight || 0;
  return { srcW, srcH };
}

export function VisualizerSnapshotCanvas(props: {
  /** CSS size comes from container; this is for internal pixel density */
  className?: string;
  style?: React.CSSProperties;
  fps?: number;
  opacity?: number;
  sourceRect?: SourceRect;
  /** If provided, draws only when true */
  active?: boolean;
  /** Optional canvas-side filter (avoids CSS filter compositor flicker) */
  ctxFilter?: string;
}) {
  const {
    className,
    style,
    fps = 14,
    opacity = 0.55,
    sourceRect = { mode: "center" },
    active = true,
    ctxFilter,
  } = props;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const srcRef = React.useRef<HTMLCanvasElement | null>(null);

  // Keep latest prop values without re-starting the RAF loop.
  const fpsRef = React.useRef(fps);
  const opacityRef = React.useRef(opacity);
  const sourceRectRef = React.useRef<SourceRect>(sourceRect);
  const activeRef = React.useRef(active);
  const ctxFilterRef = React.useRef<string | undefined>(ctxFilter);

  React.useEffect(() => {
    fpsRef.current = fps;
    opacityRef.current = opacity;
    sourceRectRef.current = sourceRect;
    activeRef.current = active;
    ctxFilterRef.current = ctxFilter;
  }, [fps, opacity, sourceRect, active, ctxFilter]);

  // Subscribe once to the current visual SNAPSHOT canvas.
  React.useEffect(() => {
    srcRef.current = visualSurface.getSnapshotCanvas();
    const unsub = visualSurface.subscribe((e) => {
      if (e.type === "snapshot") srcRef.current = e.canvas;
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  // Canvas sizing via ResizeObserver (no per-frame layout reads).
  const sizeRef = React.useRef({ pxW: 1, pxH: 1, dpr: 1 });
  React.useEffect(() => {
    const dst = canvasRef.current;
    if (!dst) return;

    const apply = () => {
      const { cssW, cssH } = cssBoxSize(dst);
      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));

      sizeRef.current = { pxW, pxH, dpr };
      if (dst.width !== pxW) dst.width = pxW;
      if (dst.height !== pxH) dst.height = pxH;
    };

    const ro = new ResizeObserver(apply);
    ro.observe(dst);
    apply();
    return () => ro.disconnect();
  }, []);

  // Draw loop (stable; doesn’t restart on prop identity changes).
  React.useEffect(() => {
    let raf = 0;
    let last = 0;

    // one-per-second counters so we can see which early return dominates
    const dbg = { lastLog: 0, counts: {} as Record<string, number> };
    const bump = (k: string) => {
      dbg.counts[k] = (dbg.counts[k] ?? 0) + 1;
    };
    const maybeLog = (t: number) => {
      if (t - dbg.lastLog < 1000) return;
      dbg.lastLog = t;
      // eslint-disable-next-line no-console
      console.log("[sip-snapshot]", dbg.counts);
    };

    // Cache contexts + a backbuffer to avoid blanking on transient draw failures.
    const backRef = {
      canvas: null as HTMLCanvasElement | null,
      ctx: null as CanvasRenderingContext2D | null,
    };
    const ctxRef = { ctx: null as CanvasRenderingContext2D | null };

    const ensure2d = (
      c: HTMLCanvasElement,
    ): CanvasRenderingContext2D | null => {
      if (ctxRef.ctx && ctxRef.ctx.canvas === c) return ctxRef.ctx;
      const ctx = c.getContext("2d", { alpha: true });
      ctxRef.ctx = ctx;
      return ctx;
    };

    const ensureBack = (
      w: number,
      h: number,
    ): CanvasRenderingContext2D | null => {
      let bc = backRef.canvas;
      if (!bc) {
        bc = document.createElement("canvas");
        backRef.canvas = bc;
      }
      if (bc.width !== w) bc.width = w;
      if (bc.height !== h) bc.height = h;

      if (backRef.ctx && backRef.ctx.canvas === bc) return backRef.ctx;
      backRef.ctx = bc.getContext("2d", { alpha: true });
      return backRef.ctx;
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);

      if (!activeRef.current) {
        bump("inactive");
        maybeLog(t);
        return;
      }

      const interval = 1000 / Math.max(1, fpsRef.current);
      if (t - last < interval) {
        bump("fps_gate");
        maybeLog(t);
        return;
      }
      last = t;

      const dst = canvasRef.current;
      const src = srcRef.current;
      if (!dst) {
        bump("no_dst");
        maybeLog(t);
        return;
      }
      if (!src) {
        bump("no_src");
        maybeLog(t);
        return;
      }

      const { pxW, pxH } = sizeRef.current;
      const ctx = ensure2d(dst);
      if (!ctx) {
        bump("no_2d_ctx");
        maybeLog(t);
        return;
      }

      const { srcW, srcH } = getSrcSize(src);
      if (srcW < 2 || srcH < 2) {
        bump("src_too_small");
        maybeLog(t);
        return;
      }

      const bctx = ensureBack(pxW, pxH);
      if (!bctx) {
        bump("no_back_ctx");
        maybeLog(t);
        return;
      }

      // ---- DIAG: force simplest possible mapping ----
const sx = 0;
const sy = 0;
const sw = srcW;
const sh = srcH;

const dX = 0;
const dY = 0;
const dW = pxW;
const dH = pxH;
// ---------------------------------------------


      bump("draw_path");
      maybeLog(t);

      try {
  // draw DIRECTLY to onscreen to eliminate backbuffer/present as a variable
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.filter = "none";

  // DIAG: fill the whole canvas magenta (cannot miss it)
  ctx.clearRect(0, 0, pxW, pxH);
  ctx.fillStyle = "rgba(255,0,255,1)";
  ctx.fillRect(0, 0, pxW, pxH);

  // now attempt the source draw on top
  ctx.drawImage(src, sx, sy, sw, sh, dX, dY, dW, dH);

  bump("direct_present_ok");
  maybeLog(t);
} catch (err) {
  bump("direct_present_throw");
  // eslint-disable-next-line no-console
  console.warn("[sip-snapshot] direct draw threw", err);
}

    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className={className}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        background: "transparent",
        transform: "translateZ(0)",
        backfaceVisibility: "hidden",
        willChange: "transform, opacity",
        contain: "paint",
        ...style,
      }}
    />
  );
}

function VisualizerRingGlowCanvas(props: {
  size: number;
  ringPx: number;
  glowPx: number;
  blurPx: number;
  opacity: number;
  seed: number;
  fps: number;
  active: boolean;
  sourceRect: SourceRect;
}) {
  const { size, ringPx, glowPx, blurPx, opacity, fps, active, sourceRect } =
    props;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const srcRef = React.useRef<HTMLCanvasElement | null>(null);

  // Keep latest prop values without re-starting RAF.
  const fpsRef = React.useRef(fps);
  const opacityRef = React.useRef(opacity);
  const blurRef = React.useRef(blurPx);
  const ringRef = React.useRef(ringPx);
  const glowRef = React.useRef(glowPx);
  const sizeParamRef = React.useRef(size);
  const sourceRectRef = React.useRef<SourceRect>(sourceRect);
  const activeRef = React.useRef(active);

  React.useEffect(() => {
    fpsRef.current = fps;
    opacityRef.current = opacity;
    blurRef.current = blurPx;
    ringRef.current = ringPx;
    glowRef.current = glowPx;
    sizeParamRef.current = size;
    sourceRectRef.current = sourceRect;
    activeRef.current = active;
  }, [fps, opacity, blurPx, ringPx, glowPx, size, sourceRect, active]);

  // Subscribe once to the current visual SNAPSHOT canvas.
  React.useEffect(() => {
    srcRef.current = visualSurface.getSnapshotCanvas();
    const unsub = visualSurface.subscribe((e) => {
      if (e.type === "snapshot") srcRef.current = e.canvas;
    });

    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  // Size canvas via ResizeObserver on its own CSS box (explicit width/height set by parent).
  const sizeRef = React.useRef({ pxW: 1, pxH: 1, dpr: 1 });
  React.useEffect(() => {
    const dst = canvasRef.current;
    if (!dst) return;

    const apply = () => {
      const { cssW, cssH } = cssBoxSize(dst);
      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));

      sizeRef.current = { pxW, pxH, dpr };
      if (dst.width !== pxW) dst.width = pxW;
      if (dst.height !== pxH) dst.height = pxH;
    };

    const ro = new ResizeObserver(apply);
    ro.observe(dst);
    apply();

    return () => ro.disconnect();
  }, []);

  React.useEffect(() => {
    let raf = 0;
    let last = 0;

    const backRef = {
      canvas: null as HTMLCanvasElement | null,
      ctx: null as CanvasRenderingContext2D | null,
    };
    const ctxRef = { ctx: null as CanvasRenderingContext2D | null };

    const ensure2d = (
      c: HTMLCanvasElement,
    ): CanvasRenderingContext2D | null => {
      if (ctxRef.ctx && ctxRef.ctx.canvas === c) return ctxRef.ctx;
      const ctx = c.getContext("2d", { alpha: true });
      ctxRef.ctx = ctx;
      return ctx;
    };

    const ensureBack = (
      w: number,
      h: number,
    ): CanvasRenderingContext2D | null => {
      let bc = backRef.canvas;
      if (!bc) {
        bc = document.createElement("canvas");
        backRef.canvas = bc;
      }
      if (bc.width !== w) bc.width = w;
      if (bc.height !== h) bc.height = h;

      if (backRef.ctx && backRef.ctx.canvas === bc) return backRef.ctx;
      backRef.ctx = bc.getContext("2d", { alpha: true });
      return backRef.ctx;
    };

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);

      if (!activeRef.current) return;

      const interval = 1000 / Math.max(1, fpsRef.current);
      if (t - last < interval) return;
      last = t;

      const dst = canvasRef.current;
      const src = srcRef.current;
      if (!dst || !src) return;

      const { pxW, pxH, dpr } = sizeRef.current;
      const ctx = ensure2d(dst);
      if (!ctx) return;

      const { srcW, srcH } = getSrcSize(src);
      if (srcW < 2 || srcH < 2) return;

      const ringPxNow = ringRef.current;
      const glowPxNow = glowRef.current;
      const blurPxNow = blurRef.current;
      const sizeNow = sizeParamRef.current;

      // geometry (CSS px)
      const pad = ringPxNow + glowPxNow;
      const bleed = Math.max(2, Math.round(blurPxNow * 2));
      const outerPad = pad + bleed;

      const outerR = sizeNow / 2 + outerPad;
      const fadeWidth = glowPxNow + bleed;
      const fadeStart = Math.max(0, outerR - fadeWidth);
      const innerR = Math.max(0, sizeNow / 2 - ringPxNow);

      const { sx, sy, sw, sh } = pickRect(srcW, srcH, sourceRectRef.current);

      // cover fill: keep aspect, crop if needed
      const srcAspect = sw / sh;
      const dstAspect = pxW / pxH;
      let dW = pxW,
        dH = pxH,
        dX = 0,
        dY = 0;
      if (dstAspect > srcAspect) {
        dH = Math.round(pxW / srcAspect);
        dY = Math.round((pxH - dH) / 2);
      } else {
        dW = Math.round(pxH * srcAspect);
        dX = Math.round((pxW - dW) / 2);
      }

      const bctx = ensureBack(pxW, pxH);
      if (!bctx) return;

      try {
        // ---- render EVERYTHING onto backbuffer ----
        bctx.setTransform(1, 0, 0, 1, 0, 0);
        bctx.clearRect(0, 0, pxW, pxH);

        // texture
        bctx.save();
        bctx.globalAlpha = opacityRef.current;
        bctx.globalCompositeOperation = "screen";
        bctx.filter = `blur(${Math.max(0, blurPxNow) * dpr}px) contrast(1.55) saturate(1.55) brightness(1.25)`;
        bctx.drawImage(src, sx, sy, sw, sh, dX, dY, dW, dH);
        bctx.restore();

        // donut mask
        const cx = pxW / 2;
        const cy = pxH / 2;
        const outerRp = outerR * dpr;
        const innerRp = innerR * dpr;

        bctx.save();
        bctx.globalCompositeOperation = "destination-in";
        bctx.beginPath();
        bctx.arc(cx, cy, outerRp, 0, Math.PI * 2);
        bctx.closePath();
        bctx.fill();
        bctx.restore();

        if (innerRp > 0) {
          bctx.save();
          bctx.globalCompositeOperation = "destination-out";
          bctx.beginPath();
          bctx.arc(cx, cy, innerRp, 0, Math.PI * 2);
          bctx.closePath();
          bctx.fill();
          bctx.restore();
        }

        // outer fade
        bctx.save();
        bctx.globalCompositeOperation = "destination-in";
        const g = bctx.createRadialGradient(cx, cy, 0, cx, cy, outerRp);
        const s = Math.max(0, Math.min(1, fadeStart / outerR));
        g.addColorStop(0, "rgba(0,0,0,1)");
        g.addColorStop(s, "rgba(0,0,0,1)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        bctx.fillStyle = g;
        bctx.fillRect(0, 0, pxW, pxH);
        bctx.restore();

        // ---- present once ----
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "copy";
        ctx.drawImage(backRef.canvas as HTMLCanvasElement, 0, 0);
      } catch {
        // Keep last good onscreen frame.
        // if (debugEnabled()) console.warn("[VIS] ring draw failed", err);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // CSS size is controlled by parent, but we set explicit dimensions for clarity
  const pad = ringPx + glowPx;
  const bleed = Math.max(2, Math.round(blurPx * 2));
  const outerPad = pad + bleed;
  const cssSize = size + outerPad * 2;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        width: cssSize,
        height: cssSize,
        display: "block",
        pointerEvents: "none",
        background: "transparent",
      }}
    />
  );
}

export function PatternRingGlow(props: {
  size: number;
  ringPx?: number;
  glowPx?: number;
  blurPx?: number;
  opacity?: number;
  seed?: number;
}) {
  const {
    size,
    ringPx = 2,
    glowPx = 22,
    blurPx = 8,
    opacity = 0.92,
    seed = 1337,
  } = props;

  // (keep this consistent with VisualizerRingGlowCanvas)
  const pad = ringPx + glowPx;
  const bleed = Math.max(2, Math.round(blurPx * 2));
  const outerPad = pad + bleed;
  const cssSize = size + outerPad * 2;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: cssSize,
        height: cssSize,
        transform: "translate(-50%, -50%) translateZ(0)",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <VisualizerRingGlowCanvas
        size={size}
        ringPx={ringPx}
        glowPx={glowPx}
        blurPx={blurPx}
        opacity={opacity}
        seed={seed}
        fps={12}
        active
        sourceRect={{ mode: "random", seed, scale: 0.55 }}
      />
    </div>
  );
}

export function PatternPillUnderlay(props: {
  radius?: number;
  opacity?: number;
  seed?: number;
  active?: boolean;
}) {
  const { radius = 999, opacity = 0.35, seed = 2024, active = true } = props;
  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        inset: 1,
        borderRadius: radius,
        overflow: "hidden",
        pointerEvents: "none",
        opacity: active ? 1 : 0,
        transition: "opacity 180ms ease",
        // compositor isolation
        transform: "translateZ(0)",
        isolation: "isolate",
        contain: "paint",
      }}
    >
      <VisualizerSnapshotCanvas
        opacity={opacity}
        fps={12}
        sourceRect={{ mode: "random", seed, scale: 0.6 }}
        ctxFilter="contrast(1.05) saturate(1.05)"
        active={active}
      />
      <div
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.14), rgba(255,255,255,0.02) 45%, rgba(0,0,0,0.14))",
          mixBlendMode: "screen",
          opacity: 0.35,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export function PatternRail(props: {
  /** total rail height in px (you use 18px hitbox) */
  height: number;
  /** progress 0..1 */
  progress01: number;
  /** show? */
  active?: boolean;
}) {
  const { height, progress01, active = true } = props;
  const pct = Math.max(0, Math.min(1, progress01)) * 100;

  return (
    <div
      aria-hidden
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {/* base rail (subtle) */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: Math.floor((height - 1) / 2),
          height: 1,
          background: "rgba(255,255,255,0.18)",
          opacity: 0.75,
        }}
      />
      {/* patterned progress */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: Math.floor((height - 1) / 2),
          height: 1,
          width: `${pct}%`,
          overflow: "hidden",
        }}
      >
        <div
          style={{ position: "absolute", inset: 0, transform: "scaleY(18)" }}
        >
          <VisualizerSnapshotCanvas
            active={active}
            fps={14}
            opacity={0.55}
            sourceRect={{ mode: "center", scale: 0.6 }}
          />
        </div>
      </div>
    </div>
  );
}
