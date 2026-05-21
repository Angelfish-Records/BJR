// web/app/home/player/visualizer/core/themeRegistry.ts

import type { Theme } from "../types";

export type ThemeFactory = () => Theme;

type NebulaMod = typeof import("../themes/nebula");
type LatticeMod = typeof import("../themes/gravitationalLattice");
type OrbitalMod = typeof import("../themes/orbitalScript");
type MhdMod = typeof import("../themes/mhdSilk");
type PressureMod = typeof import("../themes/pressureGlass");
type VeinsMod = typeof import("../themes/reactionVeins");
type Veins2Mod = typeof import("../themes/reactionVeins2");
type FilamentMod = typeof import("../themes/filamentStorm");
type MosaicMod = typeof import("../themes/mosaicDrift");
type MeaningMod = typeof import("../themes/meaningLeak");

type LidarMod = typeof import("../themes/lidarCathedral");
type PhaseMod = typeof import("../themes/phaseInterferenceFabric");
type TopographicMod = typeof import("../themes/topographicMemory");
type MagneticMod = typeof import("../themes/magneticParticulate");
type CausticsMod = typeof import("../themes/opticalCaustics");
type HorizonMod = typeof import("../themes/eventHorizon");
type SignalMod = typeof import("../themes/signalDecay");
type FractureMod = typeof import("../themes/fracturePropagation");
type CrystalMod = typeof import("../themes/crystallineGrowth");

export type ThemeName =
  | "nebula"
  | "gravitational-lattice"
  | "filament-storm"
  | "mosaic-drift"
  | "meaning-leak"
  | "orbital-script"
  | "mhd-silk"
  | "pressure-glass"
  | "reaction-veins"
  | "reaction-veins-2"
  | "lidar-cathedral"
  | "phase-interference-fabric"
  | "topographic-memory"
  | "magnetic-particulate"
  | "optical-caustics"
  | "event-horizon"
  | "signal-decay"
  | "fracture-propagation"
  | "crystalline-growth";

const themeCache = new Map<ThemeName, ThemeFactory>();

function normThemeKey(key: string | undefined | null): string {
  return (key ?? "").trim().toLowerCase();
}

export function canonicalThemeName(raw: string | undefined | null): ThemeName {
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
    ((await import("../themes/nebula")) as NebulaMod).createNebulaTheme,

  "gravitational-lattice": async () =>
    ((await import("../themes/gravitationalLattice")) as LatticeMod)
      .createGravitationalLatticeTheme,

  "filament-storm": async () =>
    ((await import("../themes/filamentStorm")) as FilamentMod)
      .createFilamentStormTheme,

  "mosaic-drift": async () =>
    ((await import("../themes/mosaicDrift")) as MosaicMod)
      .createMosaicDriftTheme,

  "meaning-leak": async () =>
    ((await import("../themes/meaningLeak")) as MeaningMod)
      .createMeaningLeakTheme,

  "orbital-script": async () =>
    ((await import("../themes/orbitalScript")) as OrbitalMod)
      .createOrbitalScriptTheme,

  "mhd-silk": async () =>
    ((await import("../themes/mhdSilk")) as MhdMod).createMHDSilkTheme,

  "pressure-glass": async () =>
    ((await import("../themes/pressureGlass")) as PressureMod)
      .createPressureGlassTheme,

  "reaction-veins": async () =>
    ((await import("../themes/reactionVeins")) as VeinsMod)
      .createReactionVeinsTheme,

  "reaction-veins-2": async () =>
    ((await import("../themes/reactionVeins2")) as Veins2Mod)
      .createReactionVeins2Theme,

  "lidar-cathedral": async () =>
    ((await import("../themes/lidarCathedral")) as LidarMod)
      .createLidarCathedralTheme,

  "phase-interference-fabric": async () =>
    ((await import("../themes/phaseInterferenceFabric")) as PhaseMod)
      .createPhaseInterferenceFabricTheme,

  "topographic-memory": async () =>
    ((await import("../themes/topographicMemory")) as TopographicMod)
      .createTopographicMemoryTheme,

  "magnetic-particulate": async () =>
    ((await import("../themes/magneticParticulate")) as MagneticMod)
      .createMagneticParticulateTheme,

  "optical-caustics": async () =>
    ((await import("../themes/opticalCaustics")) as CausticsMod)
      .createOpticalCausticsTheme,

  "event-horizon": async () =>
    ((await import("../themes/eventHorizon")) as HorizonMod)
      .createEventHorizonTheme,

  "signal-decay": async () =>
    ((await import("../themes/signalDecay")) as SignalMod)
      .createSignalDecayTheme,

  "fracture-propagation": async () =>
    ((await import("../themes/fracturePropagation")) as FractureMod)
      .createFracturePropagationTheme,

  "crystalline-growth": async () =>
    ((await import("../themes/crystallineGrowth")) as CrystalMod)
      .createCrystallineGrowthTheme,
};

export async function loadThemeFactory(
  themeName: ThemeName,
): Promise<ThemeFactory> {
  const cached = themeCache.get(themeName);
  if (cached) return cached;

  const factory = await THEME_LOADERS[themeName]();
  themeCache.set(themeName, factory);

  return factory;
}

export function createBlankTheme(): Theme {
  return { name: "blank", init() {}, render() {}, dispose() {} };
}