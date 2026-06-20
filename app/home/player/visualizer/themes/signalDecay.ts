// web/app/home/player/visualizer/themes/signalDecay.ts
// blue and green leaf shapes in darkness, nice and glassy, could just use some morphing of the shapes to make it look like shadows playing
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

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.64, -1.17, 1.17, 1.64) * p;
    a *= 0.5;
  }

  return v;
}

vec2 localFlow(vec2 p, float t) {
  vec2 cell = floor(p * 2.35);
  vec2 local = fract(p * 2.35) - 0.5;

  float seed = hash(cell);
  float a = seed * 6.28318 + t * (0.35 + seed * 0.55);
  vec2 orbit = vec2(cos(a), sin(a));

  float curlA = fbm(p * 1.35 + orbit * 0.8 + vec2(t * 0.28, -t * 0.18));
  float curlB = fbm(p * 1.35 - orbit * 0.7 + vec2(-t * 0.22, t * 0.31));

  vec2 curl = vec2(curlA - 0.5, curlB - 0.5);
  curl = vec2(curl.y, -curl.x);

  float pull = smoothstep(0.78, 0.10, length(local));
  return mix(curl, curl + orbit * 0.55, pull);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 f = localFlow(p, t);
  vec2 shimmer = vec2(
    fbm(p * 3.8 + vec2(t * 1.7, 2.0)),
    fbm(p * 3.8 + vec2(5.0, -t * 1.4))
  ) - 0.5;

  vec2 advect = uv - (f * (13.0 + 25.0 * e) + shimmer * (3.0 + 8.0 * e)) * texel;

  vec4 prev = texture(uPrev, clamp(advect, vec2(0.001), vec2(0.999)));

  vec4 blur = vec4(0.0);
  blur += texture(uPrev, uv + vec2( texel.x, 0.0));
  blur += texture(uPrev, uv + vec2(-texel.x, 0.0));
  blur += texture(uPrev, uv + vec2(0.0,  texel.y));
  blur += texture(uPrev, uv + vec2(0.0, -texel.y));
  blur *= 0.25;

  vec4 state = mix(prev, blur, 0.030 + 0.060 * e);

  vec2 warp = vec2(
    fbm(p * 1.8 + vec2(t * 0.7, -t * 0.4)),
    fbm(p * 1.8 + vec2(9.0 - t * 0.5, t * 0.6))
  ) - 0.5;

  vec2 q = p + warp * (0.34 + 0.22 * e);

  float carrierA = sin((q.x * 7.6 + q.y * 2.3) + t * 2.3);
  float carrierB = sin((q.y * 7.1 - q.x * 1.9) - t * 1.7);
  float carrierC = sin(dot(q, normalize(vec2(0.74, 0.67))) * 12.4 + t * 1.15);

  float signal = (carrierA + carrierB + carrierC) * 0.333;
  signal += (fbm(q * 2.45 + vec2(t, -t * 0.6)) - 0.5) * 0.72;

  float injection = smoothstep(0.57 - 0.15 * e, 0.99, abs(signal));
  injection *= smoothstep(1.16, 0.08, length(p));
  injection *= 0.040 + 0.22 * e;

  vec3 spectral = vec3(
    smoothstep(0.20, 0.95, signal),
    smoothstep(0.18, 0.88, fbm(q * 2.0 + vec2(3.1, t))),
    smoothstep(0.18, 0.90, -signal + 0.42)
  );

  state.rgb *= 0.958 - 0.024 * e;
  state.rgb += spectral * injection;

  float scan = smoothstep(0.025, 0.0, abs(fract(uv.y * 42.0 - t * 3.0) - 0.5));
  state.b += scan * (0.004 + 0.024 * e);

  state.a = max(state.a * 0.968, injection * 2.35);

  if (uFrame < 2.0) {
    state = vec4(0.0);
  }

  fragColor = clamp(state, vec4(0.0), vec4(1.0));
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

  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.11, 1.11, 1.62) * p;
    a *= 0.5;
  }

  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);

  float lx = texture(uState, uv + vec2(texel.x, 0.0)).a;
  float rx = texture(uState, uv - vec2(texel.x, 0.0)).a;
  float uy = texture(uState, uv + vec2(0.0, texel.y)).a;
  float dy = texture(uState, uv - vec2(0.0, texel.y)).a;
  float edge = smoothstep(0.02, 0.42, length(vec2(lx - rx, uy - dy)));

  float grain = hash(floor((p + 1.3) * (180.0 + 70.0 * e)) + floor(t * 20.0));
  float dropout = smoothstep(0.04 + 0.08 * e, 1.0, grain);

  float shadowA = fbm(p * 1.15 + vec2(t * 0.95, -t * 0.42));
  float shadowB = fbm(p * 2.10 + vec2(-t * 0.55, t * 0.72));
  float shadow = smoothstep(0.24, 0.82, shadowA * 0.72 + shadowB * 0.28);

  float veil = smoothstep(
    0.20,
    0.88,
    fbm(p * 0.85 + vec2(-t * 1.15, t * 0.38))
  );

  vec3 deep = vec3(0.014, 0.015, 0.030);
  vec3 ghost = vec3(0.14, 0.32, 0.54);
  vec3 leaf = vec3(0.26, 0.56, 0.20);
  vec3 hot = vec3(0.78, 0.90, 1.0);

  vec3 col = deep;
  col += ghost * s.rgb * (1.10 + 0.75 * e);
  col += leaf * s.g * s.a * (0.35 + 0.30 * e);
  col += hot * edge * (0.13 + 0.30 * e);
  col += vec3(0.28, 0.50, 0.88) * s.a * (0.08 + 0.16 * e);

  col *= mix(0.38, 1.18, shadow);
  col *= mix(1.0, 0.58, veil * (1.0 - shadow));
  col *= 0.72 + 0.28 * dropout;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.50 + 0.78 * vig;

  col *= 0.86 + 0.30 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createSignalDecayTheme(): Theme {
  return createPingPongTheme({
    name: "signal-decay",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
  });
}
