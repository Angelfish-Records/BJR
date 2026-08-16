// web/app/home/player/visualizer/themes/nebula.ts
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

// Nebula
// Layered interstellar gas, obscuring dust lanes and stable stellar fields.
// The expensive structure is deliberately bounded: three four-octave FBM
// evaluations per pixel, with analytical detail doing the remaining work.
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

const float TAU = 6.28318530718;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm4(vec2 p) {
  float value = 0.0;
  float amplitude = 0.52;

  // Rotation suppresses obvious square-grid repetition while simultaneously
  // providing the approximately 2x frequency step required by FBM.
  mat2 octaveTransform = mat2(
    1.62, -1.18,
    1.18,  1.62
  );

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = octaveTransform * p + vec2(0.17, -0.13);
    amplitude *= 0.5;
  }

  return value;
}

vec2 starLayer(
  vec2 p,
  float density,
  float threshold,
  float time
) {
  vec2 scaled = p * density;
  vec2 grid = floor(scaled);
  vec2 cell = fract(scaled) - 0.5;

  float seed = hash12(grid);

  vec2 offset = vec2(
    hash12(grid + vec2(17.17, 41.73)),
    hash12(grid + vec2(67.31, 11.89))
  ) - 0.5;

  offset *= 0.64;

  float radius = mix(0.016, 0.043, seed * seed);
  float distanceToStar = length(cell - offset);
  float aa = fwidth(distanceToStar) * 1.35 + 0.0015;

  float keep = step(threshold, seed);

  float core = 1.0 - smoothstep(
    radius,
    radius + aa,
    distanceToStar
  );

  float halo = 1.0 - smoothstep(
    radius * 2.6,
    radius * 7.0 + aa,
    distanceToStar
  );

  // Very shallow independent scintillation: enough to feel stellar without
  // turning high frequencies in the music into flickering topology.
  float scintillation =
    0.92 + 0.08 * sin(time * 0.82 + seed * TAU);

  return vec2(
    keep * (core + halo * 0.14) * scintillation,
    seed
  );
}

