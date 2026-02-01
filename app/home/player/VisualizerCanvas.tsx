//web/app/home/player/VisualizerCanvas.tsx
"use client";

import React from "react";
import { usePlayer } from "./PlayerState";
import { VisualizerEngine } from "./visualizer/VisualizerEngine";
import { audioSurface } from "./audioSurface";
import { mediaSurface, type StageVariant } from "./mediaSurface";
import type { Theme } from "./visualizer/types";
import { visualSurface } from "./visualSurface";

import { createIdleMistTheme } from "./visualizer/themes/idleMist";

type ThemeFactory = () => Theme;

type NebulaMod = typeof import("./visualizer/themes/nebula");
type LatticeMod = typeof import("./visualizer/themes/gravitationalLattice");
type OrbitalMod = typeof import("./visualizer/themes/orbitalScript");
type PhaseMod = typeof import("./visualizer/themes/phaseGlass");
type MhdMod = typeof import("./visualizer/themes/mhdSilk");
type PressureMod = typeof import("./visualizer/themes/pressureGlass");
type VeinsMod = typeof import("./visualizer/themes/reactionVeins");
type FogMod = typeof import("./visualizer/themes/dreamFog");
type FilamentMod = typeof import("./visualizer/themes/filamentStorm");
type MosaicMod = typeof import("./visualizer/themes/mosaicDrift");
type MeaningMod = typeof import("./visualizer/themes/meaningLeak");

type ThemeName =
  | "nebula"
  | "gravitational-lattice"
  | "dream-fog"
  | "filament-storm"
  | "mosaic-drift"
  | "meaning-leak"
  | "orbital-script"
  | "phase-glass"
  | "mhd-silk"
  | "pressure-glass"
  | "reaction-veins";

const themeCache = new Map<ThemeName, ThemeFactory>();

function normThemeKey(key: string | undefined | null): string {
  return (key ?? "").trim().toLowerCase();
}

function canonicalThemeName(raw: string | undefined | null): ThemeName {
  const k = normThemeKey(raw);
  switch (k) {
    case "gravitational-lattice":
    case "lattice":
      return "gravitational-lattice";
    case "dream-fog":
    case "fog":
      return "dream-fog";
    case "filament-storm":
    case "filament":
      return "filament-storm";
    case "mosaic-drift":
    case "mosaic":
      return "mosaic-drift";
    case "meaning-leak":
    case "meaning":
      return "meaning-leak";
    case "orbital-script":
    case "orbital":
      return "orbital-script";
    case "phase-glass":
    case "glass":
      return "phase-glass";
    case "mhd-silk":
    case "mhd":
      return "mhd-silk";
    case "pressure-glass":
    case "pressure":
      return "pressure-glass";
    case "reaction-veins":
    case "veins":
      return "reaction-veins";
    case "nebula":
    default:
      return "nebula";
  }
}

const THEME_LOADERS: Record<ThemeName, () => Promise<ThemeFactory>> = {
  nebula: async () =>
    ((await import("./visualizer/themes/nebula")) as NebulaMod).createNebulaTheme,
  "gravitational-lattice": async () =>
    ((await import("./visualizer/themes/gravitationalLattice")) as LatticeMod)
      .createGravitationalLatticeTheme,
  "dream-fog": async () =>
    ((await import("./visualizer/themes/dreamFog")) as FogMod).createDreamFogTheme,
  "filament-storm": async () =>
    ((await import("./visualizer/themes/filamentStorm")) as FilamentMod)
      .createFilamentStormTheme,
  "mosaic-drift": async () =>
    ((await import("./visualizer/themes/mosaicDrift")) as MosaicMod)
      .createMosaicDriftTheme,
  "meaning-leak": async () =>
    ((await import("./visualizer/themes/meaningLeak")) as MeaningMod)
      .createMeaningLeakTheme,
  "orbital-script": async () =>
    ((await import("./visualizer/themes/orbitalScript")) as OrbitalMod)
      .createOrbitalScriptTheme,
  "phase-glass": async () =>
    ((await import("./visualizer/themes/phaseGlass")) as PhaseMod)
      .createPhaseGlassTheme,
  "mhd-silk": async () =>
    ((await import("./visualizer/themes/mhdSilk")) as MhdMod).createMHDSilkTheme,
  "pressure-glass": async () =>
    ((await import("./visualizer/themes/pressureGlass")) as PressureMod)
      .createPressureGlassTheme,
  "reaction-veins": async () =>
    ((await import("./visualizer/themes/reactionVeins")) as VeinsMod)
      .createReactionVeinsTheme,
};

async function loadThemeFactory(themeName: ThemeName): Promise<ThemeFactory> {
  const cached = themeCache.get(themeName);
  if (cached) return cached;
  const factory = await THEME_LOADERS[themeName]();
  themeCache.set(themeName, factory);
  return factory;
}

function createBlankTheme(): Theme {
  return { name: "blank", init() {}, render() {}, dispose() {} };
}

export default function VisualizerCanvas(props: { variant: StageVariant }) {
  const { variant } = props;
  const p = usePlayer();

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const engineRef = React.useRef<VisualizerEngine | null>(null);

  const [activeStage, setActiveStage] = React.useState<StageVariant | null>(() =>
    mediaSurface.getStageVariant(),
  );

  React.useEffect(() => {
    return mediaSurface.subscribe((e) => {
      if (e.type === "stage") setActiveStage(e.variant);
    });
  }, []);

  const themeName: ThemeName = canonicalThemeName(p.current?.visualTheme);

  // Mount engine once per canvas instance.
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
    });

    engine.setIdleTheme(createIdleMistTheme());
    engineRef.current = engine;

    // Prime target theme (async, engine-owned)
    let cancelled = false;
    (async () => {
      const factory = await loadThemeFactory(canonicalThemeName(p.current?.visualTheme));
      if (cancelled) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  // IMPORTANT: only register the canvas as the visual source when this variant
  // is the authoritative stage. Otherwise samplers may lock onto a blank/stopped canvas.
  const unregRef = React.useRef<null | (() => void)>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // cleanup any previous registration before changing
    try {
      unregRef.current?.();
    } catch {}
    unregRef.current = null;

    if (activeStage === variant) {
      unregRef.current = visualSurface.registerCanvas(variant, canvas);
    }

    return () => {
      try {
        unregRef.current?.();
      } catch {}
      unregRef.current = null;
    };
  }, [activeStage, variant]);

  // Start/stop rendering based on stage authority.
  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (activeStage === variant) engine.start();
    else engine.stop();
  }, [activeStage, variant]);

  // Feed wantPlaying into engine.
  const wantPlaying =
    p.status === "playing" ||
    p.status === "loading" ||
    p.status === "paused" ||
    p.intent === "play";

  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setWantPlaying(wantPlaying, { toIdleTransition: true });
  }, [wantPlaying]);

  // Swap target theme lazily when key changes.
  React.useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    let cancelled = false;
    (async () => {
      const factory = await loadThemeFactory(themeName);
      if (cancelled) return;
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
