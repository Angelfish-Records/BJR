// web/app/home/player/visualizer/themes/dreamFog.ts
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

// Topographic Dream Fog (living contour map)
// Inline-tuned: derivative AA for isobands/contours so it stays stable as dprScale adapts.
// Also keeps a darker floor so SCREEN siphons remain clean and “premium”.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;

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
    p = mat2(1.71, -1.13, 1.13, 1.71) * p;
    a *= 0.5;
  }
  return v;
}

float sliceField(vec2 p, float z) {
  vec2 q = p;
  q += 0.20 * vec2(sin(z*1.7), cos(z*1.3));
  float a = fbm(q * 1.15 + vec2(z*0.35, -z*0.28));
  float b = fbm(q * 2.35 - vec2(z*0.22, z*0.31));
  return 0.58*a + 0.42*b;
}

float aaBand(float f, float w) {
  // f in [0,1], center around 0.5 band
  float d = abs(f - 0.5);
  float fw = fwidth(f) + 1e-5;
  // band width w around center
  return 1.0 - smoothstep(w - fw, w + fw, d);
}

float aaContour(float f) {
  // line at boundaries where f ~ 0 or f ~ 1 => d = min(f, 1-f)
  float d = min(f, 1.0 - f);
  float fw = fwidth(d) + 1e-5;
  return 1.0 - smoothstep(0.0, 0.060 + fw, d);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float t = uTime * 0.07;

  // inline stability helper: widen effects slightly at low internal res
  float resMin = min(uRes.x, uRes.y);
  float soft = clamp((520.0 / max(240.0, resMin)), 0.9, 1.7);

  // global drift (mid) + slow elevation (bass)
  vec2 drift = vec2(0.12, -0.10) * sin(t*0.75) + vec2(0.08, 0.06) * cos(t*0.52);
  vec2 q = p + drift * (0.30 + 0.70*uMid);

  // stack slices (fake volume)
  float acc = 0.0;
  float wsum = 0.0;
  float z0 = t * 1.4;

  // bass raises/lowers whole landmasses
  float lift = (uBass - 0.5) * 0.26 + (e - 0.5) * 0.10;

  for (int i = 0; i < 8; i++) {
    float fi = float(i);
    float z = z0 + fi * 0.55;
    float w = 1.0 / (1.0 + fi*0.55);
    float s = sliceField(q * (1.0 + 0.08*fi), z);
    acc += w * s;
    wsum += w;
  }
  float field = clamp(acc / wsum + lift, 0.0, 1.0);

  // erosion / river-like flow: warp by gradient surrogate (mid biases shear)
  float eps = 0.0025;
  float fx1 = sliceField(q + vec2(eps, 0.0), z0);
  float fx2 = sliceField(q - vec2(eps, 0.0), z0);
  float fy1 = sliceField(q + vec2(0.0, eps), z0);
  float fy2 = sliceField(q - vec2(0.0, eps), z0);
  vec2 grad = vec2(fx1 - fx2, fy1 - fy2) / (2.0*eps);
  q += vec2(grad.y, -grad.x) * (0.045 + 0.11*uMid);

  // local detail
  float detail = fbm(q * 3.2 + vec2(t*0.9, -t*0.7));
  field = clamp(0.82*field + 0.18*detail + 0.02*sin(t), 0.0, 1.0);

  // visualisation: isobands + contour lines with AA
  float freq = 9.0 + 10.0 * e;
  float v = field * freq;
  float f = fract(v);

  // band width: thicker at low res and with bass
  float bandW = (0.22 + 0.06*uBass) * soft;
  float bands = aaBand(f, bandW) * (0.55 + 0.35*e);

  // contours: treble adds chatter, but keep AA so it doesn't sparkle
  float lines = aaContour(f) * (0.10 + 0.18*e) * (0.75 + 0.55*uTreble);

  float chatter = fbm(q * 9.0 + vec2(-t*2.0, t*1.7));
  float edgeChatter = smoothstep(0.55, 0.95, chatter) * (0.04 + 0.10*uTreble);
  edgeChatter *= lines;

  // palette: dream map fog (dark floor for SCREEN siphons)
  vec3 deep = vec3(0.035, 0.040, 0.060);
  vec3 fog  = vec3(0.11, 0.14, 0.20);
  vec3 topo = vec3(0.55, 0.62, 0.85);
  vec3 hl   = vec3(0.96, 0.98, 1.00);

  float fogAmt = smoothstep(0.18, 0.92, field);
  vec3 col = mix(deep, fog, fogAmt);

  // bands tint
  col = mix(col, mix(col, topo, 0.45 + 0.25*fogAmt), bands);

  // contours
  col += hl * lines;
  col += hl * edgeChatter;

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22*e;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function createDreamFogTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null
  let uBass: WebGLUniformLocation | null = null
  let uMid: WebGLUniformLocation | null = null
  let uTreble: WebGLUniformLocation | null = null

  return {
    name: 'dream-fog',
    init(gl) {
      program = createProgram(gl, VS, FS)
      tri = makeFullscreenTriangle(gl)
      uRes = gl.getUniformLocation(program, 'uRes')
      uTime = gl.getUniformLocation(program, 'uTime')
      uEnergy = gl.getUniformLocation(program, 'uEnergy')
      uBass = gl.getUniformLocation(program, 'uBass')
      uMid = gl.getUniformLocation(program, 'uMid')
      uTreble = gl.getUniformLocation(program, 'uTreble')
    },
    render(gl, opts) {
      if (!program || !tri) return
      const bass = opts.audio.bass ?? opts.audio.energy
      const mid = opts.audio.mid ?? opts.audio.energy
      const treble = opts.audio.treble ?? opts.audio.energy

      gl.useProgram(program)
      gl.bindVertexArray(tri.vao)

      gl.uniform2f(uRes, opts.width, opts.height)
      gl.uniform1f(uTime, opts.time)
      gl.uniform1f(uEnergy, opts.audio.energy)
      gl.uniform1f(uBass, bass)
      gl.uniform1f(uMid, mid)
      gl.uniform1f(uTreble, treble)

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
