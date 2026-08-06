// web/app/home/player/visualizer/themes/temporalCrystalCathedral.ts
// Temporal Crystal Cathedral
// Infinite crystalline nave: polar Gothic ribs, stained-glass panels,
// stress fractures, central void, and luminous structures crossing the darkness.

import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uAge;
uniform float uEnergy;

const float PI = 3.14159265359;
const float TAU = 6.28318530718;

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

  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p = mat2(1.58, -1.13, 1.13, 1.58) * p;
    amplitude *= 0.5;
  }

  return value;
}

float ridged(vec2 p) {
  float value = 0.0;
  float amplitude = 0.62;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);
    value += amplitude * n;

    frequency *= 2.06;
    amplitude *= 0.55;
    p = mat2(0.84, -0.54, 0.54, 0.84) * p;
  }

  return value;
}

float lineMask(float value, float width, float feather) {
  return 1.0 - smoothstep(width, width + feather, abs(value));
}

float bandMask(float value, float centre, float width, float feather) {
  return 1.0 - smoothstep(width, width + feather, abs(value - centre));
}

float angularRib(float angleNorm, float count, float width, float feather) {
  float cell = fract(angleNorm * count);
  float distToCentre = abs(cell - 0.5);
  return 1.0 - smoothstep(width, width + feather, distToCentre);
}

float ringMask(float logR, float count, float drift, float width, float feather) {
  float cell = fract(logR * count + drift);
  return lineMask(cell - 0.5, width, feather);
}

vec3 stainedGlass(float x) {
  vec3 blue = vec3(0.08, 0.24, 0.76);
  vec3 violet = vec3(0.42, 0.16, 0.82);
  vec3 rose = vec3(0.88, 0.24, 0.52);
  vec3 gold = vec3(1.00, 0.64, 0.20);
  vec3 cyan = vec3(0.20, 0.86, 0.92);

  vec3 a = mix(blue, violet, smoothstep(0.10, 0.45, x));
  vec3 b = mix(rose, gold, smoothstep(0.45, 0.78, x));
  vec3 c = mix(b, cyan, smoothstep(0.72, 1.0, x));

  return mix(a, c, smoothstep(0.34, 0.88, x));
}

