// web/app/home/player/VisualizerPattern.tsx
"use client";

import React from "react";
import { visualSurface } from "./visualSurface";

type SourceRect =
  | { mode: "full" }
  | { mode: "center"; scale?: number }
  | { mode: "random"; seed: number; scale?: number };

function pickRect(
  srcW: number,
  srcH: number,
  rect: SourceRect,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 1 || srcH <= 1) return { sx: 0, sy: 0, sw: srcW, sh: srcH };

  const clamp = (n: number, a: number, b: number) =>
    Math.max(a, Math.min(b, n));

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

export function VisualizerSnapshotCanvas(props: {
  /** CSS size comes from container; this is for internal pixel density */
  className?: string;
  style?: React.CSSProperties;
  fps?: number;
  opacity?: number;
  sourceRect?: SourceRect;
  /** If provided, draws only when true */
  active?: boolean;
}) {
  const {
    className,
    style,
    fps = 14,
    opacity = 0.55,
    sourceRect = { mode: "center" },
    active = true,
  } = props;

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const srcRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    srcRef.current = visualSurface.getCanvas();
    const unsub = visualSurface.subscribe((e) => {
      if (e.type === "canvas") srcRef.current = e.canvas;
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  React.useEffect(() => {
    if (!active) return;

    let raf = 0;
    let last = 0;
    const interval = 1000 / Math.max(1, fps);

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < interval) return;
      last = t;

      const dst = canvasRef.current;
      const src = srcRef.current;
      if (!dst || !src) return;

      const r = dst.getBoundingClientRect();
      const cssW = Math.max(1, Math.round(r.width));
      const cssH = Math.max(1, Math.round(r.height));

      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));

      if (dst.width !== pxW || dst.height !== pxH) {
        dst.width = pxW;
        dst.height = pxH;
      }

      const ctx = dst.getContext("2d", { alpha: true });
      if (!ctx) return;

      const srcW = src.width || src.clientWidth || 1;
      const srcH = src.height || src.clientHeight || 1;
      const { sx, sy, sw, sh } = pickRect(srcW, srcH, sourceRect);

      // Fully transparent destination each frame
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pxW, pxH);

      // cover fill: keep aspect, crop if needed
      const srcAspect = sw / sh;
      const dstAspect = pxW / pxH;

      let dW = pxW;
      let dH = pxH;
      let dX = 0;
      let dY = 0;

      if (dstAspect > srcAspect) {
        dH = Math.round(pxW / srcAspect);
        dY = Math.round((pxH - dH) / 2);
      } else {
        dW = Math.round(pxH * srcAspect);
        dX = Math.round((pxW - dW) / 2);
      }

      // Key change: draw using SCREEN so black background in src contributes nothing
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = "screen";

      try {
        ctx.drawImage(src, sx, sy, sw, sh, dX, dY, dW, dH);
      } catch {
        // ignore transient draw errors
      } finally {
        ctx.restore();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [fps, opacity, sourceRect, active]);

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

  // match your existing subscription pattern
  React.useEffect(() => {
    srcRef.current = visualSurface.getCanvas();
    const unsub = visualSurface.subscribe((e) => {
      if (e.type === "canvas") srcRef.current = e.canvas;
    });
    return () => {
      try {
        unsub();
      } catch {}
    };
  }, []);

  React.useEffect(() => {
    if (!active) return;

    let raf = 0;
    let last = 0;
    const interval = 1000 / Math.max(1, fps);

    // geometry (CSS px)
    const pad = ringPx + glowPx;
    const bleed = Math.max(2, Math.round(blurPx * 2));
    const outerPad = pad + bleed;

    const outerR = size / 2 + outerPad;
    const fadeWidth = glowPx + bleed;
    const fadeStart = Math.max(0, outerR - fadeWidth);
    const innerR = Math.max(0, size / 2 - ringPx);

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick);
      if (t - last < interval) return;
      last = t;

      const dst = canvasRef.current;
      const src = srcRef.current;
      if (!dst || !src) return;

      const cssW = Math.max(1, Math.round(size + outerPad * 2));
      const cssH = cssW;

      const dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
      const pxW = Math.max(1, Math.round(cssW * dpr));
      const pxH = Math.max(1, Math.round(cssH * dpr));

      if (dst.width !== pxW || dst.height !== pxH) {
        dst.width = pxW;
        dst.height = pxH;
      }

      const ctx = dst.getContext("2d", { alpha: true });
      if (!ctx) return;

      // clear
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, pxW, pxH);

      // ---- draw sampled visual texture (cover fill) ----
      const srcW = src.width || src.clientWidth || 1;
      const srcH = src.height || src.clientHeight || 1;
      const { sx, sy, sw, sh } = pickRect(srcW, srcH, sourceRect);

      const srcAspect = sw / sh;
      const dstAspect = pxW / pxH;
      let dW = pxW;
      let dH = pxH;
      let dX = 0;
      let dY = 0;

      if (dstAspect > srcAspect) {
        dH = Math.round(pxW / srcAspect);
        dY = Math.round((pxH - dH) / 2);
      } else {
        dW = Math.round(pxH * srcAspect);
        dX = Math.round((pxW - dW) / 2);
      }

      // IMPORTANT: do all “glow” effects in-canvas (no CSS filter = no square artifact)
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.globalCompositeOperation = "screen";
      ctx.filter = `blur(${Math.max(0, blurPx) * dpr}px) contrast(1.55) saturate(1.55) brightness(1.25)`;

      try {
        ctx.drawImage(src, sx, sy, sw, sh, dX, dY, dW, dH);
      } catch {
        // transient draw errors ok
      }
      ctx.restore();

      // ---- donut mask: keep only the ring band ----
      const cx = pxW / 2;
      const cy = pxH / 2;
      const outerRp = outerR * dpr;
      const innerRp = innerR * dpr;

      // keep outer circle
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      ctx.beginPath();
      ctx.arc(cx, cy, outerRp, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // punch inner hole
      if (innerRp > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(cx, cy, innerRp, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // ---- outer fade: radial alpha falloff to transparent at the edge ----
      ctx.save();
      ctx.globalCompositeOperation = "destination-in";
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, outerRp);
      const s = Math.max(0, Math.min(1, fadeStart / outerR));
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(s, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, fps, glowPx, blurPx, opacity, ringPx, size, sourceRect]);

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
      }}
    >
      <VisualizerSnapshotCanvas
        opacity={opacity}
        fps={12}
        sourceRect={{ mode: "random", seed, scale: 0.6 }}
        style={{ filter: "contrast(1.05) saturate(1.05)" }}
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
