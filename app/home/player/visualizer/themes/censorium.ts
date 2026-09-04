// web/app/home/player/visualizer/themes/censorium.ts
//
// CENSORIUM
//
// Physical world:
//   A bureaucratic printing surface undergoing repeated suppression:
//   dirty paper, carbon-black overprint, platen pressure, registration drift,
//   oxide contamination, fibres, toner, abrasion and damaged substrate.
//
// Long-form verb:
//   OVERPRINT
//
// Temporal ownership:
//   uTime          -> press-pressure traversal / local wet-ink sheen
//   audio          -> local compression, saturation, register excitation,
//                     fibres and particulate
//   uTrackProgress -> deterministic accumulation of successive print passes
//
// Audio ownership:
//   bass      -> platen compression / deep carbon density
//   rms       -> persistent wet-ink saturation
//   mid       -> registration contamination / press witness activity
//   treble    -> fibres, toner particulate and torn ink edges
//   centroid  -> contamination temperature
//   energy    -> restrained final contrast overdrive
//
// No readable language is generated. The latent marks beneath suppression are
// deliberately non-semantic print fragments.
//
// Geometry/material status:
//   FIRST PHYSICAL BUILD — NOT LOCKED YET.

import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

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
uniform float uViewYSign;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(
    vec3(p.xyx) * 0.1031
  );

  p3 += dot(
    p3,
    p3.yzx + 33.33
  );

  return fract(
    (p3.x + p3.y) * p3.z
  );
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  vec2 u =
    f * f * (3.0 - 2.0 * f);

  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));

  return mix(
    mix(a, b, u.x),
    mix(c, d, u.x),
    u.y
  );
}

float fbm3(vec2 p) {
  float value = 0.0;
  float amplitude = 0.56;

  for (int i = 0; i < 3; i++) {
    value +=
      amplitude
      * valueNoise(p);

    p =
      mat2(
        1.61,
        -1.17,
        1.17,
        1.61
      )
      * p
      + vec2(7.1, 3.7);

    amplitude *= 0.48;
  }

  return value;
}

mat2 rot2(float angle) {
  float c = cos(angle);
  float s = sin(angle);

  return mat2(
    c,
    -s,
    s,
    c
  );
}

float sdBox(
  vec2 p,
  vec2 halfSize
) {
  vec2 q =
    abs(p)
    - halfSize;

  return length(
    max(q, 0.0)
  )
    + min(
      max(q.x, q.y),
      0.0
    );
}

float sdSegment(
  vec2 p,
  vec2 a,
  vec2 b
) {
  vec2 pa = p - a;
  vec2 ba = b - a;

  float denom = max(
    dot(ba, ba),
    0.000001
  );

  float h = clamp(
    dot(pa, ba) / denom,
    0.0,
    1.0
  );

  return length(
    pa - ba * h
  );
}

float aaFill(float signedDistance) {
  float aa = max(
    fwidth(signedDistance) * 1.25,
    0.00045
  );

  return 1.0 - smoothstep(
    -aa,
    aa,
    signedDistance
  );
}

float aaLine(
  float distanceToLine,
  float halfWidth
) {
  float aa = max(
    fwidth(distanceToLine) * 1.25,
    0.00045
  );

  return 1.0 - smoothstep(
    halfWidth - aa,
    halfWidth + aa,
    distanceToLine
  );
}

float roughRect(
  vec2 p,
  vec2 centre,
  vec2 halfSize,
  float seed,
  float roughness
) {
  vec2 local =
    p - centre;

  float distortion =
    valueNoise(
      local
        * vec2(13.0, 47.0)
      + vec2(
        seed * 17.3,
        seed * 41.7
      )
    )
    - 0.5;

  float distanceToRect =
    sdBox(
      local,
      halfSize
    )
    + distortion
      * roughness;

  return aaFill(
    distanceToRect
  );
}

float crossMark(
  vec2 p,
  vec2 centre,
  float size,
  float width
) {
  vec2 local =
    p - centre;

  float horizontal = aaLine(
    sdSegment(
      local,
      vec2(-size, 0.0),
      vec2(size, 0.0)
    ),
    width
  );

  float vertical = aaLine(
    sdSegment(
      local,
      vec2(0.0, -size),
      vec2(0.0, size)
    ),
    width
  );

  return max(
    horizontal,
    vertical
  );
}

