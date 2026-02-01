// web/app/home/player/visualSurface.ts
"use client";

import type { StageVariant } from "./mediaSurface";

export type VisualSurfaceEvent =
  | { type: "canvas"; canvas: HTMLCanvasElement | null }
  | { type: "snapshot"; canvas: HTMLCanvasElement | null };

type Listener = (e: VisualSurfaceEvent) => void;

/** Toggle via: window.__AF_VIS_DEBUG = true */
function debugEnabled(): boolean {
  return Boolean((globalThis as { __AF_VIS_DEBUG?: boolean }).__AF_VIS_DEBUG);
}

class VisualSurface {
  private listeners = new Set<Listener>();

  private inlineCanvas: HTMLCanvasElement | null = null;
  private fullscreenCanvas: HTMLCanvasElement | null = null;
  private active: HTMLCanvasElement | null = null;

  // ---- Stable 2D snapshot canvas (never swapped) ----
  private snapshotCanvas: HTMLCanvasElement | null = null;
  private snapshotCtx: CanvasRenderingContext2D | null = null;

  // RAF snapshot loop state
  private rafId = 0;
  private lastW = 0;
  private lastH = 0;
  private stableCount = 0;

  private ensureSnapshotCanvas() {
    if (this.snapshotCanvas) return;
    if (typeof document === "undefined") return;

    this.snapshotCanvas = document.createElement("canvas");
    // Start at 1x1 so consumers always have a canvas element.
    this.snapshotCanvas.width = 1;
    this.snapshotCanvas.height = 1;
    this.snapshotCtx = this.snapshotCanvas.getContext("2d", {
      alpha: true,
    }) as CanvasRenderingContext2D | null;
  }

  private notify(e: VisualSurfaceEvent) {
    for (const fn of this.listeners) {
      try {
        fn(e);
      } catch {
        // ignore listener errors
      }
    }
  }

  private recompute() {
    const next = this.fullscreenCanvas ?? this.inlineCanvas ?? null;
    if (next === this.active) return;

    this.active = next;
    this.notify({ type: "canvas", canvas: this.active });

    // Reset stability tracking when the active source swaps.
    this.lastW = 0;
    this.lastH = 0;
    this.stableCount = 0;

    // Ensure snapshot loop is running if anyone is listening.
    this.ensureRafLoop();
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.active;
  }

  /**
   * Stable 2D snapshot that samplers should read from.
   * This canvas element is never swapped; it updates only when a safe copy succeeds.
   */
  getSnapshotCanvas(): HTMLCanvasElement | null {
    this.ensureSnapshotCanvas();
    return this.snapshotCanvas;
  }

  private ensureRafLoop() {
    // Only run the loop when there are listeners.
    if (this.rafId) return;
    if (this.listeners.size === 0) return;

    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      this.copyActiveToSnapshot();
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private stopRafLoopIfIdle() {
    if (this.listeners.size > 0) return;
    if (!this.rafId) return;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private copyActiveToSnapshot() {
    const src = this.active;
    if (!src) return;

    this.ensureSnapshotCanvas();
    const dst = this.snapshotCanvas;
    const ctx = this.snapshotCtx;
    if (!dst || !ctx) return;

    // Use backing-store width/height (WebGL canvas).
    const w = src.width || 0;
    const h = src.height || 0;

    // If source isn't ready, keep last good snapshot.
    if (w < 2 || h < 2) return;

    // If dimensions are changing, treat as resize thrash; wait for stability.
    if (w !== this.lastW || h !== this.lastH) {
      if (debugEnabled()) {
        // Don't spam: log only when a change is detected
        console.log("[vis] active canvas resized", {
          from: [this.lastW, this.lastH],
          to: [w, h],
          variant: this.fullscreenCanvas ? "fullscreen" : "inline",
        });
      }
      this.lastW = w;
      this.lastH = h;
      this.stableCount = 0;
      return;
    }

    // Require a couple stable RAFs before copying to avoid "valid dims, blank pixels" frames.
    this.stableCount = Math.min(10, this.stableCount + 1);
    if (this.stableCount < 2) return;

    // Keep snapshot sized to source.
    if (dst.width !== w) dst.width = w;
    if (dst.height !== h) dst.height = h;

    try {
      // "copy" overwrites without needing a clear.
      const prevComp = ctx.globalCompositeOperation;
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(src, 0, 0);
      ctx.globalCompositeOperation = prevComp;

      this.notify({ type: "snapshot", canvas: dst });
    } catch {
      // If drawImage fails (rare during swaps), keep the old snapshot.
    }
  }

  /**
   * Register a canvas for a stage variant. Fullscreen always wins if present.
   * Returns an unsubscribe cleanup.
   */
  registerCanvas(variant: StageVariant, canvas: HTMLCanvasElement | null) {
    if (variant === "fullscreen") this.fullscreenCanvas = canvas;
    else this.inlineCanvas = canvas;

    this.recompute();

    return () => {
      if (variant === "fullscreen") {
        if (this.fullscreenCanvas === canvas) this.fullscreenCanvas = null;
      } else {
        if (this.inlineCanvas === canvas) this.inlineCanvas = null;
      }
      this.recompute();
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);

    // Emit current active + snapshot immediately.
    fn({ type: "canvas", canvas: this.active });
    fn({ type: "snapshot", canvas: this.getSnapshotCanvas() });

    // Make sure snapshotting runs while someone is subscribed.
    this.ensureRafLoop();

    return () => {
      this.listeners.delete(fn);
      this.stopRafLoopIfIdle();
    };
  }
}

export const visualSurface = new VisualSurface();

// Expose for console debugging (safe, read-only usage expected)
declare global {
  // eslint-disable-next-line no-var
  var visualSurface: VisualSurface | undefined;
}

globalThis.visualSurface = visualSurface;

