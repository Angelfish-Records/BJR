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

/*
  const k = normThemeKey(raw);

  switch (k) {
    case "gravitational-lattice":
    case "lattice":
      return "gravitational-lattice";

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

    case "mhd-silk":
    case "mhd":
      return "mhd-silk";

    case "pressure-glass":
    case "pressure":
      return "pressure-glass";

    case "reaction-veins-2":
    case "reaction-veins-v2":
    case "veins-2":
    case "veins-v2":
    case "memory-skin":
      return "reaction-veins-2";

    case "reaction-veins":
    case "veins":
      return "reaction-veins";

    case "lidar-cathedral":
    case "lidar":
    case "point-cloud":
    case "point-cloud-rendering":
    case "pointcloud":
      return "lidar-cathedral";

    case "phase-interference-fabric":
    case "phase-interference":
    case "interference-fabric":
    case "phase-fabric":
    case "interference":
      return "phase-interference-fabric";

    case "topographic-memory":
    case "topographic":
    case "topography":
    case "contour":
    case "contours":
      return "topographic-memory";

    case "magnetic-particulate":
    case "magnetic":
    case "particulate":
    case "iron-filings":
      return "magnetic-particulate";

    case "optical-caustics":
    case "caustics":
    case "caustic":
      return "optical-caustics";

    case "event-horizon":
    case "horizon":
    case "black-hole":
    case "singularity":
      return "event-horizon";

    case "signal-decay":
    case "ghost-trails":
    case "ghost-trail":
    case "decay":
      return "signal-decay";

    case "fracture-propagation":
    case "fracture":
    case "crack":
    case "cracks":
      return "fracture-propagation";

    case "crystalline-growth":
    case "crystal-growth":
    case "crystalline":
    case "crystal":
    case "crystals":
      return "crystalline-growth";

    case "nebula":
    default:
      return "nebula";
  }
}

const THEME_LOADERS: Record<ThemeName, () => Promise<ThemeFactory>> = {
  nebula: async () =>
    ((await import("./visualizer/themes/nebula")) as NebulaMod)
      .createNebulaTheme,

  "gravitational-lattice": async () =>
    ((await import("./visualizer/themes/gravitationalLattice")) as LatticeMod)
      .createGravitationalLatticeTheme,

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

  "mhd-silk": async () =>
    ((await import("./visualizer/themes/mhdSilk")) as MhdMod)
      .createMHDSilkTheme,

  "pressure-glass": async () =>
    ((await import("./visualizer/themes/pressureGlass")) as PressureMod)
      .createPressureGlassTheme,

  "reaction-veins": async () =>
    ((await import("./visualizer/themes/reactionVeins")) as VeinsMod)
      .createReactionVeinsTheme,

  "reaction-veins-2": async () =>
    ((await import("./visualizer/themes/reactionVeins2")) as Veins2Mod)
      .createReactionVeins2Theme,

  "lidar-cathedral": async () =>
    ((await import("./visualizer/themes/lidarCathedral")) as LidarMod)
      .createLidarCathedralTheme,

  "phase-interference-fabric": async () =>
    ((await import("./visualizer/themes/phaseInterferenceFabric")) as PhaseMod)
      .createPhaseInterferenceFabricTheme,

  "topographic-memory": async () =>
    ((await import("./visualizer/themes/topographicMemory")) as TopographicMod)
      .createTopographicMemoryTheme,

  "magnetic-particulate": async () =>
    ((await import("./visualizer/themes/magneticParticulate")) as MagneticMod)
      .createMagneticParticulateTheme,

  "optical-caustics": async () =>
    ((await import("./visualizer/themes/opticalCaustics")) as CausticsMod)
      .createOpticalCausticsTheme,

  "event-horizon": async () =>
    ((await import("./visualizer/themes/eventHorizon")) as HorizonMod)
      .createEventHorizonTheme,

  "signal-decay": async () =>
    ((await import("./visualizer/themes/signalDecay")) as SignalMod)
      .createSignalDecayTheme,

  "fracture-propagation": async () =>
    ((await import("./visualizer/themes/fracturePropagation")) as FractureMod)
      .createFracturePropagationTheme,

  "crystalline-growth": async () =>
    ((await import("./visualizer/themes/crystallineGrowth")) as CrystalMod)
      .createCrystallineGrowthTheme,
};

async function loadThemeFactory(themeName: ThemeName): Promise<ThemeFactory> {
  const cached = themeCache.get(themeName);
  if (cached) return cached;

  const factory = await THEME_LOADERS[themeName]();
  themeCache.set(themeName, factory);

  return factory;
}

*/

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
