// web/app/home/player/visualizer/themes/magneticParticulate.ts
// Magnetic particulate with space-time blanket compression: radial lensing, bubbles, depressions, stable texture.
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

float well(vec2 p, vec2 c, float radius, float strength) {
  float d = length(p - c) / radius;
  return strength * exp(-d * d * 2.15);
}

float blanketHeight(vec2 p, float t, float e) {
  vec2 c0 = vec2(
    0.18 * sin(t * 0.73),
    0.13 * cos(t * 0.61)
  );

  vec2 c1 = vec2(
    0.48 * sin(t * 0.31 + 1.7),
    0.32 * cos(t * 0.39 + 0.8)
  );

  vec2 c2 = vec2(
    0.38 * sin(t * 0.47 + 4.1),
    0.42 * cos(t * 0.35 + 2.9)
  );

  float pulse = 0.65 + 0.35 * sin(t * 2.2 + e * 2.8);

  float h = 0.0;
  h -= well(p, c0, 0.48, 0.46 + 0.58 * e) * pulse;
  h += well(p, c1, 0.34, 0.18 + 0.34 * e);
  h -= well(p, c2, 0.28, 0.13 + 0.23 * e);

  h += 0.055 * fbm(p * 2.5 + vec2(t * 0.12, -t * 0.08));
  return h;
}

vec2 lensBlanket(vec2 p, float t, float e) {
  float h = blanketHeight(p, t, e);

  float eps = 0.012;
  float hx = blanketHeight(p + vec2(eps, 0.0), t, e) - blanketHeight(p - vec2(eps, 0.0), t, e);
  float hy = blanketHeight(p + vec2(0.0, eps), t, e) - blanketHeight(p - vec2(0.0, eps), t, e);
  vec2 grad = vec2(hx, hy) / (2.0 * eps);

  float breathingZoom = 1.0 + 0.025 * sin(t * 1.7) + 0.075 * e;
  vec2 warped = p * breathingZoom;

  // This is the core change: audio bends the coordinate fabric locally instead
  // of shoving the whole canvas sideways.
  warped -= grad * (0.18 + 0.22 * e);

  // Subtle circular shear gives the “Simpsons 3D fabric” sag without nausea.
  float r = length(p);
  vec2 tangent = vec2(-p.y, p.x) / max(r, 0.001);
  warped += tangent * h * (0.035 + 0.055 * e);

  return warped;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float eRaw = clamp(uEnergy, 0.0, 1.0);
  float e = smoothstep(0.02, 0.92, eRaw);

  float h = blanketHeight(p, t, e);
  vec2 q = lensBlanket(p, t, e);

  // Keep turbulence slow and local. No large audio-scaled translation.
  q += 0.045 * vec2(
    fbm(p * 1.35 + vec2(t * 0.45, -t * 0.18)),
    fbm(p * 1.35 + vec2(7.2 - t * 0.16, t * 0.28))
  );

  vec2 field = curl(q * 1.35 + vec2(t * 0.35, -t * 0.18));

  float basin = fbm(q * 1.1 + vec2(-t * 0.22, t * 0.16));
  float cluster = smoothstep(0.32 - 0.08 * e, 0.92, basin);

  float compression = smoothstep(-0.52, -0.04, -h);
  float expansion = smoothstep(0.04, 0.34, h);

  float f1 = filament(q + field * 0.05, field, 13.0 + 6.0 * e + 5.0 * compression);
  float f2 = filament(q * 1.35 - field * 0.08, field, 22.0 + 10.0 * e + 7.0 * compression) * 0.55;

  float grainScale = 118.0 + 34.0 * e + 34.0 * compression - 18.0 * expansion;
  vec2 grainGrid = floor((q + 1.2) * grainScale);
  vec2 grainCell = fract((q + 1.2) * grainScale) - 0.5;
  float rnd = hash(grainGrid);

  vec2 randomDir = normalize(vec2(
    hash(grainGrid + 11.7) - 0.5,
    hash(grainGrid + 31.4) - 0.5
  ) + vec2(0.0001));

  float alignment = abs(dot(randomDir, field));
  float grainElongation = 1.65 + 0.55 * compression;
  float grainShape = smoothstep(0.26, 0.035, length(grainCell * vec2(0.55, grainElongation)));
  float grainMask = smoothstep(
    0.42 - 0.12 * e - 0.10 * compression,
    1.0,
    rnd + alignment * 0.45 + cluster * 0.38
  );

  float grains = grainShape * grainMask;

  float lines = (f1 + f2) * (0.35 + 0.80 * cluster + 0.42 * compression);
  float sparkle = smoothstep(0.982 - 0.020 * e, 1.0, hash(grainGrid + floor(t * 12.0))) * grains;

  float eps = 0.01;
  float hx = blanketHeight(p + vec2(eps, 0.0), t, e) - blanketHeight(p - vec2(eps, 0.0), t, e);
  float hy = blanketHeight(p + vec2(0.0, eps), t, e) - blanketHeight(p - vec2(0.0, eps), t, e);
  vec3 normal = normalize(vec3(-hx * 4.4, -hy * 4.4, 1.0));

  vec3 lightDir = normalize(vec3(-0.45, 0.36, 0.82));
  float fabricLight = clamp(dot(normal, lightDir), 0.0, 1.0);
  float rim = pow(1.0 - clamp(normal.z, 0.0, 1.0), 1.7);

  vec3 deep = vec3(0.026, 0.024, 0.040);
  vec3 dust = vec3(0.42, 0.42, 0.50);
  vec3 fieldBlue = vec3(0.16, 0.39, 0.68);
  vec3 pressureBlue = vec3(0.25, 0.58, 0.95);
  vec3 hot = vec3(0.92, 0.96, 1.00);

  vec3 col = deep;
  col += fieldBlue * lines * (0.35 + 0.36 * e);
  col += dust * grains * (0.40 + 0.66 * cluster + 0.30 * compression);
  col += hot * sparkle * (0.26 + 0.45 * e);

  float flux = smoothstep(0.68, 0.98, fbm(q * 4.4 + field * 0.6 + vec2(t * 0.6, -t)));
  col += pressureBlue * flux * lines * (0.10 + 0.20 * e + 0.22 * compression);

  col *= 0.72 + 0.42 * fabricLight;
  col += pressureBlue * rim * (0.09 + 0.22 * e) * (0.25 + compression);
  col += vec3(0.12, 0.18, 0.28) * expansion * 0.14;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.56 + 0.72 * vig;

  col *= 0.90 + 0.22 * e;

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