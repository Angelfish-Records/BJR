// web/app/home/player/visualizer/themes/wormholeThroat.ts
// Wormhole Throat
// Bright annular throat, far-side star field visible through the mouth,
// gravitational lensing on both sides, and energy-driven chromatic turbulence.

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
    p = mat2(1.61, -1.12, 1.12, 1.61) * p;
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

    frequency *= 2.04;
    amplitude *= 0.55;
    p = mat2(0.82, -0.57, 0.57, 0.82) * p;
  }

  return value;
}

float lineMask(float value, float width, float feather) {
  return 1.0 - smoothstep(width, width + feather, abs(value));
}

float ringMask(float r, float radius, float width, float feather) {
  return 1.0 - smoothstep(width, width + feather, abs(r - radius));
}

mat2 rot(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float stars(vec2 p, float density, float threshold) {
  vec2 grid = floor(p * density);
  vec2 cell = fract(p * density) - 0.5;

  float rnd = hash(grid);
  float keep = smoothstep(threshold, 1.0, rnd);

  vec2 offset = vec2(
    hash(grid + 31.7) - 0.5,
    hash(grid + 84.2) - 0.5
  ) * 0.44;

  float size = mix(0.050, 0.013, hash(grid + 11.4));
  float star = 1.0 - smoothstep(size, size + 0.030, length(cell - offset));

  return keep * star;
}

vec3 starColour(float seed) {
  vec3 blue = vec3(0.54, 0.72, 1.00);
  vec3 white = vec3(0.92, 0.98, 1.00);
  vec3 gold = vec3(1.00, 0.72, 0.42);

  vec3 cool = mix(blue, white, smoothstep(0.16, 0.58, seed));
  return mix(cool, gold, smoothstep(0.70, 0.98, seed));
}

void main() {
  float time = max(uTime, 0.0);
  float age = min(max(uAge, 0.0), 720.0);
  float t = time * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  float ageProgress = 1.0 - exp(-age * 0.0038);
  float throatRadius = 0.325
    + 0.052 * sin(age * 0.030)
    + 0.026 * sin(age * 0.011 + 1.8);

  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float r = length(p);
  float angle = atan(p.y, p.x);
  float angleNorm = angle / TAU + 0.5;

  float rimNoise = fbm(vec2(angleNorm * 10.0, r * 7.0) + vec2(t * 0.42, -t * 0.20));
  float rimTurbulence = (rimNoise - 0.5) * (0.020 + 0.044 * e);
  float warpedR = r + rimTurbulence * smoothstep(0.55, 0.0, abs(r - throatRadius));

  float mouth = 1.0 - smoothstep(throatRadius - 0.070, throatRadius + 0.020, warpedR);
  float rim = ringMask(warpedR, throatRadius, 0.018 + 0.010 * e, 0.070);
  float innerRim = ringMask(warpedR, throatRadius * 0.78, 0.012, 0.085) * mouth;

  vec2 dir = p / max(r, 0.001);

  float lensPower = 0.34 / max(abs(warpedR - throatRadius) + 0.055, 0.055);
  float sideSign = mix(-1.0, 1.0, step(throatRadius, warpedR));

  vec2 nearSpace = p;
  nearSpace += dir * sideSign * lensPower * 0.055;
  nearSpace = rot((0.14 + 0.20 * ageProgress) / max(r + 0.10, 0.10)) * nearSpace;

  vec2 farSpace = p;
  farSpace = rot(-1.15 / max(r + 0.11, 0.11) - t * 0.22) * farSpace;
  farSpace = farSpace / max(throatRadius - r + 0.17, 0.17);
  farSpace += dir * (0.44 / max(r + 0.15, 0.15));

  float foregroundDust = fbm(nearSpace * 2.0 + vec2(-t * 0.12, t * 0.08));
  float foregroundBands = ridged(vec2(angleNorm * 4.4, log(r + 0.08) * 3.1 - t * 0.20));
  float gravitationalShear = smoothstep(0.52, 1.05, foregroundBands + foregroundDust * 0.24);
  gravitationalShear *= smoothstep(throatRadius * 0.52, throatRadius + 0.72, r);
  gravitationalShear *= 1.0 - mouth * 0.80;

  float farStarA = stars(farSpace, 62.0, 0.974);
  float farStarB = stars(farSpace * 1.7 + vec2(9.2, -4.1), 84.0, 0.986) * 0.58;
  float farStars = (farStarA + farStarB) * mouth;

  float farColourSeed = fbm(farSpace * 0.20 + vec2(3.1, -7.4));
  vec3 farStarColour = starColour(farColourSeed);

  float rimCell = fract(angleNorm * (72.0 + 32.0 * e) + rimNoise * 0.85);
  float rimSpark = smoothstep(0.965 - 0.035 * e, 1.0, hash(vec2(floor(rimCell * 90.0), floor(t * 18.0))));
  rimSpark *= rim;

  float radialStreakPhase = fract(log(r + 0.045) * 6.0 - t * (0.45 + 0.95 * e) + rimNoise);
  float infallStreaks = lineMask(radialStreakPhase - 0.5, 0.020, 0.060);
  infallStreaks *= smoothstep(throatRadius + 0.04, throatRadius + 0.72, r);
  infallStreaks *= smoothstep(1.18, 0.15, r);

  float chromaR = ringMask(warpedR, throatRadius + 0.012 + rimTurbulence * 0.40, 0.015, 0.070);
  float chromaG = ringMask(warpedR, throatRadius, 0.014, 0.065);
  float chromaB = ringMask(warpedR, throatRadius - 0.014 - rimTurbulence * 0.35, 0.015, 0.074);
  vec3 chromaticFringe = vec3(chromaR, chromaG, chromaB);

  vec3 black = vec3(0.004, 0.005, 0.012);
  vec3 deepBlue = vec3(0.018, 0.045, 0.095);
  vec3 violet = vec3(0.24, 0.08, 0.42);
  vec3 electricBlue = vec3(0.18, 0.54, 1.00);
  vec3 whiteHot = vec3(0.94, 0.98, 1.00);

  vec3 col = black;

  col += deepBlue * foregroundDust * 0.14;
  col += violet * gravitationalShear * 0.18;
  col += electricBlue * gravitationalShear * rim * (0.25 + 0.40 * e);

  col += farStarColour * farStars * (0.72 + 0.58 * ageProgress);
  col += electricBlue * innerRim * 0.18;

  col += chromaticFringe * rim * (0.32 + 0.46 * e);
  col += whiteHot * pow(rim, 2.4) * (0.36 + 0.46 * e);
  col += electricBlue * rimSpark * (0.20 + 0.70 * e);
  col += vec3(0.42, 0.70, 1.00) * infallStreaks * (0.055 + 0.18 * e);

  float throatShadow = 1.0 - smoothstep(throatRadius * 0.24, throatRadius * 0.84, r);
  col *= 1.0 - throatShadow * 0.72 * (1.0 - farStars);

  float lensGlow = smoothstep(0.72, 0.04, abs(warpedR - throatRadius));
  col += vec3(0.08, 0.20, 0.46) * lensGlow * (0.06 + 0.10 * e);

  float vig = 1.0 - smoothstep(0.55, 1.42, r);
  col *= 0.52 + 0.82 * vig;

  col *= 0.88 + 0.28 * e;

  fragColor = vec4(col, 1.0);
}
`;

function getThemeAgeSeconds(startedAtMs: number): number {
  if (typeof performance === "undefined") return 0;
  return (performance.now() - startedAtMs) / 1000;
}

export function createWormholeThroatTheme(): Theme {
  const startedAtMs = typeof performance === "undefined" ? 0 : performance.now();

  return createSinglePassTheme({
    name: "wormhole-throat",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uAge",
        getValue: () => getThemeAgeSeconds(startedAtMs),
      },
    ],
  });
}