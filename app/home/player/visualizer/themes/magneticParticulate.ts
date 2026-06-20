// web/app/home/player/visualizer/themes/magneticParticulate.ts
// this one is cool but it would be even cooler with some space-time compression like simpsons 3D episode fabric
import type { Theme } from "../types";
import { createProgram, makeFullscreenTriangle } from "../gl";

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;

void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

// Magnetic Particulate
// Iron filings in a living field: granular dust, field-line alignment, audio-driven clustering.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

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

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.16, 1.16, 1.62) * p;
    a *= 0.5;
  }

  return v;
}

vec2 curl(vec2 p) {
  float eps = 0.0028;

  float n1 = fbm(p + vec2(0.0, eps));
  float n2 = fbm(p - vec2(0.0, eps));
  float n3 = fbm(p + vec2(eps, 0.0));
  float n4 = fbm(p - vec2(eps, 0.0));

  vec2 grad = vec2(n3 - n4, n1 - n2) / (2.0 * eps);
  return normalize(vec2(grad.y, -grad.x) + vec2(0.0001));
}

float filament(vec2 p, vec2 dir, float scale) {
  vec2 n = vec2(-dir.y, dir.x);
  float along = dot(p, dir);
  float across = dot(p, n);

  float lane = abs(fract(across * scale) - 0.5);
  float broken = fbm(vec2(along * 1.8, across * 0.35));

  return smoothstep(0.19, 0.018, lane) * smoothstep(0.22, 0.95, broken);
}

float pressureWell(vec2 p, vec2 c, float radius) {
  float d = length(p - c) / radius;
  return exp(-d * d * 2.6);
}

vec3 oceanIridescence(float x) {
  vec3 teal = vec3(0.08, 0.72, 0.68);
  vec3 blue = vec3(0.12, 0.38, 0.92);
  vec3 violet = vec3(0.56, 0.22, 0.88);
  vec3 pearl = vec3(0.82, 0.96, 0.92);

  vec3 a = mix(teal, blue, smoothstep(0.10, 0.55, x));
  vec3 b = mix(violet, pearl, smoothstep(0.45, 0.95, x));

  return mix(a, b, smoothstep(0.35, 0.85, x));
}

vec2 fabricWarp(vec2 p, float t, float e) {
  vec2 c1 = vec2(0.22 * sin(t * 1.7), 0.18 * cos(t * 1.3));
  vec2 c2 = vec2(0.46 * sin(t * 0.8 + 2.1), 0.34 * cos(t * 0.9 + 1.4));

  float w1 = pressureWell(p, c1, 0.54);
  float w2 = pressureWell(p, c2, 0.38);

  vec2 pull1 = normalize(c1 - p + vec2(0.0001)) * w1;
  vec2 push2 = normalize(p - c2 + vec2(0.0001)) * w2;

  float strength = 0.055 + 0.105 * e;

  vec2 warped = p;
  warped += pull1 * strength;
  warped += push2 * strength * 0.55;

  float r = length(p);
  vec2 tangent = vec2(-p.y, p.x) / max(r, 0.001);
  warped += tangent * (w1 - w2) * (0.012 + 0.030 * e);

  return warped;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

   vec2 q = fabricWarp(p, t, e);

  q += 0.035 * vec2(
    fbm(p * 1.2 + vec2(t, -t * 0.4)),
    fbm(p * 1.2 + vec2(7.2 - t * 0.3, t * 0.6))
  );

  vec2 field = curl(q * 1.35 + vec2(t * 0.35, -t * 0.18));

  float basin = fbm(q * 1.1 + vec2(-t * 0.22, t * 0.16));
  float cluster = smoothstep(0.32 - 0.10 * e, 0.92, basin);

  float f1 = filament(q + field * 0.05, field, 13.0 + 8.0 * e);
  float f2 = filament(q * 1.35 - field * 0.08, field, 22.0 + 14.0 * e) * 0.55;

  vec2 grainGrid = floor((q + 1.2) * (118.0 + 54.0 * e));
  vec2 grainCell = fract((q + 1.2) * (118.0 + 54.0 * e)) - 0.5;
  float rnd = hash(grainGrid);

  vec2 randomDir = normalize(vec2(
    hash(grainGrid + 11.7) - 0.5,
    hash(grainGrid + 31.4) - 0.5
  ) + vec2(0.0001));

  float alignment = abs(dot(randomDir, field));
  float grainShape = smoothstep(0.26, 0.035, length(grainCell * vec2(0.55, 1.85)));
  float grainMask = smoothstep(0.42 - 0.16 * e, 1.0, rnd + alignment * 0.45 + cluster * 0.38);

  float grains = grainShape * grainMask;

  float lines = (f1 + f2) * (0.35 + 0.80 * cluster);
  float sparkle = smoothstep(0.975 - 0.025 * e, 1.0, hash(grainGrid + floor(t * 18.0))) * grains;

  vec3 deep = vec3(0.030, 0.028, 0.045);
  vec3 dust = vec3(0.42, 0.42, 0.50);
  vec3 fieldBlue = vec3(0.18, 0.42, 0.68);
  vec3 hot = vec3(0.92, 0.96, 1.00);

    float shimmerField = fbm(q * 2.8 + field * 0.9 + vec2(t * 0.42, -t * 0.31));
  float shimmerMask = smoothstep(0.74, 0.94, shimmerField + cluster * 0.18 + alignment * 0.10);
  float shimmerPhase = fbm(q * 5.6 + vec2(t * 0.9, t * 0.37));
  vec3 shimmer = oceanIridescence(shimmerPhase);

  vec3 col = deep;
  col += fieldBlue * lines * (0.35 + 0.45 * e);
  col += dust * grains * (0.42 + 0.72 * cluster);
  col += shimmer * grains * shimmerMask * (0.18 + 0.22 * e);
  col += hot * sparkle * (0.38 + 0.60 * e);

  float flux = smoothstep(0.68, 0.98, fbm(q * 4.4 + field * 0.6 + vec2(t * 0.6, -t)));
  col += vec3(0.30, 0.55, 0.86) * flux * lines * (0.12 + 0.26 * e);

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.56 + 0.72 * vig;

  col *= 0.88 + 0.30 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createMagneticParticulateTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "magnetic-particulate",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);
      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uEnergy, opts.audio.energy);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindVertexArray(null);
      gl.useProgram(null);
    },

    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf);
      if (tri?.vao) gl.deleteVertexArray(tri.vao);
      tri = null;

      if (program) gl.deleteProgram(program);
      program = null;
    },
  };
}