void main() {
  float minRes = max(
    1.0,
    min(uRes.x, uRes.y)
  );

  vec2 screen =
    (vUv * uRes - 0.5 * uRes)
    / minRes;

  screen.y *= uViewYSign;

  float energy = saturate(
    uEnergy
  );

  float rms = saturate(
    uRms
  );

  float bass = saturate(
    uBass
  );

  float mid = saturate(
    uMid
  );

  float treble = saturate(
    uTreble
  );

  float spectralCentroid = saturate(
    uCentroid
  );

  float progress = saturate(
    uTrackProgress
  );

  // Long-form verb: OVERPRINT.
  //
  // Three deterministic generations of suppression accumulate across the
  // recording. The paper itself remains the same physical object.
  float passOne = smoothstep(
    0.015,
    0.14,
    progress
  );

  float passTwo = smoothstep(
    0.25,
    0.56,
    progress
  );

  float passThree = smoothstep(
    0.56,
    0.87,
    progress
  );

  float crush = smoothstep(
    0.72,
    0.97,
    progress
  );

  // -------------------------------------------------------------------
  // PHYSICAL PAPER WEB
  // -------------------------------------------------------------------

  vec2 paperQ =
    rot2(-0.032)
    * screen;

  // Fixed press deformation. It is not audio-driven.
  paperQ.x +=
    0.030
    * paperQ.y
    * paperQ.y;

  float edgeDistortion =
    (
      valueNoise(
        paperQ
          * vec2(11.0, 39.0)
        + vec2(71.0, 18.0)
      )
      - 0.5
    )
    * 0.0065;

  float sheetDistance =
    sdBox(
      paperQ,
      vec2(
        0.705,
        0.565
      )
    )
    + edgeDistortion;

  float sheet = aaFill(
    sheetDistance
  );

  // Dark press bed outside the web.
  float bedNoise =
    fbm3(
      screen * 5.4
      + vec2(19.0, 27.0)
    );

  vec3 col = mix(
    vec3(
      0.006,
      0.007,
      0.008
    ),
    vec3(
      0.018,
      0.017,
      0.015
    ),
    bedNoise
  );

  // Paper fibres combine anisotropic and coarse fields.
  float paperCoarse =
    fbm3(
      paperQ * 6.8
      + vec2(5.2, 31.7)
    );

  float paperFine =
    valueNoise(
      vec2(
        paperQ.x * 30.0,
        paperQ.y * 185.0
      )
      + vec2(81.4, 12.2)
    );

  float paperSpeck =
    valueNoise(
      paperQ * 96.0
      + vec2(17.0, 57.0)
    );

  vec3 paperDark = vec3(
    0.355,
    0.325,
    0.270
  );

  vec3 paperLight = vec3(
    0.585,
    0.535,
    0.445
  );

  vec3 paperColour = mix(
    paperDark,
    paperLight,
    0.30
      + 0.46 * paperCoarse
      + 0.15 * paperFine
  );

  paperColour *=
    0.93
    + 0.09 * paperSpeck;

  col = mix(
    col,
    paperColour,
    sheet
  );

  // Soft physical contact shadow around the paper edge.
  float sheetEdge = aaLine(
    abs(sheetDistance),
    0.008
  );

  col *=
    1.0
    - sheetEdge * 0.11;

  // Press rails remain outside the sheet and help sell physical scale.
  float leftRail = aaLine(
    abs(
      paperQ.x + 0.735
    ),
    0.014
  );

  float rightRail = aaLine(
    abs(
      paperQ.x - 0.735
    ),
    0.014
  );

  float rails =
    max(
      leftRail,
      rightRail
    )
    * (
      1.0 - sheet
    );

  col = mix(
    col,
    vec3(
      0.040,
      0.037,
      0.032
    ),
    rails * 0.94
  );

  // -------------------------------------------------------------------
  // LATENT NON-SEMANTIC PRINT
  //
  // These short grey fragments imply bureaucratic printing without creating
  // readable words or actual typography.
  // -------------------------------------------------------------------

  float rowCoord =
    (
      paperQ.y
      + 0.505
    )
    * 26.0;

  float rowId =
    floor(rowCoord);

  float rowDistance =
    abs(
      fract(rowCoord)
      - 0.5
    );

  float rowStroke =
    1.0
    - smoothstep(
      0.055,
      0.105,
      rowDistance
    );

  float fragmentCoord =
    (
      paperQ.x
      + 0.64
    )
    * 18.0;

  float fragmentId =
    floor(fragmentCoord);

  float fragmentLocal =
    fract(fragmentCoord);

  float fragmentSeed =
    hash12(
      vec2(
        fragmentId,
        rowId
      )
    );

  float fragmentWidth = mix(
    0.25,
    0.82,
    hash12(
      vec2(
        fragmentId + 19.0,
        rowId - 7.0
      )
    )
  );

  float fragmentGate =
    step(
      0.27,
      fragmentSeed
    )
    * (
      1.0
      - smoothstep(
        fragmentWidth,
        fragmentWidth + 0.08,
        fragmentLocal
      )
    );

  float latentPrint =
    rowStroke
    * fragmentGate
    * sheet;

  col = mix(
    col,
    vec3(
      0.105,
      0.095,
      0.078
    ),
    latentPrint * 0.54
  );

  // -------------------------------------------------------------------
  // REGISTRATION MARKS
  // -------------------------------------------------------------------

  float registerBase = 0.0;

  registerBase = max(
    registerBase,
    crossMark(
      paperQ,
      vec2(-0.610, 0.470),
      0.035,
      0.0032
    )
  );

  registerBase = max(
    registerBase,
    crossMark(
      paperQ,
      vec2(0.610, 0.470),
      0.035,
      0.0032
    )
  );

  registerBase = max(
    registerBase,
    crossMark(
      paperQ,
      vec2(-0.610, -0.470),
      0.035,
      0.0032
    )
  );

  registerBase = max(
    registerBase,
    crossMark(
      paperQ,
      vec2(0.610, -0.470),
      0.035,
      0.0032
    )
  );

  registerBase *= sheet;

  col = mix(
    col,
    vec3(
      0.075,
      0.065,
      0.053
    ),
    registerBase * 0.76
  );

  vec2 registerDrift =
    vec2(
      0.010,
      -0.007
    )
    * passTwo
    + vec2(
      -0.006,
      0.011
    )
    * passThree;

  float registerError = 0.0;

  registerError = max(
    registerError,
    crossMark(
      paperQ + registerDrift,
      vec2(-0.610, 0.470),
      0.034,
      0.0034
    )
  );

  registerError = max(
    registerError,
    crossMark(
      paperQ + registerDrift,
      vec2(0.610, -0.470),
      0.034,
      0.0034
    )
  );

  registerError *=
    sheet
    * passTwo;

  vec3 oxideColour = mix(
    vec3(
      0.285,
      0.025,
      0.010
    ),
    vec3(
      0.520,
      0.030,
      0.095
    ),
    spectralCentroid
  );

  col +=
    oxideColour
    * registerError
    * (
      0.30
      + 0.22 * mid
    );

  // -------------------------------------------------------------------
  // REDACTION GENERATION ONE
  // -------------------------------------------------------------------

  float inkOne = 0.0;

  inkOne = max(
    inkOne,
    roughRect(
      paperQ,
      vec2(-0.105, 0.305),
      vec2(0.420, 0.028),
      1.1,
      0.010
    )
  );

  inkOne = max(
    inkOne,
    roughRect(
      paperQ,
      vec2(0.155, 0.145),
      vec2(0.315, 0.025),
      2.3,
      0.009
    )
  );

  inkOne = max(
    inkOne,
    roughRect(
      paperQ,
      vec2(-0.255, -0.060),
      vec2(0.265, 0.024),
      3.7,
      0.011
    )
  );

  inkOne = max(
    inkOne,
    roughRect(
      paperQ,
      vec2(0.170, -0.315),
      vec2(0.395, 0.030),
      5.2,
      0.010
    )
  );

  inkOne *=
    sheet
    * passOne;

  float bleedOne = 0.0;

  bleedOne = max(
    bleedOne,
    roughRect(
      paperQ,
      vec2(-0.105, 0.305),
      vec2(0.429, 0.036),
      1.1,
      0.013
    )
  );

  bleedOne = max(
    bleedOne,
    roughRect(
      paperQ,
      vec2(0.155, 0.145),
      vec2(0.324, 0.033),
      2.3,
      0.012
    )
  );

  bleedOne = max(
    bleedOne,
    roughRect(
      paperQ,
      vec2(-0.255, -0.060),
      vec2(0.274, 0.032),
      3.7,
      0.014
    )
  );

  bleedOne = max(
    bleedOne,
    roughRect(
      paperQ,
      vec2(0.170, -0.315),
      vec2(0.404, 0.038),
      5.2,
      0.013
    )
  );

  bleedOne *=
    sheet
    * passOne;

  // -------------------------------------------------------------------
  // REDACTION GENERATION TWO — deliberately misregistered.
  // -------------------------------------------------------------------

  vec2 passTwoQ =
    rot2(0.012)
    * paperQ
    + vec2(
      0.010,
      -0.007
    );

  float inkTwo = 0.0;

  inkTwo = max(
    inkTwo,
    roughRect(
      passTwoQ,
      vec2(-0.125, 0.230),
      vec2(0.510, 0.034),
      11.2,
      0.014
    )
  );

  inkTwo = max(
    inkTwo,
    roughRect(
      passTwoQ,
      vec2(0.115, 0.020),
      vec2(0.470, 0.032),
      13.4,
      0.013
    )
  );

  inkTwo = max(
    inkTwo,
    roughRect(
      passTwoQ,
      vec2(-0.055, -0.195),
      vec2(0.525, 0.035),
      17.1,
      0.015
    )
  );

  inkTwo *=
    sheet
    * passTwo;

  float bleedTwo = 0.0;

  bleedTwo = max(
    bleedTwo,
    roughRect(
      passTwoQ,
      vec2(-0.125, 0.230),
      vec2(0.521, 0.044),
      11.2,
      0.018
    )
  );

  bleedTwo = max(
    bleedTwo,
    roughRect(
      passTwoQ,
      vec2(0.115, 0.020),
      vec2(0.481, 0.042),
      13.4,
      0.017
    )
  );

  bleedTwo = max(
    bleedTwo,
    roughRect(
      passTwoQ,
      vec2(-0.055, -0.195),
      vec2(0.536, 0.045),
      17.1,
      0.019
    )
  );

  bleedTwo *=
    sheet
    * passTwo;

  // Oxide contamination precedes the second black impression slightly.
  vec2 oxideQ =
    passTwoQ
    + vec2(
      0.012,
      -0.006
    );

  float oxideOverprint = 0.0;

  oxideOverprint = max(
    oxideOverprint,
    roughRect(
      oxideQ,
      vec2(-0.125, 0.230),
      vec2(0.514, 0.037),
      11.2,
      0.016
    )
  );

  oxideOverprint = max(
    oxideOverprint,
    roughRect(
      oxideQ,
      vec2(0.115, 0.020),
      vec2(0.474, 0.035),
      13.4,
      0.015
    )
  );

  oxideOverprint = max(
    oxideOverprint,
    roughRect(
      oxideQ,
      vec2(-0.055, -0.195),
      vec2(0.529, 0.038),
      17.1,
      0.017
    )
  );

  oxideOverprint *=
    sheet
    * passTwo;

  col +=
    oxideColour
    * oxideOverprint
    * (
      0.09
      + 0.13 * mid
    );

  // -------------------------------------------------------------------
  // REDACTION GENERATION THREE — late suppression closes the page down.
  // -------------------------------------------------------------------

  vec2 passThreeQ =
    rot2(-0.016)
    * paperQ
    + vec2(
      -0.008,
      0.008
    );

  float inkThree = 0.0;

  inkThree = max(
    inkThree,
    roughRect(
      passThreeQ,
      vec2(0.000, 0.370),
      vec2(0.600, 0.045),
      23.5,
      0.018
    )
  );

  inkThree = max(
    inkThree,
    roughRect(
      passThreeQ,
      vec2(-0.065, 0.085),
      vec2(0.585, 0.043),
      29.2,
      0.019
    )
  );

  inkThree = max(
    inkThree,
    roughRect(
      passThreeQ,
      vec2(0.040, -0.165),
      vec2(0.615, 0.048),
      31.8,
      0.020
    )
  );

  inkThree = max(
    inkThree,
    roughRect(
      passThreeQ,
      vec2(-0.015, -0.405),
      vec2(0.565, 0.043),
      37.6,
      0.018
    )
  );

  inkThree *=
    sheet
    * passThree;

  float bleedThree = 0.0;

  bleedThree = max(
    bleedThree,
    roughRect(
      passThreeQ,
      vec2(0.000, 0.370),
      vec2(0.613, 0.058),
      23.5,
      0.023
    )
  );

  bleedThree = max(
    bleedThree,
    roughRect(
      passThreeQ,
      vec2(-0.065, 0.085),
      vec2(0.598, 0.056),
      29.2,
      0.024
    )
  );

  bleedThree = max(
    bleedThree,
    roughRect(
      passThreeQ,
      vec2(0.040, -0.165),
      vec2(0.628, 0.061),
      31.8,
      0.025
    )
  );

  bleedThree = max(
    bleedThree,
    roughRect(
      passThreeQ,
      vec2(-0.015, -0.405),
      vec2(0.578, 0.056),
      37.6,
      0.023
    )
  );

  bleedThree *=
    sheet
    * passThree;

  // -------------------------------------------------------------------
  // PHYSICAL INK / PRESSURE MATERIAL
  // -------------------------------------------------------------------

  float combinedInk = saturate(
    inkOne
    + inkTwo
    + inkThree
  );

  float combinedBleed = saturate(
    bleedOne
    + bleedTwo
    + bleedThree
  );

  float pressureDent = saturate(
    combinedBleed
    - combinedInk
  );

  // Bass owns compression into the substrate, not geometry.
  col *=
    1.0
    - pressureDent
      * (
        0.11
        + 0.16 * bass
      );

  float inkMottle =
    fbm3(
      paperQ * 13.0
      + vec2(33.0, 4.0)
    );

  float carbonGrain =
    valueNoise(
      paperQ * 120.0
      + vec2(7.7, 92.1)
    );

  vec3 carbonInk = mix(
    vec3(
      0.0025,
      0.0022,
      0.0019
    ),
    vec3(
      0.018,
      0.015,
      0.012
    ),
    0.22
      + 0.46 * inkMottle
      + 0.18 * carbonGrain
  );

  // RMS owns the persistent wet-density of the carbon.
  carbonInk *=
    0.90
    - 0.18 * rms
    - 0.09 * bass;

  col = mix(
    col,
    carbonInk,
    combinedInk * 0.985
  );

  // Ink feathering remains visible at the physical perimeter.
  float feather =
    pressureDent
    * (
      0.55
      + 0.45 * valueNoise(
        paperQ
          * vec2(38.0, 92.0)
        + vec2(14.0, 3.0)
      )
    );

  col = mix(
    col,
    vec3(
      0.028,
      0.020,
      0.014
    ),
    feather
      * (
        0.32
        + 0.12 * bass
      )
  );

  // Wet ink has a local travelling sheen, not a global brightness pulse.
  float wetSheen =
    0.5
    + 0.5
      * sin(
        paperQ.x * 31.0
        - paperQ.y * 8.0
        - uTime * 0.68
        + inkMottle * 5.2
      );

  wetSheen = pow(
    wetSheen,
    7.0
  );

  col +=
    vec3(
      0.075,
      0.062,
      0.048
    )
    * combinedInk
    * wetSheen
    * (
      0.010
      + 0.055 * rms
    );

  // -------------------------------------------------------------------
  // AUTONOMOUS PRESS TRAVERSAL
  // -------------------------------------------------------------------

  float pressPhase = fract(
    uTime * 0.036
  );

  float pressY = mix(
    0.625,
    -0.625,
    pressPhase
  );

  float pressDistance =
    abs(
      paperQ.y
      - pressY
    );

  float platenShadow =
    1.0
    - smoothstep(
      0.030,
      0.105,
      pressDistance
    );

  platenShadow *= sheet;

  col *=
    1.0
    - platenShadow * 0.13;

  float platenWitness =
    1.0
    - smoothstep(
      0.006,
      0.026,
      pressDistance
    );

  platenWitness *=
    sheet
    * (
      0.20
      + 0.80 * mid
    );

  col +=
    oxideColour
    * platenWitness
    * (
      0.010
      + 0.050 * mid
    );

  // -------------------------------------------------------------------
  // LATE ABRASION — attempted suppression begins destroying itself.
  // -------------------------------------------------------------------

  float scratchCell =
    floor(
      (
        paperQ.y + 0.60
      )
      * 31.0
    );

  float scratchSeed =
    hash12(
      vec2(
        scratchCell,
        73.4
      )
    );

  float scratchSlope = mix(
    -0.24,
    0.22,
    scratchSeed
  );

  float scratchOffset =
    (
      scratchSeed - 0.5
    )
    * 0.035;

  float scratchCoordinate = abs(
    fract(
      paperQ.x * 15.0
      + paperQ.y
        * scratchSlope
        * 19.0
      + scratchOffset
    )
    - 0.5
  );

  float abrasionLines =
    1.0
    - smoothstep(
      0.018,
      0.055,
      scratchCoordinate
    );

  float abrasionNoise =
    valueNoise(
      paperQ * 47.0
      + vec2(5.7, 44.2)
    );

  float abrasion =
    abrasionLines
    * smoothstep(
      0.43,
      0.76,
      abrasionNoise
    )
    * combinedInk
    * crush;

  // Scratches expose dirty substrate rather than bright white pixels.
  vec3 exposedFibre = mix(
    vec3(
      0.290,
      0.250,
      0.195
    ),
    vec3(
      0.475,
      0.415,
      0.320
    ),
    paperFine
  );

  col = mix(
    col,
    exposedFibre,
    abrasion
      * (
        0.55
        + 0.20 * treble
      )
  );

  // -------------------------------------------------------------------
  // TONER / FIBRE PARTICULATE — stable positions, audio-reactive visibility.
  // -------------------------------------------------------------------

  vec2 particleGrid =
    paperQ * 118.0;

  vec2 particleCell =
    floor(particleGrid);

  vec2 particleLocal =
    fract(particleGrid)
    - 0.5;

  float particleSeed =
    hash12(
      particleCell
      + vec2(18.2, 93.7)
    );

  vec2 particleOffset = vec2(
    hash12(
      particleCell
      + vec2(11.0, 7.0)
    ),
    hash12(
      particleCell
      + vec2(31.0, 19.0)
    )
  ) - 0.5;

  particleOffset *= 0.58;

  float particleDistance =
    length(
      particleLocal
      - particleOffset
    );

  float particlePoint =
    1.0
    - smoothstep(
      0.035,
      0.100,
      particleDistance
    );

  float tonerParticle =
    particlePoint
    * step(
      0.925,
      particleSeed
    )
    * sheet
    * (
      0.28
      + 0.72 * passTwo
    );

  float fibreParticle =
    particlePoint
    * step(
      0.958,
      hash12(
        particleCell
        + vec2(61.0, 47.0)
      )
    )
    * sheet
    * crush;

  col = mix(
    col,
    vec3(
      0.018,
      0.014,
      0.010
    ),
    tonerParticle
      * (
        0.18
        + 0.35 * treble
      )
  );

  col +=
    vec3(
      0.56,
      0.48,
      0.36
    )
    * fibreParticle
    * (
      0.025
      + 0.080 * treble
    );

  // -------------------------------------------------------------------
  // WHOLE-TRACK PAPER DAMAGE
  //
  // Repeated printing slightly bruises the substrate globally, but progress
  // never moves the paper or its registration frame.
  // -------------------------------------------------------------------

  float bruising =
    fbm3(
      paperQ * 9.0
      + vec2(91.0, 26.0)
    );

  bruising =
    smoothstep(
      0.50,
      0.83,
      bruising
    )
    * sheet
    * (
      passTwo * 0.28
      + passThree * 0.50
    );

  col *=
    1.0
    - bruising * 0.14;

  // Late oxide contamination collects where overprints overlap.
  float overlapPressure = saturate(
    inkOne * inkTwo
    + inkTwo * inkThree
    + inkOne * inkThree
  );

  col +=
    oxideColour
    * overlapPressure
    * crush
    * (
      0.015
      + 0.052 * mid
      + 0.018 * rms
    );

  // Preserve the physical sheet edge and surrounding black press bed.
  float vignette =
    1.0
    - smoothstep(
      0.48,
      1.02,
      length(screen)
    );

  col *=
    0.86
    + 0.14 * vignette;

  // Overall energy gets only a restrained print-density overdrive.
  col *=
    0.985
    + 0.030 * energy;

  // Slightly compress highlights without making paper glow.
  col =
    1.0
    - exp(
      -col * 1.12
    );

  fragColor = vec4(
    clamp(
      col,
      0.0,
      1.0
    ),
    1.0
  );
}
`;

export function createCensoriumTheme(): Theme {
  return createSinglePassTheme({
    name: "censorium",
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
        name: "uViewYSign",
        getValue: (opts) => opts.mode === "offline" ? -1 : 1,
      },
    ],
  });
}
