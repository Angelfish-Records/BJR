// web/app/home/player/visualizer/themes/reactionVeins2.ts
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

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.63, -1.14, 1.14, 1.63) * p;
    a *= 0.5;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.65;
  float w = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * w);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;

    w *= 2.05;
    a *= 0.55;
    p = mat2(0.86, -0.50, 0.50, 0.86) * p;
  }

  return v;
}

vec2 flow(vec2 p, float t) {
  float a = fbm(p * 1.1 + vec2(t * 0.20, -t * 0.17));
  float b = fbm(p * 1.1 + vec2(-t * 0.16, t * 0.22));
  vec2 g = vec2(a - 0.5, b - 0.5);
  return vec2(g.y, -g.x);
}

vec4 samplePrev(vec2 uv) {
  return texture(uPrev, clamp(uv, vec2(0.001), vec2(0.999)));
}

void main() {
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.085;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 f = flow(p * 1.15, t);
  vec2 advectUv = uv - f * texel * (7.0 + 18.0 * e);

  vec4 prev = samplePrev(advectUv);

  vec4 n;
  n  = samplePrev(uv + vec2( texel.x, 0.0));
  n += samplePrev(uv + vec2(-texel.x, 0.0));
  n += samplePrev(uv + vec2(0.0,  texel.y));
  n += samplePrev(uv + vec2(0.0, -texel.y));
  n *= 0.25;

  vec4 state = mix(prev, n, 0.065 + 0.055 * e);

  float U = state.r;
  float V = state.g;
  float memory = state.b;
  float age = state.a;

  float reagentA = fbm(p * 1.65 + vec2(0.0, t * 1.2));
  float reagentB = fbm(p * 1.65 + vec2(12.3, -t * 1.1));
  float diff = abs(reagentA - reagentB);

  float front = smoothstep(0.055, 0.30, diff);
  float veinBase = ridged(p * 2.45 + f * 0.35 + vec2(t * 0.42, -t * 0.25));
  float proceduralVeins = smoothstep(0.44 - 0.13 * e, 0.94, veinBase);
  proceduralVeins *= 0.35 + 0.85 * front;

  float pulse = smoothstep(0.58, 1.0, e);
  float injectionNoise = fbm(p * 3.4 + vec2(-t * 0.55, t * 0.35));
  float injection = proceduralVeins * (0.018 + 0.085 * pulse);
  injection += smoothstep(0.72, 0.96, injectionNoise) * (0.006 + 0.030 * e);

  float feed = 0.034 + 0.030 * e;
  float kill = 0.057 - 0.014 * e;
  float reaction = U * V * V;

  U += feed * (1.0 - U) - reaction * 0.62 + injection * 0.45;
  V += reaction - (feed + kill) * V + injection;

  U = mix(U, reagentA, 0.006);
  V = mix(V, reagentB, 0.004);

  float newVein = smoothstep(0.12, 0.58, V - U + proceduralVeins * 0.28);
  memory = max(memory * (0.982 - 0.018 * e), newVein);
  memory = mix(memory, n.b, 0.045);

  age = age * 0.988 + newVein * 0.035 + e * 0.002;

  if (uFrame < 2.0) {
    float seedA = fbm(p * 1.45 + vec2(0.0, t));
    float seedB = fbm(p * 1.45 + vec2(8.7, -t));
    float seedVein = smoothstep(0.50, 0.92, ridged(p * 2.2));

    U = seedA;
    V = seedB * 0.45;
    memory = seedVein * 0.35;
    age = seedVein * 0.20;
  }

  fragColor = vec4(
    clamp(U, 0.0, 1.0),
    clamp(V, 0.0, 1.0),
    clamp(memory, 0.0, 1.0),
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

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.61, -1.17, 1.17, 1.61) * p;
    a *= 0.5;
  }

  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.08;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);

  float U = s.r;
  float V = s.g;
  float memory = s.b;
  float age = s.a;

  float vein = smoothstep(0.16, 0.76, memory);
  float reagentGlow = smoothstep(0.08, 0.58, V - U + memory * 0.25);

  float mx1 = texture(uState, uv + vec2(texel.x, 0.0)).b;
  float mx2 = texture(uState, uv - vec2(texel.x, 0.0)).b;
  float my1 = texture(uState, uv + vec2(0.0, texel.y)).b;
  float my2 = texture(uState, uv - vec2(0.0, texel.y)).b;
  vec2 grad = vec2(mx1 - mx2, my1 - my2) / (2.0 * max(texel.x, texel.y));

  float edge = smoothstep(0.08, 0.56, length(grad));
  edge *= 0.10 + 0.25 * e;

  float mottling = fbm(p * 3.1 + vec2(-t * 0.55, t * 0.38));
  float underSkin = fbm(p * 1.05 + vec2(t * 0.18, -t * 0.12));

  vec3 deep = vec3(0.045, 0.040, 0.065);
  vec3 skin = vec3(0.18, 0.135, 0.20);
  vec3 bruise = vec3(0.32, 0.22, 0.36);
  vec3 veinCol = vec3(0.70, 0.62, 0.88);
  vec3 hot = vec3(0.95, 0.96, 1.00);

  vec3 col = mix(deep, skin, smoothstep(0.10, 0.95, underSkin));
  col = mix(col, bruise, smoothstep(0.20, 0.95, age) * 0.45);
  col = mix(col, veinCol, vein * (0.62 + 0.32 * reagentGlow));
  col += hot * edge * (0.75 + 0.65 * reagentGlow);

  float wet = smoothstep(0.35, 0.92, V + memory * 0.45);
  col += vec3(0.75, 0.82, 1.0) * wet * (0.035 + 0.095 * e);

  col *= 0.87 + 0.22 * mottling;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.72 * vig;

  col *= 0.90 + 0.25 * e;

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