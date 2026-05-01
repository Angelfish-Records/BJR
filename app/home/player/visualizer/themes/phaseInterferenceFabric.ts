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

// Phase Interference Fabric
// Standing-wave moiré cloth: nodal lines, phase drift, spectral shimmer.
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

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.67, -1.13, 1.13, 1.67) * p;
    a *= 0.5;
  }

  return v;
}

vec3 palette(float x) {
  vec3 a = vec3(0.48, 0.46, 0.58);
  vec3 b = vec3(0.44, 0.36, 0.42);
  vec3 c = vec3(1.00, 0.86, 0.72);
  vec3 d = vec3(0.08, 0.26, 0.42);

  return a + b * cos(6.28318 * (c * x + d));
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.11;
  float e = clamp(uEnergy, 0.0, 1.0);

  float warpA = fbm(p * 1.35 + vec2(t * 0.55, -t * 0.24));
  float warpB = fbm(p * 1.35 + vec2(8.0 - t * 0.22, t * 0.48));

  vec2 q = p;
  q += 0.10 * vec2(warpA - 0.5, warpB - 0.5) * (0.65 + 1.15 * e);

  float bassScale = 7.5 - 2.2 * e;
  float midScale = 11.0 + 2.6 * sin(t * 0.6);

  float w1 = sin((q.x * bassScale + q.y * 1.4) + t * 2.1);
  float w2 = sin((q.y * (bassScale * 0.92) - q.x * 1.1) - t * 1.7);
  float w3 = sin(dot(q, normalize(vec2(0.74, 0.67))) * midScale + t * 1.15);
  float w4 = sin(dot(q, normalize(vec2(-0.58, 0.82))) * (midScale * 1.17) - t * 0.92);

  float field = (w1 + w2 + w3 + w4) * 0.25;

  float fine = sin((q.x + q.y) * (31.0 + 20.0 * e) + t * 4.0);
  field += fine * (0.035 + 0.070 * e);

  float nodes = 1.0 - smoothstep(0.015, 0.18 + 0.05 * e, abs(field));
  float bands = smoothstep(-0.78, 0.88, field);

  float phase = fract(
    0.35 * field
    + 0.25 * warpA
    + 0.22 * warpB
    + 0.12 * sin(t * 0.8)
  );

  vec3 deep = vec3(0.030, 0.025, 0.052);
  vec3 cloth = vec3(0.105, 0.105, 0.170);
  vec3 spectral = palette(phase);

  vec3 col = mix(deep, cloth, smoothstep(-0.65, 0.85, field));
  col = mix(col, spectral, 0.34 + 0.32 * bands);

  col += vec3(0.82, 0.88, 1.0) * nodes * (0.22 + 0.34 * e);

  float threadX = smoothstep(0.92, 1.0, sin(q.x * 48.0 + warpA * 2.0) * 0.5 + 0.5);
  float threadY = smoothstep(0.92, 1.0, sin(q.y * 44.0 + warpB * 2.0) * 0.5 + 0.5);
  float threads = (threadX + threadY) * 0.5 * (0.045 + 0.085 * e);
  col += vec3(0.7, 0.78, 1.0) * threads;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.56 + 0.72 * vig;

  col *= 0.90 + 0.28 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createPhaseInterferenceFabricTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "phase-interference-fabric",

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