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
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    a *= 0.5;
  }

  return v;
}

float crackField(vec2 p, float t) {
  vec2 cell = floor(p * 5.0);
  vec2 f = fract(p * 5.0) - 0.5;

  float best = 10.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = cell + o;

      float a = hash(id + 9.7) * 6.28318;
      vec2 seed = o + vec2(cos(a), sin(a)) * (0.18 + 0.12 * sin(t + hash(id) * 6.0));

      vec2 d = f - seed;
      best = min(best, abs(length(d) - 0.24 - 0.10 * hash(id + 4.1)));
    }
  }

  float branch = 1.0 - smoothstep(0.018, 0.080, best);
  float grain = fbm(p * 7.0 + vec2(t * 0.4, -t * 0.3));

  return branch * smoothstep(0.35, 0.92, grain);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.085;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 prev = texture(uPrev, uv);

  float n = 0.0;
  n += texture(uPrev, uv + vec2( texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(-texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(0.0,  texel.y)).r;
  n += texture(uPrev, uv + vec2(0.0, -texel.y)).r;
  n *= 0.25;

  float crack = prev.r;
  float stress = prev.g;
  float heat = prev.b;
  float age = prev.a;

  float radialStress = smoothstep(1.10, 0.05, length(p));
  radialStress *= 0.45 + 0.65 * fbm(p * 1.4 + vec2(t * 0.4, -t * 0.22));

  float proceduralCrack = crackField(p + vec2(t * 0.08, -t * 0.05), t);
  float trigger = smoothstep(0.58 - 0.18 * e, 0.98, radialStress + proceduralCrack * 0.55);

  float propagation = smoothstep(0.10, 0.70, n + trigger * (0.30 + 0.70 * e));
  crack = max(crack * 0.996, propagation * trigger);

  stress = mix(stress, radialStress, 0.040 + 0.050 * e);
  stress += crack * (0.010 + 0.030 * e);
  stress *= 0.988;

  heat = max(heat * (0.955 - 0.018 * e), crack * trigger * (0.45 + 0.55 * e));
  age = max(age * 0.990, crack * 0.65);

  if (uFrame < 2.0) {
    float seed = smoothstep(0.74, 0.98, crackField(p, t));
    crack = seed * 0.22;
    stress = radialStress * 0.35;
    heat = seed * 0.18;
    age = seed * 0.15;
  }

  fragColor = vec4(
    clamp(crack, 0.0, 1.0),
    clamp(stress, 0.0, 1.0),
    clamp(heat, 0.0, 1.0),
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
    p = mat2(1.65, -1.13, 1.13, 1.65) * p;
    a *= 0.5;
  }

  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.085;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);
  float crack = smoothstep(0.12, 0.72, s.r);
  float stress = s.g;
  float heat = s.b;
  float age = s.a;

  float cx1 = texture(uState, uv + vec2(texel.x, 0.0)).r;
  float cx2 = texture(uState, uv - vec2(texel.x, 0.0)).r;
  float cy1 = texture(uState, uv + vec2(0.0, texel.y)).r;
  float cy2 = texture(uState, uv - vec2(0.0, texel.y)).r;
  float edge = smoothstep(0.04, 0.52, length(vec2(cx1 - cx2, cy1 - cy2)));

  float bodyNoise = fbm(p * 2.1 + vec2(t * 0.12, -t * 0.08));
  float fineNoise = fbm(p * 8.0 + vec2(-t * 0.6, t * 0.4));

  vec3 deep = vec3(0.035, 0.032, 0.045);
  vec3 slab = vec3(0.145, 0.135, 0.165);
  vec3 bruise = vec3(0.32, 0.21, 0.30);
  vec3 ember = vec3(0.98, 0.45, 0.22);
  vec3 white = vec3(0.96, 0.97, 1.0);

  vec3 col = mix(deep, slab, smoothstep(0.10, 0.90, bodyNoise));
  col = mix(col, bruise, stress * 0.45);
  col *= 1.0 - crack * 0.68;

  col += ember * heat * (0.22 + 0.42 * e);
  col += white * edge * (0.16 + 0.24 * e);
  col += vec3(0.42, 0.58, 0.86) * age * fineNoise * 0.045;

  float dust = smoothstep(0.88, 1.0, fineNoise) * crack;
  col += vec3(0.68, 0.70, 0.78) * dust * (0.035 + 0.070 * e);

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.54 + 0.74 * vig;

  col *= 0.88 + 0.28 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createFracturePropagationTheme(): Theme {
  return createPingPongTheme({
    name: "fracture-propagation",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
  });
}