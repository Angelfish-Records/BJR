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
  private readonly listeners = new Set<Listener>();

  private inlineCanvas: HTMLCanvasElement | null = null;
  private fullscreenCanvas: HTMLCanvasElement | null = null;
  private active: HTMLCanvasElement | null = null;

  private inlineSnapshotCanvas: HTMLCanvasElement | null = null;
  private fullscreenSnapshotCanvas: HTMLCanvasElement | null = null;
  private activeSnapshot: HTMLCanvasElement | null = null;

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
    const nextCanvas = this.fullscreenCanvas ?? this.inlineCanvas ?? null;
    const nextSnapshot =
      this.fullscreenSnapshotCanvas ?? this.inlineSnapshotCanvas ?? null;

    const canvasChanged = nextCanvas !== this.active;
    const snapshotChanged = nextSnapshot !== this.activeSnapshot;

    if (!canvasChanged && !snapshotChanged) return;

    this.active = nextCanvas;
    this.activeSnapshot = nextSnapshot;

    if (canvasChanged) {
      this.notify({ type: "canvas", canvas: this.active });
    }

    if (snapshotChanged) {
      this.notify({ type: "snapshot", canvas: this.activeSnapshot });
    }

    if (debugEnabled()) {
      let activeVariant: StageVariant | null = null;
      if (this.fullscreenCanvas) {
        activeVariant = "fullscreen";
      } else if (this.inlineCanvas) {
        activeVariant = "inline";
      }

      console.log("[vis] recompute", {
        activeVariant,
        hasCanvas: Boolean(this.active),
        hasSnapshot: Boolean(this.activeSnapshot),
      });
    }
  }

  getCanvas(): HTMLCanvasElement | null {
    return this.active;
  }

  getSnapshotCanvas(): HTMLCanvasElement | null {
    return this.activeSnapshot;
  }

  /**
   * Register live and snapshot canvases for a stage variant. Fullscreen always wins if present.
   * Returns an unsubscribe cleanup.
   */
  registerCanvas(
    variant: StageVariant,
    canvas: HTMLCanvasElement | null,
    snapshotCanvas?: HTMLCanvasElement | null,
  ) {
    if (variant === "fullscreen") {
      this.fullscreenCanvas = canvas;
      this.fullscreenSnapshotCanvas = snapshotCanvas ?? null;
    } else {
      this.inlineCanvas = canvas;
      this.inlineSnapshotCanvas = snapshotCanvas ?? null;
    }

    this.recompute();

    return () => {
      if (variant === "fullscreen") {
        if (this.fullscreenCanvas === canvas) this.fullscreenCanvas = null;
        if (this.fullscreenSnapshotCanvas === (snapshotCanvas ?? null)) {
          this.fullscreenSnapshotCanvas = null;
        }
      } else {
        if (this.inlineCanvas === canvas) this.inlineCanvas = null;
        if (this.inlineSnapshotCanvas === (snapshotCanvas ?? null)) {
          this.inlineSnapshotCanvas = null;
        }
      }
      this.recompute();
    };
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);

    fn({ type: "canvas", canvas: this.active });
    fn({ type: "snapshot", canvas: this.activeSnapshot });

    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const visualSurface = new VisualSurface();
