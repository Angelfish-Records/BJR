// web/app/home/player/visualizer/themes/lockstep.ts

import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

/**
 * LOCKSTEP
 * Long-form verb: PHASE-LOCK
 *
 * The world is one common oblique fabric. Large pressure territories invade
 * that fabric from the right while a central squeeze zone expands and forces
 * neighbouring regions into coerced synchronization.
 *
 * Temporal ownership:
 * - uTime: microscopic material creep and autonomous grazing illumination.
 * - audio: local pressure / heat / seam excitation.
 * - uTrackProgress: deterministic territorial advance and convergence.
 *
 * --------------------------------------------------------------------------
 * LOCKED BASE FABRIC
 * --------------------------------------------------------------------------
 * The shared oblique striation world and its material grammar below are
 * intentionally preserved as the core identity of LOCKSTEP. Later passes
 * should not casually alter:
 *
 * - the common oblique substrate;
 * - its dense stable stripe language;
 * - the principle that all territories are states of the same fabric.
 *
 * --------------------------------------------------------------------------
 * LOCKED CORE TOPOLOGY
 * --------------------------------------------------------------------------
 * Runtime review has validated the central rupture, rightward territorial
 * takeover, shared oblique substrate, and deterministic progress narrative.
 *
 * Optical hardening passes must not alter:
 *
 * - pressure-mask geometry or advance curves;
 * - central squeeze geometry;
 * - right-side territorial takeover;
 * - shared stripe topology or local pressure displacement;
 * - progress ownership of the long-form narrative.
 *
 * --------------------------------------------------------------------------
 * REACTIVE URGENCY LAYER
 * --------------------------------------------------------------------------
 * Audio may intensify light, emission, membrane stress, sparse ejecta and
 * local exposure. It must not shake, translate, rotate or scale the world.
 */

const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;

uniform float uTrackProgress;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;
uniform float uSeed;
uniform float uOrientation;

float saturate(float x) {
  return clamp(x, 0.0, 1.0);
}

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(
    mix(a, b, u.x),
    mix(c, d, u.x),
    u.y
  );
}

float fbm3(vec2 p) {
  float value = 0.0;
  float amp = 0.55;

  value += amp * noise(p);
  p = p * 2.03 + vec2(11.7, -4.3);
  amp *= 0.5;

  value += amp * noise(p);
  p = p * 2.01 + vec2(-7.1, 13.9);
  amp *= 0.5;

  value += amp * noise(p);

  return value;
}

float insideMask(float signedDistanceValue, float softness) {
  return 1.0 - smoothstep(-softness, softness, signedDistanceValue);
}

float frontBand(float signedDistanceValue, float width) {
  float aa = max(fwidth(signedDistanceValue) * 1.4, 0.0012);

  return 1.0 - smoothstep(
    width - aa,
    width + aa,
    abs(signedDistanceValue)
  );
}

float stripeAA(float distanceValue, float halfWidth) {
  float aa = max(fwidth(distanceValue) * 1.35, 0.0008);

  return 1.0 - smoothstep(
    halfWidth - aa,
    halfWidth + aa,
    distanceValue
  );
}

float superellipseSdf(vec2 p, vec2 radius, float exponentValue) {
  vec2 q = abs(p) / max(radius, vec2(0.0001));
  float n = exponentValue;

  return pow(
    pow(q.x, n) + pow(q.y, n),
    1.0 / n
  ) - 1.0;
}

