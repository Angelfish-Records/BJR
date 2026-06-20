// web/app/home/player/visualizer/themes/reactionVeins2.ts
// Triumphant thermal bloom: dense heat-wave particulate inside living reaction clouds.
import type { Theme } from "../types";
import { createPingPongTheme } from "./themeFactory";

const SIM_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uFrame;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.58, -1.21, 1.21, 1.58) * p;
    a *= 0.52;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.62;

  for (int i = 0; i < 5; i++) {
    float n = noise(p);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;
    p = mat2(1.72, -0.88, 0.88, 1.72) * p;
    a *= 0.54;
  }

  return v;
}

vec2 curl(vec2 p, float t) {
  float e = 0.045;

  float n1 = fbm(p + vec2(0.0, e) + vec2(t * 0.18, -t * 0.13));
  float n2 = fbm(p - vec2(0.0, e) + vec2(t * 0.18, -t * 0.13));
  float n3 = fbm(p + vec2(e, 0.0) + vec2(-t * 0.15, t * 0.19));
  float n4 = fbm(p - vec2(e, 0.0) + vec2(-t * 0.15, t * 0.19));

  vec2 g = vec2(n1 - n2, n3 - n4) / (2.0 * e);
  return vec2(g.y, -g.x);
}

vec4 samplePrev(vec2 uv) {
  return texture(uPrev, clamp(uv, vec2(0.001), vec2(0.999)));
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.075;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 swirl = curl(p * 1.25, t);
  vec2 slowDrift = vec2(
    fbm(p * 0.85 + vec2(t * 0.25, 4.0)),
    fbm(p * 0.85 + vec2(-3.0, -t * 0.22))
  ) - 0.5;

  vec2 advectUv = uv - (swirl * 0.75 + slowDrift * 0.55) * texel * (11.0 + 22.0 * e);
  vec4 prev = samplePrev(advectUv);

  vec4 blur;
  blur  = samplePrev(uv + vec2( texel.x, 0.0));
  blur += samplePrev(uv + vec2(-texel.x, 0.0));
  blur += samplePrev(uv + vec2(0.0,  texel.y));
  blur += samplePrev(uv + vec2(0.0, -texel.y));
  blur *= 0.25;

  vec4 state = mix(prev, blur, 0.045 + 0.055 * e);

  float heat = state.r;
  float reagent = state.g;
  float bloom = state.b;
  float age = state.a;

  float bodyA = fbm(p * 1.35 + swirl * 0.20 + vec2(t * 0.65, -t * 0.24));
  float bodyB = fbm(p * 1.72 - swirl * 0.16 + vec2(-t * 0.42, t * 0.51));
  float cloud = smoothstep(0.18, 0.88, bodyA * 0.68 + bodyB * 0.52);

  float waveBands = ridged(p * (3.2 + e * 0.8) + swirl * 0.55 + vec2(t * 0.58, -t * 0.38));
  float thermal = smoothstep(0.28 - 0.08 * e, 0.98, waveBands) * cloud;

  float granular = fbm(p * 10.0 + swirl * 1.3 + vec2(-t * 2.0, t * 1.35));
  float sparkle = smoothstep(0.62, 0.96, granular) * thermal;

  float reaction = heat * reagent * reagent;
  float injection = thermal * (0.032 + 0.075 * e) + sparkle * (0.018 + 0.05 * e);

  heat += 0.045 * (1.0 - heat) - reaction * 0.42 + injection * 0.72;
  reagent += reaction * 0.85 - reagent * (0.052 - 0.012 * e) + injection * 0.82;

  heat = mix(heat, bodyA, 0.008);
  reagent = mix(reagent, bodyB, 0.006);

  float newBloom = smoothstep(0.15, 0.72, reagent - heat * 0.35 + thermal * 0.85);
  bloom = max(bloom * (0.986 - 0.012 * e), newBloom);
  bloom = mix(bloom, blur.b, 0.035);

  age = age * 0.992 + bloom * 0.012 + sparkle * 0.025 + e * 0.002;

  if (uFrame < 2.0) {
    float seedCloud = smoothstep(0.18, 0.88, fbm(p * 1.4) + fbm(p * 2.1 + 8.0) * 0.55);
    float seedWave = smoothstep(0.32, 0.94, ridged(p * 3.0));

    heat = seedCloud * 0.55;
    reagent = seedWave * seedCloud * 0.48;
    bloom = max(seedCloud * 0.38, seedWave * 0.28);
    age = seedCloud * 0.20;
  }

  fragColor = vec4(
    clamp(heat, 0.0, 1.0),
    clamp(reagent, 0.0, 1.0),
    clamp(bloom, 0.0, 1.0),
    clamp(age, 0.0, 1.0)
  );
}
`;

const DISPLAY_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uState;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.55, -1.24, 1.24, 1.55) * p;
    a *= 0.52;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.62;

  for (int i = 0; i < 5; i++) {
    float n = noise(p);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;
    p = mat2(1.74, -0.84, 0.84, 1.74) * p;
    a *= 0.54;
  }

  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.075;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);

  float heat = s.r;
  float reagent = s.g;
  float bloom = s.b;
  float age = s.a;

  float hL = texture(uState, uv - vec2(texel.x, 0.0)).b;
  float hR = texture(uState, uv + vec2(texel.x, 0.0)).b;
  float hD = texture(uState, uv - vec2(0.0, texel.y)).b;
  float hU = texture(uState, uv + vec2(0.0, texel.y)).b;
  vec2 grad = vec2(hR - hL, hU - hD) / max(texel.x, texel.y);

  float body = smoothstep(0.04, 0.72, bloom);
  float reactionGlow = smoothstep(0.08, 0.78, reagent - heat * 0.25 + bloom * 0.44);
  float rim = smoothstep(0.12, 1.7, length(grad)) * body;

  float wave = ridged(p * (7.2 + e * 2.2) + grad * 0.012 + vec2(t * 1.15, -t * 0.72));
  float fineWave = fbm(p * 18.0 + grad * 0.018 + vec2(-t * 2.5, t * 1.65));
  float particulate = smoothstep(0.36, 0.98, wave) * smoothstep(0.18, 0.94, fineWave);
  particulate *= body * (0.55 + 0.75 * reactionGlow);

  float atmosphere = fbm(p * 1.35 + vec2(t * 0.16, -t * 0.11));
  float sunset = fbm(p * 2.2 + vec2(-t * 0.24, t * 0.18));

  vec3 midnight = vec3(0.020, 0.035, 0.095);
  vec3 royalBlue = vec3(0.030, 0.115, 0.310);
  vec3 deepViolet = vec3(0.145, 0.075, 0.240);
  vec3 sunsetPink = vec3(0.840, 0.250, 0.470);
  vec3 orange = vec3(1.000, 0.430, 0.135);
  vec3 gold = vec3(1.000, 0.760, 0.240);
  vec3 champagne = vec3(1.000, 0.905, 0.650);

  vec3 base = mix(midnight, royalBlue, smoothstep(0.05, 0.92, atmosphere));
  base = mix(base, deepViolet, smoothstep(0.24, 0.88, sunset) * 0.45);

  vec3 thermalCol = mix(sunsetPink, orange, smoothstep(0.15, 0.85, heat + reactionGlow * 0.35));
  thermalCol = mix(thermalCol, gold, smoothstep(0.35, 0.96, reagent + particulate * 0.35));

  vec3 col = mix(base, thermalCol, body * (0.58 + 0.22 * e));
  col += gold * particulate * (0.28 + 0.45 * e);
  col += champagne * rim * (0.18 + 0.34 * reactionGlow);
  col += sunsetPink * smoothstep(0.52, 0.98, age) * body * 0.18;

  float haze = smoothstep(0.08, 0.86, heat + bloom * 0.45);
  col += mix(royalBlue, orange, sunset) * haze * 0.10;

  float r = length(p);
  float vig = smoothstep(1.42, 0.22, r);
  col *= 0.70 + 0.60 * vig;

  col *= 0.90 + 0.22 * e;
  col = pow(max(col, vec3(0.0)), vec3(0.92));

  fragColor = vec4(col, 1.0);
}
`;

export function createReactionVeins2Theme(): Theme {
  return createPingPongTheme({
    name: "reaction-veins-2",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
  });
}