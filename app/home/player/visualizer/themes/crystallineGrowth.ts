// web/app/home/player/visualizer/themes/crystallineGrowth.ts
// Dendritic crystalline growth: branching ice/lightning front, faceted mineral wake.
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
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    a *= 0.52;
  }
  return v;
}

float branch(vec2 p, float t, float phase, float spread, float width) {
  float y = p.y + 0.95 - t;
  float root = abs(p.x);

  float wobble =
    0.34 * sin(y * 5.2 + phase) +
    0.16 * sin(y * 11.0 - phase * 1.7) +
    0.12 * (fbm(vec2(y * 2.2, phase)) - 0.5);

  float trunk = abs(p.x - wobble * spread);
  float front = 1.0 - smoothstep(0.00, 0.42, abs(y));

  float core = exp(-trunk * trunk / width) * front;

  float forkA = abs(p.x - wobble * spread - y * 0.46 - 0.10 * sin(y * 13.0 + phase));
  float forkB = abs(p.x - wobble * spread + y * 0.38 + 0.12 * sin(y * 10.0 - phase));
  float forkWindow = smoothstep(-0.42, 0.20, y) * smoothstep(0.72, -0.10, y);

  float forks =
    exp(-forkA * forkA / (width * 0.72)) * forkWindow * 0.62 +
    exp(-forkB * forkB / (width * 0.78)) * forkWindow * 0.52;

  return max(core, forks);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float t = uTime * (0.135 + 0.060 * e);

  vec4 prev = texture(uPrev, uv);

  float n = 0.0;
  n += texture(uPrev, uv + vec2( texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(-texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(0.0,  texel.y)).r;
  n += texture(uPrev, uv - vec2(0.0, texel.y)).r;
  n *= 0.25;

  float cycle = mod(t, 2.45);
  float head = cycle;

  vec2 drift = vec2(
    fbm(p * 1.4 + vec2(t * 0.17, -t * 0.08)),
    fbm(p * 1.4 + vec2(-t * 0.11, t * 0.15))
  ) - 0.5;

  vec2 q = p + drift * 0.16;

  float bolt = 0.0;
  bolt = max(bolt, branch(q, head, 0.4, 0.34, 0.010 + 0.010 * e));
  bolt = max(bolt, branch(q + vec2(0.28, -0.10), head * 0.94, 2.1, 0.30, 0.008 + 0.008 * e) * 0.80);
  bolt = max(bolt, branch(q + vec2(-0.30, 0.04), head * 1.03, 4.7, 0.26, 0.007 + 0.007 * e) * 0.72);

  float mineral = fbm(q * 5.5 + vec2(t * 0.20, -t * 0.14));
  float fracture = smoothstep(0.30, 0.96, bolt + mineral * 0.28);
  float neighbourFeed = smoothstep(0.02, 0.72, n);

  float growth = max(prev.r * 0.991, fracture * (0.54 + 0.38 * neighbourFeed + 0.20 * e));
  float facet = mix(prev.g * 0.996, mineral, 0.030 + 0.035 * e);
  facet = max(facet, growth * smoothstep(0.26, 0.92, mineral));

  float front = max(prev.b * (0.900 - 0.030 * e), bolt);
  float age = max(prev.a * 0.994, growth * 0.72);

  if (uFrame < 2.0) {
    float mist = smoothstep(0.42, 0.90, fbm(p * 3.0));
    growth = mist * 0.22;
    facet = mist * 0.36;
    front = 0.0;
    age = mist * 0.18;
  }

  fragColor = vec4(
    clamp(growth, 0.0, 1.0),
    clamp(facet, 0.0, 1.0),
    clamp(front, 0.0, 1.0),
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
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    a *= 0.52;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);
  float growth = smoothstep(0.04, 0.82, s.r);
  float facet = s.g;
  float front = smoothstep(0.08, 0.95, s.b);
  float age = s.a;

  float gx1 = texture(uState, uv + vec2(texel.x, 0.0)).r;
  float gx2 = texture(uState, uv - vec2(texel.x, 0.0)).r;
  float gy1 = texture(uState, uv + vec2(0.0, texel.y)).r;
  float gy2 = texture(uState, uv - vec2(0.0, texel.y)).r;
  vec2 grad = vec2(gx1 - gx2, gy1 - gy2);

  float edge = smoothstep(0.020, 0.240, length(grad));
  float internalFacet = smoothstep(0.34, 0.86, fbm(p * 10.0 + facet * 2.0));
  float shard = smoothstep(0.46, 0.92, fbm(p * 16.0 + vec2(facet * 2.0, -facet)));

  float lightAngle = dot(normalize(grad + vec2(0.0001)), normalize(vec2(0.36, 0.93)));
  float sheen = smoothstep(0.12, 0.98, lightAngle * 0.5 + 0.5);

  vec3 voidBlue = vec3(0.018, 0.022, 0.040);
  vec3 deepIce = vec3(0.060, 0.088, 0.140);
  vec3 mineral = vec3(0.145, 0.205, 0.310);
  vec3 violet = vec3(0.310, 0.250, 0.520);
  vec3 cyan = vec3(0.440, 0.780, 1.000);
  vec3 white = vec3(0.970, 0.990, 1.000);

  vec3 col = voidBlue;
  col = mix(col, deepIce, 0.42 + growth * 0.42);
  col = mix(col, mineral, growth * (0.54 + facet * 0.22));
  col = mix(col, violet, growth * facet * 0.24);
  col = mix(col, cyan, growth * sheen * (0.22 + 0.18 * e));

  col += white * edge * growth * (0.20 + 0.28 * e);
  col += cyan * internalFacet * growth * 0.14;
  col += white * shard * growth * facet * 0.10;
  col += white * front * (0.70 + 0.70 * e);
  col += cyan * front * (0.32 + 0.45 * e);

  float halo = smoothstep(0.82, 0.00, length(p)) * (0.12 + 0.12 * e);
  col += cyan * halo * (growth + front * 0.8);

  float r = length(p);
  float vig = smoothstep(1.32, 0.20, r);
  col *= 0.72 + 0.58 * vig;

  col *= 0.90 + 0.24 * e;

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