// web/app/home/player/visualizer/themes/mhdSilk.ts
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

// MHD Silk
// Nocturnal plasma cloth whose hidden structure gradually resolves across the
// recording: mysterious night becoming quiet revelation without changing world.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;

  // Curl sampling dominates this shader's cost. Five octaves retain the broad
  // silk structure while dropping the least visible sixth octave everywhere.
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    amplitude *= 0.5;
  }

  return value;
}

float ridged(vec2 p) {
  float value = 0.0;
  float amplitude = 0.6;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);

    value += amplitude * n;

    frequency *= 2.1;
    amplitude *= 0.55;
    p = mat2(0.84, -0.54, 0.54, 0.84) * p;
  }

  return value;
}

// 2D curl noise via the gradient of an FBM potential, rotated 90 degrees.
vec2 curl(vec2 p) {
  float eps = 0.0025;

  float n1 = fbm(p + vec2(0.0, eps));
  float n2 = fbm(p - vec2(0.0, eps));
  float n3 = fbm(p + vec2(eps, 0.0));
  float n4 = fbm(p - vec2(eps, 0.0));

  vec2 gradient = vec2(
    n3 - n4,
    n1 - n2
  ) / (2.0 * eps);

  return vec2(
    gradient.y,
    -gradient.x
  );
}

