// web/app/home/player/visualizer/themes/nebula.ts
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
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 px = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // slow drift + curl-ish perturbation
  vec2 p = px;
  p += 0.15 * vec2(sin(t*3.0), cos(t*2.4));
  float n1 = fbm(p * 1.6 + t);
  float n2 = fbm(p * 3.2 - t*0.7);
  vec2 warp = vec2(n1 - 0.5, n2 - 0.5);
  p += warp * (0.55 + 0.35 * e);

  float cloud = fbm(p * 2.3 + vec2(0.0, t*1.3));
  cloud = smoothstep(0.25, 0.92, cloud);

  // stars
  float star = pow(noise(p*40.0 + t*2.0), 18.0);
  star *= 0.9 + 0.8 * e;

  // palette
  vec3 colA = vec3(0.22, 0.25, 0.55);
  vec3 colB = vec3(0.75, 0.62, 0.95);
  vec3 colC = vec3(0.10, 0.06, 0.12);

  vec3 neb = mix(colC, mix(colA, colB, cloud), cloud);
  neb += vec3(0.9, 0.95, 1.0) * star;

  // vignette
  float r = length(px);
  float vig = smoothstep(1.25, 0.25, r);
  neb *= 0.55 + 0.65 * vig;

  // energy “breathing”
  neb *= 0.92 + 0.25 * e;

  fragColor = vec4(neb, 1.0);
}
`

export function createNebulaTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null

  return {
    name: 'nebula',
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
