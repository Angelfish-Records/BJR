// web/app/home/player/visualizer/themes/latticeWave.ts
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

// Living Lattice Wave (deforming 3D mesh carpet)
// Rendered as a continuous procedural lattice with shading from a heightfield.
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
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.72, -1.11, 1.11, 1.72) * p;
    a *= 0.5;
  }
  return v;
}

float heightField(vec2 p, float t, float e) {
  // deep bass-like waves + mids interference + fine chatter
  float h = 0.0;
  h += 0.65 * sin(p.x * 1.4 + t*1.0) * sin(p.y * 1.2 - t*0.8);
  h += 0.40 * sin((p.x + p.y) * 1.7 + t*0.6);
  h += 0.25 * sin((p.x*2.4 - p.y*2.1) - t*0.9);
  h *= (0.22 + 0.38 * e);
  h += (0.08 + 0.12 * e) * (fbm(p*2.2 + vec2(t*0.35, -t*0.28)) - 0.5);
  return h;
}

vec3 shade(vec2 p, float h) {
  // normal from height gradient
  float eps = 0.003;
  float hx = h - heightField(p - vec2(eps, 0.0), uTime*0.12, clamp(uEnergy,0.0,1.0));
  float hy = h - heightField(p - vec2(0.0, eps), uTime*0.12, clamp(uEnergy,0.0,1.0));
  vec3 n = normalize(vec3(hx, hy, eps*6.0));

  vec3 lightDir = normalize(vec3(-0.35, 0.45, 0.85));
  float diff = clamp(dot(n, lightDir), 0.0, 1.0);

  vec3 viewDir = normalize(vec3(0.0, 0.0, 1.0));
  vec3 hvec = normalize(lightDir + viewDir);
  float spec = pow(clamp(dot(n, hvec), 0.0, 1.0), 48.0);

  vec3 baseA = vec3(0.06, 0.07, 0.12);
  vec3 baseB = vec3(0.20, 0.26, 0.55);
  return mix(baseA, baseB, 0.5 + 0.5 * diff) + vec3(0.9, 0.95, 1.0) * spec * 0.35;
}

float lattice(vec2 p, float scale, float thickness) {
  // crisp grid lines in both axes; stays full coverage
  vec2 g = fract(p * scale) - 0.5;
  vec2 a = abs(g);
  float line = min(a.x, a.y);
  return smoothstep(thickness, 0.0, line);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float t = uTime * 0.12;

  // global drift so the mesh “travels”
  vec2 drift = vec2(0.10, -0.08) * sin(t*0.35) + vec2(0.06, 0.05) * cos(t*0.22);
  vec2 q = p + drift * (0.35 + 0.55 * e);

  // compute height + warp the lattice slightly by slope
  float h = heightField(q, t, e);
  vec2 warp = vec2(
    fbm(q*1.4 + vec2(t*0.2, -t*0.15)) - 0.5,
    fbm(q*1.4 + vec2(-t*0.17, t*0.23)) - 0.5
  );
  q += warp * (0.10 + 0.18 * e);

  // multi-scale lattice (mesh carpet)
  float l1 = lattice(q + h*0.25, 8.0, 0.060 - 0.015*e);
  float l2 = lattice(q - h*0.15, 16.0, 0.045 - 0.012*e);
  float l3 = lattice(q, 32.0, 0.030 - 0.010*e);
  float grid = clamp(0.55*l1 + 0.35*l2 + 0.20*l3, 0.0, 1.0);

  // shading from height
  vec3 col = shade(q, h);

  // weave: brighten grid lines, keep background alive with subtle texture
  float tex = fbm(q*3.2 + vec2(t*0.6, -t*0.5));
  col *= 0.88 + 0.18 * tex;

  col = mix(col, col + vec3(0.55, 0.60, 0.95), grid * (0.22 + 0.35*e));

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22 * e;

  fragColor = vec4(col, 1.0);
}
`

export function createLatticeWaveTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null

  return {
    name: 'lattice-wave',
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
