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

// Lidar Cathedral
// Procedural point-cloud architecture: scanned volumetric arches, voxel jitter, depth bands.
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

float hash3(vec3 p) {
  p = fract(p * vec3(123.34, 456.21, 789.17));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y * p.z);
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
    p = mat2(1.64, -1.18, 1.18, 1.64) * p;
    a *= 0.5;
  }

  return v;
}

float archField(vec2 p, float z, float t) {
  float aisle = abs(p.x);
  float height = p.y + 0.54;

  float arch = abs(length(vec2(aisle * 1.15, height * 0.82)) - (0.46 + 0.06 * sin(z * 3.0 + t)));
  float pillars = abs(fract((p.x + 0.5) * 5.0 + z * 0.35) - 0.5);
  float ribs = abs(fract((height + z * 0.28) * 7.0) - 0.5);

  float vaulted = smoothstep(0.18, 0.015, arch);
  float pillar = smoothstep(0.065, 0.010, pillars) * smoothstep(-0.62, 0.36, p.y);
  float rib = smoothstep(0.055, 0.010, ribs) * smoothstep(0.15, 0.02, arch);

  return max(vaulted, max(pillar * 0.8, rib * 0.65));
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec3 col = vec3(0.018, 0.022, 0.035);

  float scan = fract(uv.y * 58.0 - t * 2.6);
  float scanLine = smoothstep(0.035, 0.0, scan) * (0.18 + 0.28 * e);

  float total = 0.0;

  for (int i = 0; i < 9; i++) {
    float fi = float(i);
    float z = fi / 8.0;

    float depth = 0.18 + z * 1.55;
    vec2 q = p * (1.0 + depth * 0.82);

    q.y += 0.22 * z;
    q.x += 0.075 * sin(t * 1.3 + z * 4.2);
    q += 0.05 * vec2(
      fbm(q * 1.3 + vec2(t, z)),
      fbm(q * 1.3 + vec2(z * 7.0, -t))
    ) * (0.35 + 0.85 * e);

    float cathedral = archField(q, z, t);

    vec2 grid = floor((q + 1.0) * (72.0 + 34.0 * e));
    float rnd = hash(grid + floor(z * 31.0));
    float point = smoothstep(0.965 - 0.035 * e, 1.0, rnd);

    vec2 cell = fract((q + 1.0) * (72.0 + 34.0 * e)) - 0.5;
    float dotShape = smoothstep(0.15, 0.015, length(cell));

    float depthFade = exp(-z * 1.45);
    float hit = cathedral * point * dotShape * depthFade;

    float mist = cathedral * smoothstep(0.45, 0.95, fbm(q * 2.2 + z + t * 0.25)) * 0.045;

    total += hit + mist;

    vec3 nearCol = vec3(0.82, 0.92, 1.0);
    vec3 farCol = vec3(0.18, 0.42, 0.70);
    vec3 layerCol = mix(nearCol, farCol, z);

    col += layerCol * hit * (1.15 + 1.25 * e);
    col += vec3(0.15, 0.36, 0.62) * mist;
  }

  float floorGlow = smoothstep(0.06, 0.0, abs(p.y + 0.53)) * smoothstep(0.95, 0.0, abs(p.x));
  col += vec3(0.16, 0.38, 0.62) * floorGlow * (0.12 + 0.28 * e);

  col += vec3(0.65, 0.86, 1.0) * scanLine * smoothstep(0.05, 0.65, total);

  float r = length(p);
  float vig = smoothstep(1.40, 0.22, r);
  col *= 0.52 + 0.78 * vig;

  col *= 0.86 + 0.32 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createLidarCathedralTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "lidar-cathedral",

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