void main() {
  float time = max(uTime, 0.0);
  float age = min(max(uAge, 0.0), 720.0);
  float t = time * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  float ageProgress = 1.0 - exp(-age * 0.0036);
  float cameraAdvance = 0.34 * ageProgress + t * 0.030;

  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p *= 1.0 + 0.76 * ageProgress;

  float r = length(p);
  float angle = atan(p.y, p.x);
  float angleNorm = angle / TAU + 0.5;
  float logR = log(r + 0.085);

  float naveDepth = -logR + cameraAdvance;
  float breath = 1.0 + 0.018 * sin(t * 1.8) + 0.030 * e;

  vec2 chamber = vec2(
    angleNorm * 8.0,
    naveDepth * 2.1
  );

  chamber.x += 0.035 * sin(naveDepth * 2.2 + t * 0.75);
  chamber.y *= breath;

  float ribCount = 10.0 + floor(ageProgress * 5.0);
  float ribs = angularRib(angleNorm + 0.018 * sin(naveDepth + t), ribCount, 0.018, 0.055);
  float secondaryRibs = angularRib(angleNorm + 0.5 / ribCount, ribCount, 0.010, 0.042) * 0.48;

  float rings = ringMask(logR, 4.6 + ageProgress * 1.2, -cameraAdvance * 1.35, 0.030, 0.070);
  float farRings = ringMask(logR, 9.2 + ageProgress * 2.2, -cameraAdvance * 2.1, 0.015, 0.045) * 0.46;

  float archEquation = abs(p.x) * (1.20 + ageProgress * 0.28)
    + pow(max(p.y + 0.28, 0.0), 1.85) * 0.72
    - (0.56 + 0.08 * sin(naveDepth * 2.0 - t * 0.45));
  float lowerArchEquation = abs(p.x) * 1.52
    + pow(max(-p.y + 0.20, 0.0), 1.72) * 0.58
    - (0.50 + 0.05 * cos(naveDepth * 2.6 + t * 0.28));

  float arches = lineMask(archEquation, 0.020, 0.070);
  arches += lineMask(lowerArchEquation, 0.018, 0.060) * 0.54;

  float crystalField = ridged(chamber * vec2(0.72, 1.18) + vec2(t * 0.08, -t * 0.04));
  float glassField = fbm(chamber * vec2(0.42, 0.58) + vec2(-t * 0.025, t * 0.035));

  float seamStructure = max(max(ribs, secondaryRibs), max(rings, farRings));
  seamStructure = max(seamStructure, arches);

  float panels = smoothstep(0.12, 0.72, glassField + crystalField * 0.18);
  panels *= 1.0 - clamp(ribs * 0.72 + rings * 0.54, 0.0, 1.0);
  panels *= 1.0 - smoothstep(1.18, 1.54, r);

  float stressField = ridged(chamber * vec2(1.75, 1.35) + vec2(t * 0.18, -t * 0.22));
  float crackSeed = fbm(chamber * vec2(3.2, 2.8) + vec2(-t * 0.40, t * 0.31));
  float fractureThreshold = mix(1.18, 0.86, e);
  float fractures = smoothstep(fractureThreshold, fractureThreshold + 0.16, stressField + crackSeed * 0.34);
  fractures *= smoothstep(0.10, 0.72, seamStructure + panels * 0.28);

  float centreVoid = 1.0 - smoothstep(0.060, 0.270, r);
  float depthFade = 1.0 - smoothstep(1.08, 1.58, r);

  float centralSpine = lineMask(p.x + 0.025 * sin(naveDepth * 3.0 + t), 0.010, 0.045);
  centralSpine *= 1.0 - smoothstep(0.06, 0.54, abs(p.y));

  float crossingRing = bandMask(r, 0.235 + 0.020 * sin(t * 0.8 + ageProgress * 2.0), 0.012, 0.050);
  crossingRing *= smoothstep(-0.06, 0.24, p.y + 0.12);

  float foregroundCrossing = max(centralSpine, crossingRing);
  foregroundCrossing *= 0.40 + 0.60 * smoothstep(0.18, 0.90, crystalField);

  vec3 dark = vec3(0.006, 0.007, 0.018);
  vec3 deepBlue = vec3(0.025, 0.055, 0.120);
  vec3 ribBlue = vec3(0.25, 0.60, 0.92);
  vec3 white = vec3(0.86, 0.98, 1.00);
  vec3 gold = vec3(1.00, 0.67, 0.26);

  vec3 glass = stainedGlass(glassField);
  vec3 col = dark;

  col += deepBlue * depthFade * 0.30;
  col += glass * panels * (0.14 + 0.22 * ageProgress);
  col += ribBlue * seamStructure * (0.22 + 0.30 * ageProgress);
  col += white * pow(seamStructure, 2.2) * 0.20;
  col += glass * fractures * (0.28 + 0.78 * e);
  col += white * pow(fractures, 1.7) * (0.12 + 0.30 * e);
  col += gold * arches * (0.10 + 0.18 * e);

  col *= 1.0 - centreVoid * 0.95;

  col += white * foregroundCrossing * (0.26 + 0.30 * e);
  col += glass * foregroundCrossing * 0.34;
  col += gold * crossingRing * 0.20;

  float crystallineDust = smoothstep(
    0.982 - 0.020 * e,
    1.0,
    hash(floor((chamber + 8.0) * (42.0 + ageProgress * 18.0)))
  );
  crystallineDust *= depthFade;
  col += vec3(0.44, 0.82, 1.00) * crystallineDust * (0.08 + 0.18 * e);

  float vig = 1.0 - smoothstep(0.58, 1.45, length(p));
  col *= 0.56 + 0.78 * vig;

  col *= 0.88 + 0.26 * e;

  fragColor = vec4(col, 1.0);
}
`;

function getThemeAgeSeconds(startedAtMs: number): number {
  if (typeof performance === "undefined") return 0;
  return (performance.now() - startedAtMs) / 1000;
}

export function createTemporalCrystalCathedralTheme(): Theme {
  const startedAtMs = typeof performance === "undefined" ? 0 : performance.now();

  return createSinglePassTheme({
    name: "temporal-crystal-cathedral",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uAge",
        getValue: () => getThemeAgeSeconds(startedAtMs),
      },
    ],
  });
}