void main() {
  float progress = saturate(uTrackProgress);
  float energy = saturate(uEnergy);
  float rms = saturate(uRms);
  float bass = saturate(uBass);
  float mid = saturate(uMid);
  float treble = saturate(uTreble);
  float spectralCentroid = saturate(uCentroid);

  vec2 p =
    (
      vUv * uRes -
      0.5 * uRes
    ) /
    min(uRes.x, uRes.y);

  /*
   * Existing offline framebuffer/readback convention.
   * Keep orientation correction at the theme coordinate boundary.
   */
  p.y *= uOrientation;

  float narrative = smoothstep(0.0, 1.0, progress);
  float residual = 1.0 - narrative;

  /*
   * ------------------------------------------------------------------------
   * LOCKED CORE TOPOLOGY
   * ------------------------------------------------------------------------
   *
   * Three major pressure regimes:
   * - main right incursion;
   * - lower/right secondary wedge;
   * - central squeeze mass.
   *
   * They are NOT separate objects: they are pressure states within the same
   * substrate.
   */
  float territoryWarp =
    (fbm3(
      p * 0.58 +
      vec2(
        2.1 + uSeed * 0.0013,
        -3.4 - uSeed * 0.0011
      )
    ) - 0.5) * 0.20;

  territoryWarp +=
    (fbm3(
      p * 1.12 +
      vec2(
        -7.7 + uSeed * 0.0007,
        4.6
      )
    ) - 0.5) * 0.06;

  float rightAdvanceA =
    mix(
      1.28,
      -0.08,
      smoothstep(0.04, 0.96, progress)
    );

  float rightAdvanceB =
    mix(
      1.58,
      0.24,
      smoothstep(0.18, 0.86, progress)
    );

  float sdRightMain =
    rightAdvanceA -
    (
      p.x +
      0.18 * p.y +
      0.08 * territoryWarp +
      0.028 * sin(p.y * 6.2 + 0.6)
    );

  float mainIncursion = insideMask(sdRightMain, 0.065);
  float mainFront = frontBand(sdRightMain, 0.090);

  float sdRightLower =
    rightAdvanceB -
    (
      p.x -
      0.24 * p.y +
      0.05 * territoryWarp -
      0.034 * sin(p.y * 5.4 + 1.4)
    );

  float lowerGate =
    1.0 -
    smoothstep(-0.30, 0.42, p.y);

  float lowerIncursion =
    insideMask(sdRightLower, 0.060) *
    lowerGate;

  float lowerFront =
    frontBand(sdRightLower, 0.084) *
    lowerGate;

  vec2 squeezeCenter =
    vec2(
      -0.08 + 0.04 * sin(uSeed * 0.11),
      0.03
    );

  vec2 squeezeRadius =
    mix(
      vec2(0.09, 0.14),
      vec2(0.34, 0.42),
      smoothstep(0.10, 0.90, progress)
    );

  float sdCenterSqueeze =
    superellipseSdf(
      p - squeezeCenter,
      squeezeRadius,
      1.42
    );

  float centerActivity =
    smoothstep(0.08, 0.92, progress);

  float centerSqueeze =
    insideMask(sdCenterSqueeze, 0.075) *
    centerActivity;

  float centerFront =
    frontBand(sdCenterSqueeze, 0.110) *
    centerActivity;

  float territoryPresence =
    max(
      mainIncursion,
      max(lowerIncursion, centerSqueeze)
    );

  float baseMask =
    saturate(1.0 - territoryPresence);

  float overlap =
    max(
      min(mainIncursion, lowerIncursion),
      max(
        min(mainIncursion, centerSqueeze),
        min(lowerIncursion, centerSqueeze)
      )
    );

  float membrane =
    max(
      max(mainFront, lowerFront),
      centerFront
    );

  membrane = max(membrane, overlap);

  float sumMasks =
    baseMask +
    mainIncursion +
    lowerIncursion +
    centerSqueeze +
    0.0001;

  float wBase = baseMask / sumMasks;
  float wMain = mainIncursion / sumMasks;
  float wLower = lowerIncursion / sumMasks;
  float wCenter = centerSqueeze / sumMasks;

  /*
   * Local pressure displacement only.
   * This bends the fabric near territories without moving the whole world.
   */
  vec2 radial =
    normalize(
      p - squeezeCenter + vec2(0.0001, 0.0)
    );

  vec2 pressureOffset = vec2(0.0);

  pressureOffset +=
    vec2(-0.10, 0.01) *
    mainIncursion;

  pressureOffset +=
    vec2(-0.07, -0.035) *
    lowerIncursion;

  pressureOffset +=
    radial *
    (0.10 * centerSqueeze);

  vec2 pp =
    p +
    0.28 * pressureOffset;

  /*
   * ------------------------------------------------------------------------
   * LOCKED BASE FABRIC
   * ------------------------------------------------------------------------
   *
   * Shared oblique substrate. All territories are states of this one field.
   */
  vec2 direction =
    normalize(
      vec2(0.862, 0.507)
    );

  vec2 normal =
    vec2(
      -direction.y,
      direction.x
    );

  float along =
    dot(pp, direction);

  float across =
    dot(pp, normal);

  float staticWarp =
    (
      fbm3(
        pp * 0.74 +
        vec2(
          uSeed * 0.0013,
          -uSeed * 0.0019
        )
      ) -
      0.5
    ) *
    0.148;

  staticWarp +=
    (
      fbm3(
        pp * 2.52 +
        vec2(
          18.3 + uSeed * 0.0007,
          -9.1
        )
      ) -
      0.5
    ) *
    0.038;

  /*
   * uTime owns microscopic material creep only.
   */
  float materialCreep =
    0.012 *
    sin(
      uTime * 0.31 +
      along * 3.7 +
      fbm3(pp * 1.35) * 5.4
    );

  materialCreep +=
    0.006 *
    sin(
      uTime * 0.17 -
      along * 7.1 +
      across * 1.9
    );

  /*
   * Phase disagreement collapses over the track.
   * Territories begin with different phase offsets but converge.
   */
  float phaseOffset =
    residual *
    (
      1.10 * wMain -
      0.84 * wLower +
      0.58 * wCenter
    );

  float localCompression =
    1.0 +
    0.12 * wMain +
    0.20 * wLower +
    0.30 * wCenter +
    0.16 * membrane +
    0.12 * bass * territoryPresence;

  float phase =
    (
      across +
      staticWarp +
      materialCreep
    ) *
    (39.0 * localCompression);

  phase += phaseOffset;
  phase += 0.45 * membrane * sign(across + 0.001);

  float stripeDistance =
    abs(
      fract(phase) -
      0.5
    );

  float stripeWidth =
    0.096 +
    0.018 * bass;

  float core =
    stripeAA(
      stripeDistance,
      stripeWidth
    );

  float shoulder =
    stripeAA(
      stripeDistance,
      0.226 + 0.020 * bass
    );

  float pressureBand =
    max(
      0.0,
      shoulder - core
    );

  float finePhase =
    phase *
    (2.08 + 0.16 * wCenter) +
    0.24 *
    sin(
      along * 14.0 +
      uTime * 0.21
    );

  float fineDistance =
    abs(
      fract(finePhase) -
      0.5
    );

  float fine =
    stripeAA(
      fineDistance,
      0.052
    );

  /*
   * ------------------------------------------------------------------------
   * REACTIVE URGENCY LAYER — OPTICS ONLY
   * ------------------------------------------------------------------------
   *
   * Kick response is intentionally separated from world geometry.
   *
   * - bass triggers external stage illumination across the field;
   * - lighting direction changes autonomously without moving the world;
   * - occasional rapid strobe passages invert the finished palette into UV;
   * - existing membranes receive a local corona pulse;
   * - sparse seam ejecta provide short-lived high-frequency violence.
   */

  /*
   * FOUR-TO-THE-FLOOR KICK DRIVE
   *
   * Two cues are combined:
   *
   * - absolute low-frequency strength;
   * - low-frequency prominence above the current RMS floor.
   *
   * The sub-unity exponent deliberately expands moderate kick values so the
   * lighting response is visible rather than waiting for extreme peaks.
   */
  float bassHit =
    smoothstep(
      0.08,
      0.48,
      bass
    );

  float kickContrast =
    max(
      0.0,
      bass -
      0.28 * rms -
      0.004
    );

  float contrastHit =
    smoothstep(
      0.004,
      0.095,
      kickContrast
    );

  float kickDrive =
    max(
      0.70 * bassHit,
      contrastHit
    );

  kickDrive =
    pow(
      saturate(kickDrive),
      0.68
    );

  float kickAfterglow =
    smoothstep(
      0.07,
      0.58,
      rms
    );

  /*
   * ROCK-SHOW STAGE LIGHTING
   *
   * The kick now changes illumination of the existing world instead of
   * sending another moving pattern through its fabric.
   *
   * uTime slowly changes where the virtual lighting rig is biased.
   * Bass decides when the rig actually fires.
   */

  float rigMotion =
    0.5 +
    0.5 *
    sin(
      uTime * 0.23 +
      uSeed * 0.013
    );

  float leftWash =
    1.0 -
    smoothstep(
      -0.12,
      1.18,
      p.x +
      0.20 * p.y
    );

  float rightWash =
    smoothstep(
      -1.18,
      0.12,
      p.x -
      0.16 * p.y
    );

  float topWash =
    1.0 -
    smoothstep(
      -0.18,
      1.04,
      -p.y +
      0.10 * abs(p.x)
    );

  float lateralWash =
    mix(
      leftWash,
      rightWash,
      smoothstep(
        0.18,
        0.82,
        rigMotion
      )
    );

  /*
   * Deliberately broad. This must read as a light illuminating the stage,
   * not as another stripe, ripple, wave or travelling surface feature.
   */
  float stageWash =
    saturate(
      0.78 +
      0.14 * lateralWash +
      0.08 * topWash
    );

  /*
   * Autonomous lighting-program state.
   *
   * Most of the time the kick produces a saturated red stage hit.
   * Occasionally a deterministic time block enables hard white strobing.
   * Even then, the strobe fires only when the audio supplies a kick.
   */
  float lightingBlock =
    floor(
      uTime * 0.38 +
      uSeed * 0.017
    );

  float lightingChoice =
    hash11(
      lightingBlock * 19.73 +
      uSeed * 0.031
    );

  float stageHit =
    kickDrive *
    (
      0.90 +
      0.10 * kickAfterglow
    );

  /*
   * SEQUENCED STROBE BURSTS
   *
   * The previous 12 Hz carrier had only a ~17.5 ms ON window. At adaptive
   * frame rates that could alias into isolated flashes because entire pulses
   * could occur between rendered frames.
   *
   * This is instead an explicit burst sequencer:
   *
   * - a four-second deterministic lighting block;
   * - selected blocks launch a 0.78-second burst;
   * - each burst contains a 16 Hz ON/OFF carrier;
   * - the ON portion lasts ~29 ms and the OFF portion ~34 ms.
   *
   * At 60 FPS this normally resolves as roughly two bright frames followed
   * by two normal frames. At 30 FPS it approaches hard frame-by-frame
   * alternation. Both read as a coherent rapid strobe sequence rather than
   * occasional isolated flashes.
   */

  float strobeClock =
    uTime +
    uSeed * 0.137;

  float strobeBlock =
    floor(
      strobeClock / 4.0
    );

  float strobeWithin =
    strobeClock -
    strobeBlock * 4.0;

  float strobeChoice =
    hash11(
      strobeBlock * 31.17 +
      uSeed * 0.047
    );

  /*
   * Roughly one third of four-second blocks contain a burst.
   */
  float burstPermission =
    step(
      0.68,
      strobeChoice
    );

  /*
   * Hard 780 ms burst envelope: approximately 12–13 flashes.
   */
  float burstEnvelope =
    1.0 -
    step(
      0.78,
      strobeWithin
    );

  /*
   * 16 Hz square-wave carrier with a 46% ON duty cycle.
   */
  float strobePhase =
    fract(
      strobeWithin * 16.0
    );

  float strobeCarrier =
    1.0 -
    step(
      0.46,
      strobePhase
    );

  float rapidStrobe =
    burstPermission *
    burstEnvelope *
    strobeCarrier;

  /*
   * Wider pressure-front halo used only for transient illumination.
   * The actual membrane / territorial geometry above remains untouched.
   */
  float mainHalo =
    frontBand(
      sdRightMain,
      0.205
    );

  float lowerHalo =
    frontBand(
      sdRightLower,
      0.190
    ) *
    lowerGate;

  float centerHalo =
    frontBand(
      sdCenterSqueeze,
      0.225
    ) *
    centerActivity;

  float membraneHalo =
    max(
      mainHalo,
      max(
        lowerHalo,
        centerHalo
      )
    );

  /*
   * Kick corona:
   * sharp at the existing membrane, broader and slower in the halo.
   */
  float membranePulse =
    membrane *
    (
      0.12 +
      0.88 * kickDrive
    );

  membranePulse +=
    membraneHalo *
    (
      0.035 +
      0.16 * kickAfterglow
    );

  /*
   * Sparse analytic seam ejecta.
   *
   * There is deliberately no general particle atmosphere. Tiny fragments
   * exist only in the pressure-front halo and travel only within a small
   * local screen-space cell before dying.
   */
  vec2 sparkGrid =
    pp *
    vec2(
      82.0,
      58.0
    );

  vec2 sparkId =
    floor(sparkGrid);

  vec2 sparkUv =
    fract(sparkGrid) -
    0.5;

  float sparkSeed =
    hash21(
      sparkId +
      vec2(
        floor(uSeed * 0.071),
        13.7
      )
    );

  float sparkLife =
    fract(
      uTime * 2.35 +
      sparkSeed * 7.17
    );

  vec2 sparkVelocity =
    vec2(
      -0.18,
      0.23
    ) *
    (
      sparkLife -
      0.18
    );

  float sparkDistance =
    length(
      sparkUv -
      sparkVelocity
    );

  float sparkDot =
    1.0 -
    smoothstep(
      0.028,
      0.105,
      sparkDistance
    );

  float sparkGate =
    smoothstep(
      0.965,
      0.997,
      sparkSeed
    );

  float sparkEnvelope =
    1.0 -
    smoothstep(
      0.40,
      1.0,
      sparkLife
    );

  float seamEjecta =
    sparkDot *
    sparkGate *
    sparkEnvelope *
    membraneHalo *
    treble *
    (
      0.18 +
      0.82 * kickDrive
    );

  /*
   * Material wear / abrasion.
   */
  float abrasion =
    fbm3(
      vec2(
        along * 13.2,
        across * 4.8
      ) +
      vec2(
        uTime * 0.018,
        -uTime * 0.011
      )
    );

  abrasion =
    smoothstep(0.24, 0.86, abrasion);

  float grain =
    hash21(
      floor(
        gl_FragCoord.xy * 0.72 +
        vec2(
          floor(uTime * 2.0),
          floor(uSeed * 0.01)
        )
      )
    );

  float grainCut =
    mix(0.92, 1.04, grain);

  /*
   * AUDIO RESPONSIBILITIES
   *
   * bass:
   *   compression / darkening plus external stage-light triggering.
   *
   * rms:
   *   persistent thermal body.
   *
   * mid:
   *   membrane stress between pressure regimes.
   *
   * treble:
   *   fine seam chatter and corona.
   *
   * centroid:
   *   hotter / paler seam temperature.
   *
   * energy:
   *   restrained final density / contrast lift only.
   */
  vec3 black =
    vec3(0.0024, 0.0029, 0.0032);

  vec3 graphite =
    vec3(0.050, 0.054, 0.058);

  vec3 iron =
    vec3(0.255, 0.017, 0.010);

  vec3 rust =
    vec3(0.352, 0.050, 0.018);

  vec3 ember =
    vec3(0.82, 0.050, 0.020);

  vec3 hostileWhite =
    vec3(1.00, 0.86, 0.76);

  vec3 hot =
    mix(
      ember,
      hostileWhite,
      smoothstep(0.32, 0.92, spectralCentroid)
    );

  float territoryDensity =
    saturate(
      0.55 * mainIncursion +
      0.72 * lowerIncursion +
      0.90 * centerSqueeze
    );

  vec3 territoryTone =
    graphite *
    (
      0.82 * wBase +
      0.58 * wMain +
      0.44 * wLower +
      0.30 * wCenter
    );

  territoryTone +=
    iron *
    (
      0.10 * wBase +
      0.28 * wMain +
      0.40 * wLower +
      0.48 * wCenter
    );

  territoryTone +=
    rust *
    (
      0.00 * wBase +
      0.06 * wMain +
      0.12 * wLower +
      0.08 * wCenter
    );

  vec3 col = black;

  /*
   * Shared dense substrate.
   */
  col +=
    territoryTone *
    pressureBand *
    (
      0.33 +
      0.26 * territoryDensity +
      0.28 * bass
    );

  col +=
    territoryTone *
    core *
    (
      0.30 +
      0.25 * (1.0 - residual)
    );

  /*
   * Persistent body heat.
   */
  col +=
    iron *
    core *
    (
      0.16 +
      0.54 * rms +
      0.12 * wLower +
      0.10 * wCenter
    );

  /*
   * ------------------------------------------------------------------------
   * QUIET-STATE GRAZING STRESS
   * ------------------------------------------------------------------------
   *
   * Presentation only: a slow inspection light reveals relief already encoded
   * by the locked stripe field. No coordinates move, no new procedural field
   * is created, and audio does not participate.
   *
   * Early chapters retain rough, locally broken catches. As PHASE-LOCK
   * advances, abrasion contributes less local variance, so neighbouring ridge
   * highlights read as increasingly regimented without a large brightness lift.
   */
  vec2 phaseGradient =
    vec2(
      dFdx(phase),
      dFdy(phase)
    );

  vec2 ridgeNormal =
    phaseGradient /
    max(
      length(phaseGradient),
      0.00001
    );

  float grazingAngle =
    -0.62 +
    0.46 *
    sin(
      uTime * 0.083 +
      uSeed * 0.009
    ) +
    0.12 *
    sin(
      uTime * 0.031 -
      1.4
    );

  vec2 grazingLight =
    vec2(
      cos(grazingAngle),
      sin(grazingAngle)
    );

  float grazingFacing =
    pow(
      saturate(
        abs(
          dot(
            ridgeNormal,
            grazingLight
          )
        )
      ),
      5.5
    );

  float opticalCoherence =
    smoothstep(
      0.10,
      0.92,
      narrative
    );

  float roughReflectance =
    mix(
      0.48 + 0.52 * abrasion,
      0.70 + 0.08 * abrasion,
      opticalCoherence
    );

  float ridgeCatch =
    saturate(
      0.78 * pressureBand +
      0.16 * fine * shoulder +
      0.10 * membrane
    );

  float grazingCatch =
    ridgeCatch *
    (
      0.16 +
      0.84 * grazingFacing
    ) *
    roughReflectance *
    (
      0.88 +
      0.12 * territoryDensity
    );

  vec3 grazingMetal =
    mix(
      vec3(0.105, 0.115, 0.124),
      vec3(0.310, 0.330, 0.345),
      0.30 +
      0.18 * opticalCoherence
    );

  col +=
    grazingMetal *
    grazingCatch *
    (
      0.105 +
      0.025 * territoryDensity
    );

  /*
   * Membranes replace simple outlines.
   */
  float membraneHeat =
    membrane *
    (
      0.18 +
      0.62 * mid +
      0.14 * rms
    );

  col +=
    mix(
      rust,
      hot,
      0.24 + 0.56 * spectralCentroid
    ) *
    membraneHeat *
    (
      0.56 +
      0.34 * overlap +
      0.18 * wCenter
    );

  /*
   * Fine seam chatter.
   */
  float chatter =
    fine *
    (
      0.03 +
      0.20 * treble
    );

  col +=
    hot *
    chatter *
    (
      0.22 +
      0.54 * membrane
    );

  /*
   * External red stage-light hit.
   *
   * The illumination is broad, but the existing material determines how
   * much light it catches. No geometry changes on the beat.
   */
  float stageReflectance =
    0.025 +
    0.42 * core +
    0.20 * pressureBand +
    0.18 * territoryDensity +
    0.20 * membraneHalo;

  vec3 stageRed =
    mix(
      vec3(0.46, 0.010, 0.006),
      vec3(0.96, 0.075, 0.026),
      0.30 +
      0.44 * spectralCentroid
    );

  col +=
    stageRed *
    stageWash *
    stageHit *
    stageReflectance *
    0.22;

  /*
   * Occasional rock-show white strobe.
   *
   * This is materially reflected rather than simply replacing the entire
   * framebuffer with white, so the underlying world stays visible.
   */
  float strobeReflectance =
    0.075 +
    0.26 * core +
    0.16 * pressureBand +
    0.22 * membraneHalo;

  /*
   * Strobe has no pre-tonemap colour injection.
   *
   * Its entire chromatic event is the post-tonemap inversion below.
   */

  /*
   * Existing rupture/front membranes flash locally on the kick.
   */
  col +=
    hot *
    membranePulse *
    (
      0.055 +
      0.22 * mid +
      0.30 * kickDrive
    ) *
    (
      0.62 +
      0.38 * spectralCentroid
    );

  /*
   * Very sparse high-frequency ejecta around active seams only.
   */
  col +=
    hot *
    seamEjecta *
    (
      0.48 +
      0.52 * spectralCentroid
    );

  /*
   * Bass increases local black pressure rather than moving the world.
   */
  col *=
    1.0 -
    0.13 *
    bass *
    pressureBand *
    (0.35 + 0.65 * territoryPresence);

  /*
   * Late chapters become more disciplined and oppressive.
   */
  float lateDiscipline =
    smoothstep(0.60, 0.96, progress);

  col *=
    1.0 -
    0.08 *
    lateDiscipline *
    (1.0 - core) *
    (1.0 - 0.30 * membrane);

  /*
   * Material wear modulates reflectance only.
   */
  col *=
    mix(0.72, 1.06, abrasion);

  col *= grainCut;

  /*
   * Restrained global energy lift only.
   */
  col *=
    0.985 +
    0.035 * energy;

  /*
   * Global concert-light exposure response.
   *
   * The ordinary kick is now consciously visible across the whole stage.
   * A strobe-enabled kick receives a harder exposure hit, but highlight
   * compression below preserves the image rather than blanking the frame.
   */
  col *=
    1.0 +
    0.045 * stageHit;

  /*
   * Heavy negative-space vignette.
   */
  float radius =
    length(
      p *
      vec2(0.88, 1.04)
    );

  float vignette =
    1.0 -
    smoothstep(0.48, 1.24, radius);

  col *=
    0.70 +
    0.30 * vignette;

  /*
   * Highlight compression without neon.
   */
  col =
    1.0 -
    exp(-col * 1.18);

  /*
   * ------------------------------------------------------------------------
   * POST-TONEMAP ROCK-SHOW LIGHTING
   * ------------------------------------------------------------------------
   */

  /*
   * ------------------------------------------------------------------------
   * NARRATIVE RED OCCUPATION
   * ------------------------------------------------------------------------
   *
   * The black -> red substrate transition belongs exclusively to
   * trackProgress01.
   *
   * Early:
   *   black substrate, vivid red fabric.
   *
   * Middle:
   *   red enters principally through the established pressure territories.
   *
   * Late:
   *   the occupation escapes those territories and contaminates the
   *   remaining black field.
   *
   * No audio feature participates in redOccupation.
   */

  float redNarrative =
    smoothstep(
      0.06,
      0.90,
      progress
    );

  float territorialRed =
    saturate(
      0.70 * territoryPresence +
      0.18 * mainIncursion +
      0.12 * centerSqueeze
    );

  float lateRedFlood =
    smoothstep(
      0.60,
      0.98,
      progress
    );

  float redOccupation =
    saturate(
      redNarrative *
      (
        0.08 +
        0.76 * territorialRed
      ) +
      0.84 * lateRedFlood
    );

  /*
   * Occupation targets the dark substrate rather than repainting the
   * already-luminous stripe structure.
   */
  float substrateDarkness =
    1.0 -
    saturate(
      max(
        col.r,
        max(
          col.g,
          col.b
        )
      ) *
      2.8
    );

  vec3 occupiedRed =
    vec3(
      0.205,
      0.0045,
      0.0025
    );

  col +=
    occupiedRed *
    redOccupation *
    substrateDarkness;

  /*
   * ------------------------------------------------------------------------
   * KICK STAGE LIGHT
   * ------------------------------------------------------------------------
   *
   * The kick now increases illumination of existing material rather than
   * replacing black substrate with a red colour field.
   */

  vec3 kickStageColour =
    mix(
      vec3(
        0.50,
        0.008,
        0.004
      ),
      vec3(
        1.0,
        0.145,
        0.045
      ),
      0.22 +
      0.56 * lightingChoice
    );

  float postKickLight =
    saturate(
      0.62 *
      stageHit *
      stageWash
    );

  float kickCatch =
    saturate(
      0.055 +
      0.54 * core +
      0.22 * pressureBand +
      0.22 * membraneHalo +
      0.12 * territoryDensity
    );

  col =
    clamp(
      col *
      (
        1.0 +
        0.42 * postKickLight
      ) +
      kickStageColour *
      (
        0.18 *
        postKickLight *
        kickCatch
      ),
      0.0,
      1.0
    );

  /*
   * ------------------------------------------------------------------------
   * HARD RAPID UV-INVERSION STROBE
   * ------------------------------------------------------------------------
   *
   * Timing is unchanged.
   *
   * Each ON frame becomes a high-energy photographic negative whose cyan
   * inversion is pushed toward fluorescent blue / ultraviolet. The reds
   * therefore become electric cyan-violet instead of simply disappearing
   * beneath a white flash.
   */

  float hardStrobe =
    saturate(
      0.98 *
      rapidStrobe
    );

  vec3 invertedFrame =
    1.0 -
    clamp(
      col,
      0.0,
      1.0
    );

  vec3 uvStrobeFrame =
    invertedFrame *
    vec3(
      0.56,
      0.90,
      1.18
    );

  /*
   * Preserve a violet component wherever the ordinary frame contains
   * concentrated red energy.
   */
  uvStrobeFrame +=
    vec3(
      0.20,
      0.018,
      0.62
    ) *
    saturate(
      col.r * 1.18
    );

  uvStrobeFrame =
    clamp(
      pow(
        max(
          uvStrobeFrame,
          vec3(0.0)
        ),
        vec3(0.78)
      ),
      0.0,
      1.0
    );

  col =
    mix(
      col,
      uvStrobeFrame,
      hardStrobe
    );

  fragColor =
    vec4(
      clamp(col, 0.0, 1.0),
      1.0
    );
}
`;

export function createLockstepTheme(): Theme {
  return createSinglePassTheme({
    name: "lockstep",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uTrackProgress",
        getValue: (opts) => opts.trackProgress01 ?? 0,
      },
      {
        name: "uRms",
        getValue: (opts) => opts.audio.rms ?? opts.audio.energy,
      },
      {
        name: "uBass",
        getValue: (opts) => opts.audio.bass ?? opts.audio.energy,
      },
      {
        name: "uMid",
        getValue: (opts) => opts.audio.mid ?? opts.audio.energy,
      },
      {
        name: "uTreble",
        getValue: (opts) => opts.audio.treble ?? opts.audio.energy,
      },
      {
        name: "uCentroid",
        getValue: (opts) => opts.audio.centroid ?? 0.5,
      },
      {
        name: "uSeed",
        getValue: (opts) => opts.seed ?? 0,
      },
      {
        name: "uOrientation",
        getValue: (opts) => (opts.mode === "offline" ? -1 : 1),
      },
    ],
  });
}
