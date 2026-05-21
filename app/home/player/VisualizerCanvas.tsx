// web/app/home/player/VisualizerCanvas.tsx
"use client";

import React from "react";
import { usePlayerVisual } from "./PlayerState";
import { VisualizerEngine } from "./visualizer/VisualizerEngine";
import { audioSurface } from "./audioSurface";
import { mediaSurface, type StageVariant } from "./mediaSurface";
import { visualSurface } from "./visualSurface";

import { createIdleMistTheme } from "./visualizer/themes/idleMist";
import {
  canonicalThemeName,
  createBlankTheme,
  loadThemeFactory,
  type ThemeName,
} from "./visualizer/core/themeRegistry";

export default function VisualizerCanvas(props: { variant: StageVariant }) {
  const { variant } = props;
  const player = usePlayerVisual();

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engineRef = React.useRef<VisualizerEngine | null>(null);

  const [activeStage, setActiveStage] = React.useState<StageVariant | null>(
    () => mediaSurface.getStageVariant(),
  );

  React.useEffect(() => {
    return mediaSurface.subscribe((e) => {
      if (e.type === "stage") setActiveStage(e.variant);
    });
  }, []);

  const themeName: ThemeName = canonicalThemeName(player.current?.visualTheme);

  const themeNameRef = React.useRef<ThemeName>(themeName);

  React.useEffect(() => {
    themeNameRef.current = themeName;
  }, [themeName]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

    const getAudio = () => {
      const a = audioSurface.get();
      return prefersReduced ? { ...a, energy: 0.12 } : a;
    };

    const engine = new VisualizerEngine({
      canvas,
      getAudio,
      theme: createBlankTheme(),
      performanceProfile: variant === "fullscreen" ? "fullscreen" : "inline",
      stageVariant: variant,
      initialThemeName: themeNameRef.current,
    });

    engine.setIdleTheme(createIdleMistTheme());
    engineRef.current = engine;

    let cancelled = false;

    (async () => {
      const nextThemeName = themeNameRef.current;
      const factory = await loadThemeFactory(nextThemeName);

      if (cancelled || engineRef.current !== engine) return;

      engine.setThemeDebugName(nextThemeName);
      engine.setTargetTheme(factory());
    })().catch(() => {});

    return () => {
      cancelled = true;

      try {
        engine.stop();
        engine.dispose();
      } finally {
        engineRef.current = null;
      }
    };
  }, [variant]);

  const unregRef = React.useRef<null | (() => void)>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      unregRef.current?.();
    } catch {}

    unregRef.current = null;

    if (activeStage === variant) {
      const snapshotCanvas =
        engineRef.current?.getStableSnapshotCanvas?.() ?? null;

      unregRef.current = visualSurface.registerCanvas(
        variant,
        canvas,
        snapshotCanvas,
      );
    }

    return () => {
      try {
        unregRef.current?.();
      } catch {}

      unregRef.current = null;
    };
  }, [activeStage, variant]);

  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    if (activeStage === variant) engine.start();
    else engine.stop();
  }, [activeStage, variant]);

  const wantPlaying =
    player.status === "playing" ||
    player.status === "loading" ||
    player.status === "paused" ||
    player.intent === "play";

  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setWantPlaying(wantPlaying, { toIdleTransition: true });
  }, [wantPlaying]);

  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.setThemeDebugName(themeName);

    let cancelled = false;

    (async () => {
      const factory = await loadThemeFactory(themeName);

      if (cancelled || engineRef.current !== engine) return;

      engine.setTargetTheme(factory());
    })().catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [themeName]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "block",
        pointerEvents: "none",
        zIndex: 0,
      }}
    />
  );
}
