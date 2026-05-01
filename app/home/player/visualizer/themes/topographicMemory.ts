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

// Topographic Memory
// Living contour-map terrain: geological drift, height bands, ridge shimmer.
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
    p = mat2(1.58, -1.21, 1.21, 1.58) * p;
    a *= 0.5;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.58;
  float w = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * w);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;

    w *= 2.08;
    a *= 0.54;
    p = mat2(0.82, -0.57, 0.57, 0.82) * p;
  }

  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.075;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 drift = vec2(t * 0.28, -t * 0.18);
  vec2 q = p * (1.28 + 0.10 * sin(t * 0.5));
  q += 0.12 * vec2(
    fbm(p * 0.9 + vec2(t * 0.45, 1.7)),
    fbm(p * 0.9 + vec2(5.4, -t * 0.38))
  ) * (0.45 + 0.85 * e);

  float h1 = fbm(q * 1.45 + drift);
  float h2 = ridged(q * 1.15 - drift * 0.75);
  float h3 = fbm(q * 3.15 + vec2(-t * 0.6, t * 0.35));

  float height = h1 * 0.58 + h2 * 0.34 + h3 * 0.08;
  height = smoothstep(0.16, 1.02, height);

  float contourCount = 12.0 + 10.0 * e;
  float contourPhase = fract(height * contourCount + t * 0.22);
  float line = 1.0 - smoothstep(0.015, 0.075 - 0.020 * e, abs(contourPhase - 0.5));

  float majorPhase = fract(height * 4.0 + t * 0.08);
  float majorLine = 1.0 - smoothstep(0.018, 0.050, abs(majorPhase - 0.5));

  float eps = 0.0025;
  float hx = fbm((q + vec2(eps, 0.0)) * 1.45 + drift) - fbm((q - vec2(eps, 0.0)) * 1.45 + drift);
  float hy = fbm((q + vec2(0.0, eps)) * 1.45 + drift) - fbm((q - vec2(0.0, eps)) * 1.45 + drift);
  float slope = smoothstep(0.05, 0.36, length(vec2(hx, hy)) / (2.0 * eps));

  float basin = smoothstep(0.12, 0.58, height);
  float summit = smoothstep(0.58, 0.95, height);

  vec3 deep = vec3(0.035, 0.038, 0.060);
  vec3 low = vec3(0.080, 0.120, 0.145);
  vec3 mid = vec3(0.245, 0.205, 0.230);
  vec3 high = vec3(0.690, 0.650, 0.800);
  vec3 snow = vec3(0.925, 0.940, 1.000);

  vec3 col = mix(deep, low, basin);
  col = mix(col, mid, smoothstep(0.30, 0.72, height));
  col = mix(col, high, summit * 0.55);
  col = mix(col, snow, smoothstep(0.82, 1.00, height) * 0.45);

  col += vec3(0.70, 0.82, 1.00) * line * (0.18 + 0.18 * slope + 0.20 * e);
  col += vec3(0.95, 0.96, 1.00) * majorLine * (0.12 + 0.16 * e);

  float shimmer = smoothstep(0.72, 0.98, fbm(q * 5.5 + vec2(t * 1.4, -t)));
  col += vec3(0.50, 0.72, 1.0) * shimmer * slope * (0.030 + 0.085 * e);

  float mapGridX = 1.0 - smoothstep(0.004, 0.012, abs(fract((p.x + 1.0) * 5.0) - 0.5));
  float mapGridY = 1.0 - smoothstep(0.004, 0.012, abs(fract((p.y + 1.0) * 5.0) - 0.5));
  float grid = max(mapGridX, mapGridY) * 0.025;
  col += vec3(0.55, 0.65, 0.80) * grid;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.72 * vig;

  col *= 0.90 + 0.24 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createTopographicMemoryTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "topographic-memory",

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