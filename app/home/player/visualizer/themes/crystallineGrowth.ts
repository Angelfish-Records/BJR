// web/app/home/player/visualizer/themes/crystallineGrowth.ts
// big chunky hexagons, concept is good but the shapes and the overlaid white outline framing need to be aligned
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

vec2 hash2(vec2 p) {
  return vec2(hash(p + 17.1), hash(p + 43.7));
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
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.59, -1.20, 1.20, 1.59) * p;
    a *= 0.5;
  }

  return v;
}

vec4 crystalField(vec2 p, float t) {
  vec2 q = p * 4.7;
  vec2 g = floor(q);
  vec2 f = fract(q);

  float best = 10.0;
  float second = 10.0;
  vec2 bestId = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = g + o;
      vec2 h = hash2(id);

      vec2 drift = 0.08 * sin(vec2(1.3, 1.9) * t + h * 6.28318);
      vec2 seed = o + 0.5 + drift;

      float d = length(f - seed);

      if (d < best) {
        second = best;
        best = d;
        bestId = id;
      } else if (d < second) {
        second = d;
      }
    }
  }

  float edgeDistance = second - best;
  float boundary = 1.0 - smoothstep(0.030, 0.120, edgeDistance);
  float body = smoothstep(0.64, 0.10, best);
  float cellTone = hash(bestId);

  return vec4(boundary, body, cellTone, best);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.055;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 prev = texture(uPrev, uv);

  float n = 0.0;
  n += texture(uPrev, uv + vec2( texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(-texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(0.0,  texel.y)).r;
  n += texture(uPrev, uv - vec2(0.0, texel.y)).r;
  n *= 0.25;

  float growth = prev.r;
  float facet = prev.g;
  float glint = prev.b;
  float age = prev.a;

  vec2 warp = vec2(
    fbm(p * 1.7 + vec2(t * 0.42, -t * 0.18)),
    fbm(p * 1.7 + vec2(-t * 0.22, t * 0.38))
  ) - 0.5;

  vec4 crystal = crystalField(p + warp * 0.075, t);
  float boundary = crystal.x;
  float body = crystal.y;
  float cellTone = crystal.z;

  float mineral = fbm(p * 2.5 + warp * 0.9 + vec2(-t * 0.30, t * 0.24));
  float vein = boundary * smoothstep(0.36, 0.92, mineral + body * 0.42);

  float neighbourFeed = smoothstep(0.06, 0.70, n);
  float ignition = smoothstep(0.78 - 0.18 * e, 0.98, mineral * 0.58 + cellTone * 0.30 + body * 0.36);

  float crystallise = max(ignition * body, vein * (0.40 + 0.60 * neighbourFeed));
  growth = max(growth * 0.996, crystallise * (0.24 + 0.72 * neighbourFeed + 0.22 * e));

  facet = mix(facet, body * (0.45 + 0.55 * cellTone), 0.030 + 0.055 * e);
  facet = max(facet, growth * boundary * 0.82);

  float glintSeed = smoothstep(0.88 - 0.08 * e, 1.0, fbm(p * 10.0 + warp * 2.0 + vec2(t * 1.4, -t * 1.1)));
  glint = max(glint * (0.945 - 0.020 * e), glintSeed * growth * (0.35 + boundary));

  age = max(age * 0.993, growth * (0.48 + 0.42 * boundary));

  if (uFrame < 2.0) {
    float initial = smoothstep(0.82, 0.98, mineral * body + boundary * 0.18);
    growth = initial * 0.34;
    facet = initial * body;
    glint = initial * boundary * 0.35;
    age = initial * 0.20;
  }

  fragColor = vec4(
    clamp(growth, 0.0, 1.0),
    clamp(facet, 0.0, 1.0),
    clamp(glint, 0.0, 1.0),
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

vec2 hash2(vec2 p) {
  return vec2(hash(p + 17.1), hash(p + 43.7));
}

vec4 crystalField(vec2 p, float t) {
  vec2 q = p * 4.7;
  vec2 g = floor(q);
  vec2 f = fract(q);

  float best = 10.0;
  float second = 10.0;
  vec2 bestId = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = g + o;
      vec2 h = hash2(id);

      vec2 drift = 0.08 * sin(vec2(1.3, 1.9) * t + h * 6.28318);
      vec2 seed = o + 0.5 + drift;

      float d = length(f - seed);

      if (d < best) {
        second = best;
        best = d;
        bestId = id;
      } else if (d < second) {
        second = d;
      }
    }
  }

  float edgeDistance = second - best;
  float boundary = 1.0 - smoothstep(0.030, 0.120, edgeDistance);
  float body = smoothstep(0.64, 0.10, best);
  float cellTone = hash(bestId);

  return vec4(boundary, body, cellTone, best);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.055;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);
  float growth = smoothstep(0.08, 0.76, s.r);
  float facet = s.g;
  float glint = s.b;
  float age = s.a;

  vec2 warp = vec2(
    hash(floor(p * 7.0 + t)),
    hash(floor(p * 7.0 - t + 19.0))
  ) - 0.5;

  vec4 crystal = crystalField(p + warp * 0.012, t);
  float boundary = crystal.x;
  float body = crystal.y;
  float cellTone = crystal.z;

  float gx1 = texture(uState, uv + vec2(texel.x, 0.0)).r;
  float gx2 = texture(uState, uv - vec2(texel.x, 0.0)).r;
  float gy1 = texture(uState, uv + vec2(0.0, texel.y)).r;
  float gy2 = texture(uState, uv - vec2(0.0, texel.y)).r;
  vec2 grad = vec2(gx1 - gx2, gy1 - gy2);

  float grownBoundary = boundary * smoothstep(0.16, 0.82, growth);
  float growthEdge = smoothstep(0.035, 0.42, length(grad));

  float angleLight = dot(normalize(grad + vec2(0.0001)), normalize(vec2(0.45, 0.89)));
  float sheen = smoothstep(0.10, 0.94, angleLight * 0.5 + 0.5);

  vec3 deep = vec3(0.024, 0.026, 0.044);
  vec3 stone = vec3(0.100, 0.116, 0.168);
  vec3 violet = vec3(0.370, 0.280, 0.570);
  vec3 blue = vec3(0.320, 0.570, 0.900);
  vec3 ice = vec3(0.700, 0.875, 1.000);
  vec3 white = vec3(0.965, 0.985, 1.000);

  vec3 col = mix(deep, stone, growth * (0.80 + body * 0.20));
  col = mix(col, violet, growth * facet * (0.26 + cellTone * 0.24));
  col = mix(col, blue, age * body * 0.10);
  col = mix(col, ice, growth * sheen * (0.22 + 0.16 * e));

  col += white * grownBoundary * (0.10 + 0.18 * e);
  col += white * growthEdge * (0.08 + 0.22 * e);
  col += white * glint * (0.22 + 0.48 * e);
  col += violet * boundary * growth * facet * 0.12;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.52 + 0.76 * vig;

  col *= 0.86 + 0.28 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createCrystallineGrowthTheme(): Theme {
  return createPingPongTheme({
    name: "crystalline-growth",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
  });
}
