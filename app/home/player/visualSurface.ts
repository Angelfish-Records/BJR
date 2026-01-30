// web/app/home/player/visualSurface.ts
"use client";

import type { StageVariant } from "./mediaSurface";

export type VisualSurfaceEvent = {
  type: "canvas";
  canvas: HTMLCanvasElement | null;
};

type Listener = (e: VisualSurfaceEvent) => void;

class VisualSurface {
  private listeners = new Set<Listener>();

  private inlineCanvas: HTMLCanvasElement | null = null;
  private fullscreenCanvas: HTMLCanvasElement | null = null;
  private active: HTMLCanvasElement | null = null;

  private recompute() {
    const next = this.fullscreenCanvas ?? this.inlineCanvas ?? null;
    if (next === this.active) return;
    this.active = next;
    for (const fn of this.listeners)
      fn({ type: "canvas", canvas: this.active });
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.active;
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
    fn({ type: "canvas", canvas: this.active });
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const visualSurface = new VisualSurface();
