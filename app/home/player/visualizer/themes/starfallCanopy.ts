// web/app/home/player/visualizer/themes/starfallCanopy.ts
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

// Perpetual Starfall Canopy (dense parallax particle rain)
// Tuned for inline-first: derivative AA, slightly fatter stars at low internal res,
// and fewer “single-pixel white spikes” so SCREEN siphons stay classy.
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

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(n, hash12(p + n + 17.7));
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.72, -1.12, 1.12, 1.72) * p;
    a *= 0.5;
  }
  return v;
}

float aaCircle(float dist, float radius) {
  // derivative-based AA in distance space
  float w = fwidth(dist) + 1e-5;
  return 1.0 - smoothstep(radius - w, radius + w, dist);
}

float starCell(vec2 px, float density, float t, float speed, float sizePx, float layerSeed) {
  // px in pixel space
  vec2 g = px / density;
  vec2 i = floor(g);
  vec2 f = fract(g);

  // one “primary” star per cell
  vec2 r = hash22(i + layerSeed);
  vec2 pos = r;

  // fall + wind shear (mid)
  float wind = (uMid - 0.5) * 2.0;
  pos.y = fract(pos.y + t * speed + r.x * 0.11);
  pos.x = fract(pos.x + t * speed * 0.16 * wind + r.y * 0.07);

  vec2 d = f - pos;
  d.x *= uRes.x / uRes.y;
  float dist = length(d);

  // size: slightly larger at low internal res (inline friendliness)
  float resMin = min(uRes.x, uRes.y);
  float resBoost = clamp((480.0 / max(240.0, resMin)), 0.9, 1.6);
  float rad = (sizePx * resBoost) / density;

  float core = aaCircle(dist, rad);

  // controlled twinkle (avoid hard spikes)
  float tw = 0.78 + 0.22 * sin(t * (7.0 + 5.0*uTreble) + r.x*6.28318);
  float sparkle = pow(hash12(i + layerSeed + floor(t*8.0)), 4.0); // gentler than exponent 10+
  float inten = core * tw * (0.55 + 0.85*uEnergy) * mix(0.85, 1.25, sparkle * uTreble);

  // add a faint halo so stars survive downscale without flicker
  float halo = aaCircle(dist, rad * 2.2) * 0.12 * (0.5 + 0.5*uTreble);
  return inten + halo;
}

void main() {
  vec2 uv = vUv;
  vec2 px = uv * uRes;

  float t = uTime * 0.20;

  // dark velvet base (SCREEN-friendly)
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);
  float haze = fbm(p * 1.6 + vec2(0.0, t*0.22));
  haze = smoothstep(0.18, 0.95, haze);

  vec3 velvet = mix(vec3(0.010, 0.010, 0.016), vec3(0.045, 0.050, 0.080), haze);
  velvet *= 0.75 + 0.35 * (0.25*uBass + 0.35*uMid + 0.40*uTreble);

  // layers (near layers larger + faster)
  float s0 = starCell(px, 30.0, t, 0.55 + 0.30*uBass, 1.2,  3.0);
  float s1 = starCell(px, 22.0, t, 0.80 + 0.40*uBass, 1.8, 19.0);
  float s2 = starCell(px, 16.0, t, 1.10 + 0.55*uBass, 2.4, 41.0);
  float s3 = starCell(px, 12.0, t, 1.40 + 0.70*uBass, 3.1, 73.0);

  // faint streak threads to increase perceived density without “white noise”
  float streak = fbm(p * 5.0 + vec2(t*0.85, -t*0.55));
  streak = smoothstep(0.74, 0.985, streak) * (0.05 + 0.09*uTreble);

  // color: cold canopy with occasional warm glints
  vec3 cold = vec3(0.78, 0.86, 1.00);
  vec3 warm = vec3(1.00, 0.86, 0.70);
  float warmMix = smoothstep(0.35, 0.95, fbm(p*2.2 + 7.1)) * (0.12 + 0.32*uMid);
  vec3 starCol = mix(cold, warm, warmMix);

  float stars = (0.45*s0 + 0.55*s1 + 0.80*s2 + 1.05*s3);

  vec3 col = velvet;
  col += starCol * stars;
  col += cold * streak;

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.90 + 0.28 * uEnergy;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function createStarfallCanopyTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null
  let uBass: WebGLUniformLocation | null = null
  let uMid: WebGLUniformLocation | null = null
  let uTreble: WebGLUniformLocation | null = null

  return {
    name: 'starfall-canopy',
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
