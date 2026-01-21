// web/app/home/player/visualizer/themes/pressureGlass.ts
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

// Chromatic Pressure Glass (liquid crystal under stress)
// Field-first: domain-warped UVs + pseudo-normals + thin-film interference palette.
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
    p = mat2(1.74, -1.12, 1.12, 1.74) * p;
    a *= 0.5;
  }
  return v;
}

vec3 thinFilm(float x) {
  // x in [0,1] -> interference-ish RGB
  float r = 0.5 + 0.5 * cos(6.28318 * (x + 0.00));
  float g = 0.5 + 0.5 * cos(6.28318 * (x + 0.33));
  float b = 0.5 + 0.5 * cos(6.28318 * (x + 0.66));
  return vec3(r, g, b);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.12;
  float e = clamp(uEnergy, 0.0, 1.0);

  // pressure scalar field: smooth, global, section-like
  vec2 q = p * (1.35 + 0.25 * sin(t*0.3));
  q += 0.18 * vec2(sin(t*1.2), cos(t*0.9));
  float pressure = fbm(q * 1.2 + vec2(0.0, t*0.9));
  pressure = smoothstep(0.20, 0.95, pressure);

  // internal stress gradients -> pseudo normals (from pressure field)
  float eps = 0.0025;
  float px1 = fbm((q + vec2(eps, 0.0)) * 1.2 + vec2(0.0, t*0.9));
  float px2 = fbm((q - vec2(eps, 0.0)) * 1.2 + vec2(0.0, t*0.9));
  float py1 = fbm((q + vec2(0.0, eps)) * 1.2 + vec2(0.0, t*0.9));
  float py2 = fbm((q - vec2(0.0, eps)) * 1.2 + vec2(0.0, t*0.9));
  vec2 grad = vec2(px1 - px2, py1 - py2) / (2.0 * eps);

  // audio: bass=bulge, mids=drift, highs=micro-ripple (approx via e shaping)
  float bulge = (0.18 + 0.22 * e) * (pressure - 0.5);
  vec2 drift = vec2(0.06, -0.05) * sin(t*0.7 + pressure*2.0) * (0.35 + 0.65 * e);
  vec2 micro = 0.018 * grad * (0.15 + 0.85 * e) * (0.6 + 0.4 * sin(t*3.0));

  // domain warp
  vec2 wuv = p + drift + micro + grad * bulge;

  // refraction-like sampling of a secondary field
  float glass = fbm(wuv * 2.2 + vec2(t*0.35, -t*0.22));
  float bands = fbm(wuv * 4.0 - vec2(t*0.18, t*0.26));

  // thin-film interference: combine stress + bands
  float phase = fract(0.55 * glass + 0.45 * bands + 0.12 * length(grad) + 0.15 * sin(t*0.6));
  phase = fract(phase + 0.10 * e);

  vec3 iridescence = thinFilm(phase);

  // “glass” body tint + highlights
  vec3 base = mix(vec3(0.04, 0.05, 0.08), vec3(0.10, 0.12, 0.18), glass);
  vec3 col = mix(base, iridescence, 0.55 + 0.30 * pressure);

  // spec sheen from gradient magnitude
  float sheen = smoothstep(0.10, 0.55, length(grad));
  col += vec3(0.9, 0.95, 1.0) * sheen * (0.12 + 0.20 * e);

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22 * e;

  fragColor = vec4(col, 1.0);
}
`

export function createPressureGlassTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null

  return {
    name: 'pressure-glass',
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
