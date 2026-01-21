// web/app/home/player/visualizer/themes/mhdSilk.ts
import type {Theme} from '../types'
import {createProgram, makeFullscreenTriangle} from '../gl'

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

// Magnetohydrodynamic Silk (living plasma cloth)
// Field-first: curl-ish flow + advected ridged fbm “filaments” + aurora palette.
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
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    a *= 0.5;
  }
  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.6;
  float w = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = noise(p * w);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;
    w *= 2.1;
    a *= 0.55;
    p = mat2(0.84, -0.54, 0.54, 0.84) * p;
  }
  return v;
}

// 2D "curl noise" via gradient of fbm potential, rotated 90 degrees
vec2 curl(vec2 p) {
  float eps = 0.0025;
  float n1 = fbm(p + vec2(0.0, eps));
  float n2 = fbm(p - vec2(0.0, eps));
  float n3 = fbm(p + vec2(eps, 0.0));
  float n4 = fbm(p - vec2(eps, 0.0));
  vec2 grad = vec2(n3 - n4, n1 - n2) / (2.0 * eps);
  return vec2(grad.y, -grad.x);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // “magnetic lines”: large-scale curl field
  vec2 q = p * 1.05;
  q += 0.12 * vec2(sin(t*2.1), cos(t*1.7));
  vec2 v = curl(q * 1.35 + t);

  // advection: integrate a few steps for a cloth-like drift
  vec2 a = p;
  float adv = 0.28 + 0.35 * e;
  for (int i = 0; i < 4; i++) {
    vec2 c = curl(a * 1.25 + vec2(t, -t*0.7));
    a += c * adv * 0.08;
    adv *= 0.82;
  }

  // layered silk: filaments + body density
  float body = fbm(a * 1.8 + vec2(0.0, t*1.3));
  body = smoothstep(0.22, 0.92, body);

  // filamentation: ridged noise stretched along flow
  vec2 flowDir = normalize(v + vec2(0.0001));
  vec2 stretch = vec2(flowDir.x * 1.6 + 0.2, flowDir.y * 1.6 - 0.2);
  float fil = ridged(a * mat2(stretch.x, -stretch.y, stretch.y, stretch.x) * 2.4 + t*0.5);
  fil = smoothstep(0.35, 0.95, fil);
  fil *= 0.35 + 0.85 * e;

  // aurora/plasma palette
  vec3 deep = vec3(0.05, 0.04, 0.10);
  vec3 a1   = vec3(0.10, 0.35, 0.50);
  vec3 a2   = vec3(0.65, 0.55, 0.95);
  vec3 a3   = vec3(0.90, 0.95, 1.00);

  float glow = body * (0.65 + 0.35 * fbm(a * 3.2 - t));
  vec3 col = mix(deep, mix(a1, a2, glow), glow);
  col += a3 * fil * (0.25 + 0.35 * body);

  // subtle "field lines" sheen
  float lines = fbm(a * 6.0 + vec2(t*0.8, -t*0.6));
  lines = smoothstep(0.62, 0.95, lines) * (0.10 + 0.18 * e);
  col += vec3(0.9, 0.95, 1.0) * lines;

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  // energy “breath”
  col *= 0.90 + 0.30 * e;

  fragColor = vec4(col, 1.0);
}
`

export function createMHDSilkTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null

  return {
    name: 'mhd-silk',
    init(gl) {
      program = createProgram(gl, VS, FS)
      tri = makeFullscreenTriangle(gl)
      uRes = gl.getUniformLocation(program, 'uRes')
      uTime = gl.getUniformLocation(program, 'uTime')
      uEnergy = gl.getUniformLocation(program, 'uEnergy')
    },
    render(gl, opts) {
      if (!program || !tri) return
      gl.useProgram(program)
      gl.bindVertexArray(tri.vao)

      gl.uniform2f(uRes, opts.width, opts.height)
      gl.uniform1f(uTime, opts.time)
      gl.uniform1f(uEnergy, opts.audio.energy)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindVertexArray(null)
      gl.useProgram(null)
    },
    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf)
      if (tri?.vao) gl.deleteVertexArray(tri.vao)
      tri = null
      if (program) gl.deleteProgram(program)
      program = null
    },
  }
}