void main() {
  vec2 p =
    (vUv * uRes - 0.5 * uRes)
    / min(uRes.x, uRes.y);

  float e = smoothstep(
    0.02,
    0.98,
    clamp(uEnergy, 0.0, 1.0)
  );

  float bass = smoothstep(
    0.04,
    0.96,
    clamp(uBass, 0.0, 1.0)
  );

  float mid = smoothstep(
    0.04,
    0.96,
    clamp(uMid, 0.0, 1.0)
  );

  float treble = smoothstep(
    0.06,
    0.94,
    clamp(uTreble, 0.0, 1.0)
  );

  float spectralCentroid = clamp(
    uCentroid,
    0.0,
    1.0
  );

  float trackProgress = clamp(
    uTrackProgress,
    0.0,
    1.0
  );

  // Long-form verb: REVEAL.
  //
  // Nothing dramatic moves toward the viewer. Instead the eye adapts to this
  // nocturnal field: depth, secondary silk and rare luminous colour become
  // progressively legible while the same physical world continues underneath.
  float journey =
    trackProgress
    * trackProgress
    * (3.0 - 2.0 * trackProgress);

  float eyeAdapt =
    0.18
    + 0.82 * smoothstep(
      0.02,
      0.72,
      journey
    );

  float depthReveal = smoothstep(
    0.24,
    0.84,
    journey
  );

  float pearlReveal = smoothstep(
    0.62,
    0.98,
    journey
  );

  // Autonomous structural time. Music illuminates the silk but no longer
  // changes its advection distance or master clock.
  float t = max(uTime, 0.0) * 0.086;

  // Large-scale magnetic drift.
  vec2 q = p * 1.05;

  q += 0.12 * vec2(
    sin(t * 2.1),
    cos(t * 1.7)
  );

  vec2 velocity = curl(
    q * 1.35 + vec2(t)
  );

  // Integrate a few stable curl steps for the cloth-like drift. The small
  // autonomous breathing preserves life without assigning geometry to audio.
  vec2 advected = p;

  float advection =
    0.39
    + 0.025 * sin(t * 0.53);

  for (int i = 0; i < 4; i++) {
    vec2 c = curl(
      advected * 1.25
        + vec2(t, -t * 0.7)
    );

    advected += c * advection * 0.08;
    advection *= 0.82;
  }

  // Broad silk body.
  float bodyField = fbm(
    advected * 1.8
      + vec2(0.0, t * 1.3)
  );

  float body = smoothstep(
    0.22,
    0.92,
    bodyField
  );

  // Stable filamentation stretched along the magnetic field.
  vec2 flowDirection = normalize(
    velocity + vec2(0.0001)
  );

  vec2 stretch = vec2(
    flowDirection.x * 1.6 + 0.2,
    flowDirection.y * 1.6 - 0.2
  );

  float filamentField = ridged(
    advected
      * mat2(
        stretch.x,
        -stretch.y,
        stretch.y,
        stretch.x
      )
      * 2.4
      + vec2(t * 0.5)
  );

  float filament = smoothstep(
    0.35,
    0.95,
    filamentField
  );

  // One existing detail field supplies internal glow variation and later
  // becomes an optical coordinate for the revelation palette.
  float detailField = clamp(
    fbm(advected * 3.2 - vec2(t)),
    0.0,
    1.0
  );

  float glow =
    body
    * (
      0.64
      + 0.36 * detailField
    );

  // Existing high-frequency field-line topology stays fixed. Track progress
  // and treble decide how much of it can be seen, not where it exists.
  float lineField = clamp(
    fbm(
      advected * 6.0
        + vec2(t * 0.8, -t * 0.6)
    ),
    0.0,
    1.0
  );

  float lines = smoothstep(
    0.62,
    0.95,
    lineField
  );

  // A hidden middle-distance layer comes entirely from fields already paid for.
  float hiddenSilk =
    filament
    * smoothstep(
      0.38,
      0.86,
      detailField
    )
    * (
      0.55
      + 0.45 * lineField
    );

  // Perceptible warm shafts: the first version multiplied too many sparse
  // masks together, so the intended sunset/god-ray note was almost always
  // numerically tiny. Use a broad screen-space shaft for composition, then let
  // the existing silk fields texture and interrupt it.
  vec2 rayDirection = normalize(
    vec2(0.82, -0.57)
  );

  float rayAxis = dot(
    p,
    rayDirection
  );

  float rayCentre =
    -0.08
    + 0.18 * sin(t * 0.31);

  float primaryShaft =
    1.0 - smoothstep(
      0.12,
      0.42,
      abs(rayAxis - rayCentre)
    );

  float secondaryShaft =
    1.0 - smoothstep(
      0.10,
      0.30,
      abs(rayAxis - rayCentre - 0.48)
    );

  float shaftShape = clamp(
    primaryShaft
      + secondaryShaft * 0.42,
    0.0,
    1.0
  );

  float rayTexture =
    0.68
    + 0.32 * (
      0.5
      + 0.5 * sin(
        advected.x * 5.2
        - advected.y * 3.8
        + detailField * 2.4
        - t * 0.52
      )
    );

  float rayVisit =
    0.62
    + 0.38 * smoothstep(
      0.22,
      0.82,
      0.5 + 0.5 * sin(
        t * 0.21
        + bodyField * 2.1
        - detailField * 1.2
      )
    );

  float sunsetHaze =
    shaftShape
    * rayTexture
    * rayVisit
    * (
      0.46
      + 0.54 * eyeAdapt
    );

  float godRay =
    sunsetHaze
    * (
      0.54
      + 0.46 * filament
    )
    * (
      0.66
      + 0.34 * smoothstep(
        0.30,
        0.84,
        bodyField
      )
    );

  float rayCore =
    sunsetHaze
    * filament
    * smoothstep(
      0.58,
      0.90,
      lineField
    );

  vec3 voidBlack = vec3(0.003, 0.006, 0.016);
  vec3 midnight = vec3(0.016, 0.026, 0.072);
  vec3 deepIndigo = vec3(0.050, 0.075, 0.180);
  vec3 moonBlue = vec3(0.110, 0.330, 0.440);
  vec3 nightCyan = vec3(0.175, 0.540, 0.590);
  vec3 violet = vec3(0.330, 0.285, 0.600);
  vec3 pearl = vec3(0.790, 0.865, 0.930);
  vec3 moonSilver = vec3(0.900, 0.950, 1.000);
  vec3 faintGold = vec3(0.760, 0.610, 0.390);
  vec3 duskAmber = vec3(0.760, 0.430, 0.210);
  vec3 roseGold = vec3(0.950, 0.760, 0.560);

  float colourBias = clamp(
    0.46
      + (detailField - 0.5) * 0.58
      + (spectralCentroid - 0.5) * 0.20,
    0.0,
    1.0
  );

  vec3 nocturnalColour = mix(
    moonBlue,
    violet,
    colourBias
  );

  nocturnalColour = mix(
    nocturnalColour,
    nightCyan,
    smoothstep(
      0.62,
      0.94,
      bodyField
    ) * 0.26
  );

  vec3 col = voidBlack;

  // The early chapter is intentionally secretive rather than merely dim.
  col += mix(
    midnight,
    deepIndigo,
    detailField
  ) * body * (0.26 + 0.22 * eyeAdapt);

  // Bass reveals the broad cloth body; energy adds only a restrained local lift.
  col += nocturnalColour
    * glow
    * (
      0.10
      + 0.12 * eyeAdapt
      + 0.075 * bass
      + 0.045 * e
    );

  // Mids illuminate already-existing silk strands.
  col += mix(
    nocturnalColour,
    pearl,
    0.14 + 0.18 * depthReveal
  ) * filament
    * (
      0.065
      + 0.10 * eyeAdapt
      + 0.13 * mid
    );

  // Whole-track revelation exposes a quieter secondary layer behind the main
  // cloth. It remains subordinate so the image retains negative space.
  col += mix(
    deepIndigo,
    pearl,
    0.38
  ) * hiddenSilk
    * depthReveal
    * (
      0.020
      + 0.050 * mid
    );

  vec3 sunsetRayColour = mix(
    duskAmber,
    roseGold,
    0.34 + 0.34 * detailField
  );

  // The haze must remain visible even before the main REVEAL has opened.
  // It is deliberately warm and directional so the eye has an immediate visual
  // foothold inside the otherwise very dark opening chapter.
  col += sunsetRayColour
    * sunsetHaze
    * (
      0.050
      + 0.030 * eyeAdapt
      + 0.024 * e
    );

  col += sunsetRayColour
    * godRay
    * (
      0.070
      + 0.070 * mid
      + 0.038 * treble
      + 0.020 * depthReveal
    );

  col += roseGold
    * rayCore
    * (
      0.050
      + 0.040 * mid
      + 0.050 * treble
    );

  col += moonSilver
    * rayCore
    * rayCore
    * (
      0.014
      + 0.025 * treble
    );

  // Treble reveals fine, stable field-line sheen rather than creating detail.
  col += mix(
    pearl,
    moonSilver,
    spectralCentroid
  ) * lines
    * (
      0.012
      + 0.032 * depthReveal
      + 0.065 * treble
    );

  // Quiet revelation: only rare intersections acquire a warmer moonlit pearl
  // near the end of the recording. This should feel discovered, not triumphant.
  float revelationMask =
    hiddenSilk
    * smoothstep(
      0.70,
      0.96,
      detailField
    )
    * smoothstep(
      0.58,
      0.94,
      lineField
    );

  vec3 revelationColour = mix(
    pearl,
    faintGold,
    0.12 + 0.22 * (1.0 - spectralCentroid)
  );

  col += revelationColour
    * revelationMask
    * pearlReveal
    * (
      0.024
      + 0.050 * mid
      + 0.035 * treble
    );

  col += moonSilver
    * revelationMask
    * revelationMask
    * pearlReveal
    * (0.010 + 0.022 * treble);

  float radius = length(p);

  float vignette =
    1.0 - smoothstep(
      0.30,
      1.36,
      radius
    );

  // As the eye adapts, a little more peripheral information becomes readable.
  col *=
    (0.50 + 0.055 * eyeAdapt)
    + 0.70 * vignette;

  // Whole-frame musical pumping is deliberately almost absent.
  col *= 0.98 + 0.04 * e;

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

export function createMHDSilkTheme(): Theme {
  return createSinglePassTheme({
    name: "mhd-silk",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uTrackProgress",
        getValue: (opts) => opts.trackProgress01 ?? 0,
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
    ],
  });
}