void main() {
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

  float spectralCentroid = clamp(uCentroid, 0.0, 1.0);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);

  // Smooth whole-track dramatic curve. It begins and arrives gently rather
  // than reading as a mechanical constant-speed zoom.
  float journey =
    trackProgress * trackProgress * (3.0 - 2.0 * trackProgress);

  vec2 viewP =
    (vUv - 0.5) *
    vec2(uRes.x / max(uRes.y, 1.0), 1.0);

  // Whole-track narrative camera: begin in a distant overview, then spend the
  // recording entering the broad luminous gas complex around (-0.14, 0.08).
  // Playback progress, never instantaneous audio, owns this movement.
  float cameraScale = mix(1.0, 0.72, journey);

  vec2 cameraPath =
    vec2(-0.13, 0.075) * journey +
    vec2(
      sin(journey * 0.5 * TAU) * 0.036,
      -sin(journey * TAU) * 0.018
    );

  vec2 p = viewP * cameraScale + cameraPath;

  // Structural motion must remain self-consistent and almost geological.
  // Audio should brighten and agitate the gas internally, not shove the
  // underlying field around.
  float t = max(uTime, 0.0) * 0.052;

  vec2 drift = vec2(
    sin(t * 0.71 + 0.4),
    cos(t * 0.57 - 0.7)
  ) * 0.16;

  float flowA = fbm4(
    p * 1.22
      + drift
      + vec2(t * 0.13, -t * 0.08)
  );

  float flowB = fbm4(
    p * 1.22
      + vec2(5.83, -3.71)
      - drift
      + vec2(-t * 0.09, t * 0.11)
  );

  vec2 warp = vec2(
    flowA - 0.5,
    flowB - 0.5
  );

  // Keep the large cloud geometry stable.
  vec2 q = p + warp * 0.46;

  // Gentle structural curl, still time-driven rather than music-driven.
  q += 0.030 * vec2(
    sin(q.y * 3.2 + t * 1.3),
    cos(q.x * 2.7 - t * 1.1)
  );

  float cloud = fbm4(
    q * 2.12
      + vec2(t * 0.055, -t * 0.072)
  );

  float density = smoothstep(
    0.27,
    0.80,
    cloud + flowA * 0.17 - flowB * 0.055
  );

  float outerGas = smoothstep(
    0.30,
    0.78,
    flowA * 0.72 + cloud * 0.36
  );

  // Reuse the same noise field for luminous ionisation fronts.
  float ridge = 1.0 - abs(cloud * 2.0 - 1.0);
  float filaments =
    pow(clamp(ridge, 0.0, 1.0), 4.4)
    * smoothstep(0.10, 0.74, density);

  // Equality contours between the two flow fields become obscuring dust lanes.
  float flowDifference = abs(flowA - flowB);
  float dustLane =
    (1.0 - smoothstep(0.035, 0.19, flowDifference))
    * smoothstep(0.20, 0.82, density);

  // A broad off-centre luminous complex gives the field scale and depth
  // without another noise evaluation.
  vec2 corePosition = p - vec2(
    -0.14 + 0.045 * sin(t * 0.41),
    0.08 + 0.035 * cos(t * 0.37)
  );

  float coreDistance2 = dot(corePosition, corePosition);
  float coreGlow = 1.0 / (1.0 + coreDistance2 * 8.5);
  coreGlow *= smoothstep(
    0.28,
    0.84,
    density + flowA * 0.22
  );

  // Audio-reactive illumination should live inside the gas, not in the
  // global coordinate frame.
  float swirlSheen =
    0.5 + 0.5 * sin(
      q.x * 5.6
      - q.y * 4.2
      + flowA * 5.5
      - flowB * 3.8
      + t * 2.2
    );
  swirlSheen *= density * density;

  // Anchored flare sources: they can bloom with the music without the
  // entire nebula changing position.
  vec2 flarePosA = p - vec2(0.32, -0.18);
  vec2 flarePosB = p - vec2(-0.38, 0.24);

  float flareA = 1.0 / (1.0 + dot(flarePosA, flarePosA) * 42.0);
  float flareB = 1.0 / (1.0 + dot(flarePosB, flarePosB) * 58.0);

  float distantFlares =
    flareA * smoothstep(0.58, 0.98, bass) +
    flareB * smoothstep(0.52, 0.96, mid);

  distantFlares *= smoothstep(
    0.16,
    0.72,
    density + outerGas * 0.5
  );

  // Stable star topology. Treble brightens the existing stars rather than
  // moving a threshold and causing stars to pop in and out.
  vec2 stellarP =
    p
    + warp * 0.070
    + vec2(t * 0.010, -t * 0.006);

  vec2 starsNear = starLayer(
    stellarP + vec2(1.7, -2.4),
    58.0,
    0.976,
    t
  );

  vec2 starsFar = starLayer(
    stellarP * 1.71 + vec2(-7.3, 4.9),
    86.0,
    0.988,
    t * 0.83
  );

  vec3 voidBlack = vec3(0.003, 0.005, 0.015);
  vec3 deepSpace = vec3(0.012, 0.025, 0.075);
  vec3 cobalt = vec3(0.070, 0.185, 0.620);
  vec3 electricBlue = vec3(0.105, 0.610, 1.000);
  vec3 violet = vec3(0.410, 0.105, 0.760);
  vec3 magenta = vec3(0.900, 0.215, 0.650);
  vec3 rose = vec3(1.000, 0.410, 0.580);
  vec3 ember = vec3(1.000, 0.610, 0.310);
  vec3 whiteHot = vec3(0.900, 0.970, 1.000);

  float hueField = clamp(
    0.50
      + (flowB - flowA) * 0.88
      + (spectralCentroid - 0.5) * 0.20,
    0.0,
    1.0
  );

  vec3 coolGas = mix(
    cobalt,
    electricBlue,
    smoothstep(0.18, 0.82, cloud)
  );

  vec3 warmGas = mix(
    violet,
    magenta,
    smoothstep(0.16, 0.84, flowB)
  );

  vec3 gasColour = mix(
    coolGas,
    warmGas,
    smoothstep(0.20, 0.80, hueField)
  );

  float hotPocket = smoothstep(
    0.70,
    0.96,
    flowA * 0.55 + density * 0.65
  );

  gasColour = mix(
    gasColour,
    mix(rose, ember, spectralCentroid * 0.55),
    hotPocket * (0.055 + 0.080 * mid)
  );

  vec3 col = voidBlack;

  // Large low-frequency body.
  col += deepSpace * outerGas * 0.90;
  col += gasColour * density * (0.22 + 0.22 * e);

  // Ionised ridges make the cloud appear internally illuminated.
  col += gasColour * filaments * (0.16 + 0.24 * mid);
  col += whiteHot
    * pow(filaments, 2.1)
    * (0.024 + 0.070 * mid);

  // Internal gas sheen: this is where the music should feel like it is
  // stirring plasma rather than dragging the whole cloud around.
  col += mix(electricBlue, rose, 0.45 + 0.35 * spectralCentroid)
    * swirlSheen
    * (0.035 + 0.060 * bass + 0.075 * mid);

  // Bass strengthens the anchored luminous complex.
  col += mix(electricBlue, magenta, hueField)
    * coreGlow
    * (0.085 + 0.120 * bass);

  col += whiteHot
    * coreGlow
    * coreGlow
    * (0.022 + 0.050 * e);

  // Distant explosive blooms / solar-flare suggestion.
  col += mix(rose, ember, 0.35 + 0.35 * spectralCentroid)
    * distantFlares
    * (0.050 + 0.170 * bass + 0.090 * mid);

  col += whiteHot
    * distantFlares
    * distantFlares
    * (0.018 + 0.070 * bass);

  // Absorbing interstellar material restores blacks and depth.
  col *= 1.0 - dustLane * 0.38;

  vec3 nearStarColour = mix(
    vec3(0.68, 0.80, 1.00),
    whiteHot,
    spectralCentroid
  );

  vec3 farStarColour = mix(
    vec3(1.00, 0.72, 0.52),
    vec3(0.62, 0.78, 1.00),
    spectralCentroid
  );

  float stellarLift = 0.58 + 0.36 * treble + 0.06 * e;

  col += nearStarColour
    * starsNear.x
    * stellarLift;

  col += farStarColour
    * starsFar.x
    * stellarLift
    * 0.58;

  // A few intrinsically brighter stars emerge from the same stable population.
  float brightNear = smoothstep(
    0.992,
    1.0,
    starsNear.y
  );

  col += whiteHot
    * starsNear.x
    * brightNear
    * (0.18 + 0.24 * treble);

  float r = length(viewP);
  float vignette =
    1.0 - smoothstep(0.56, 1.42, r);

  col *= 0.54 + 0.72 * vignette;

  // Keep the whole image stable; musical energy should read locally first.
  col *= 0.97 + 0.06 * e;

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

export function createNebulaTheme(): Theme {
  return createSinglePassTheme({
    name: "nebula",
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
