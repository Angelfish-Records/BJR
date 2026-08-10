"use client";

import type { StageVariant } from "../mediaSurface";

export type VisualizerPerfMetrics = {
  variant: StageVariant;
  profile: "inline" | "fullscreen";
  themeName: string;
  tier: "idle" | "active" | "transition";
  mode: "idle" | "playing" | "transition";
  fpsCap: number;
  fpsObserved: number;
  avgFrameCostMs: number;
  baseDpr: number;
  dprScale: number;
  appliedDpr: number;
  canvasPxW: number;
  canvasPxH: number;
  snapshotPxW: number;
  snapshotPxH: number;
  snapshotFps: number;
  updatedAt: number;
};

type Listener = (metrics: VisualizerPerfMetrics | null) => void;

class VisualizerPerfSurface {
  private byVariant: Record<StageVariant, VisualizerPerfMetrics | null> = {
    inline: null,
    fullscreen: null,
  };

  private readonly listenersByVariant: Record<StageVariant, Set<Listener>> = {
    inline: new Set<Listener>(),
    fullscreen: new Set<Listener>(),
  };

  getMetrics(variant: StageVariant): VisualizerPerfMetrics | null {
    return this.byVariant[variant];
  }

  setMetrics(variant: StageVariant, metrics: VisualizerPerfMetrics) {
    this.byVariant[variant] = metrics;
    for (const fn of this.listenersByVariant[variant]) {
      try {
        fn(metrics);
      } catch {
        // ignore listener errors
      }
    }
  }

  clearMetrics(variant: StageVariant) {
    this.byVariant[variant] = null;
    for (const fn of this.listenersByVariant[variant]) {
      try {
        fn(null);
      } catch {
        // ignore listener errors
      }
    }
  }

  subscribe(variant: StageVariant, fn: Listener) {
    this.listenersByVariant[variant].add(fn);
    fn(this.byVariant[variant]);

    return () => {
      this.listenersByVariant[variant].delete(fn);
    };
  }
}

export const visualizerPerfSurface = new VisualizerPerfSurface();