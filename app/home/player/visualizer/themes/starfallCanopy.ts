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
// Implementation note: “millions” is achieved via procedural, tile-based star sampling across
// multiple depth layers. Each layer contributes many stars via cheap hash-on-grid.
// A faint fog/base ensures no empty pixels.
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
  // stable, cheap hash
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

float starLayer(vec2 uv, float t, float density, float speed, float twinkle, float sizePx) {
  // uv in 0..1, but we operate in screen-ish coords for stable point sizing
  vec2 px = uv * uRes;
  // tile grid (smaller cell = more stars)
  vec2 g = px / density;
  vec2 i = floor(g);
  vec2 f = fract(g);

  // one star per cell; random offset within cell
  vec2 r = hash22(i);
  vec2 pos = r;

  // falling + wind shear: y increases over time, x shifts with mid
  float wind = (uMid - 0.5) * 2.0;
  pos.y = fract(pos.y + t * speed + r.x * 0.13);
  pos.x = fract(pos.x + t * speed * 0.18 * wind + r.y * 0.07);

  // distance to star
  vec2 d = (f - pos);
  // account for aspect so stars aren't stretched
  d.x *= uRes.x / uRes.y;

  float dist = length(d);

  // size in pixels, mapped into cell space
  float s = (sizePx / density) * (0.9 + 0.7 * uTreble);
  float core = smoothstep(s, 0.0, dist);

  // flare-ish sparkle on treble
  float sparkle = pow(hash12(i + floor(t*10.0)), 10.0);
  sparkle = mix(0.2, 1.0, sparkle);
  float tw = 0.75 + 0.25 * sin(t*twinkle + r.x*6.28318);
  float intensity = core * tw * (0.6 + 0.8 * uEnergy) * mix(0.7, 1.35, sparkle * uTreble);

  return intensity;
}

void main() {
  vec2 uv = vUv;

  float t = uTime * 0.20;

  // Base “cosmic velvet” so there are no empty pixels.
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);
  float haze = fbm(p * 1.6 + vec2(0.0, t*0.22));
  haze = smoothstep(0.15, 0.95, haze);

  vec3 velvet = mix(vec3(0.015, 0.012, 0.020), vec3(0.055, 0.060, 0.090), haze);
  velvet *= 0.75 + 0.35 * (0.25*uBass + 0.35*uMid + 0.40*uTreble);

  // Layered parallax star canopy (near layers have larger, brighter stars).
  float s0 = starLayer(uv, t, 28.0, 0.55 + 0.35*uBass, 7.0, 1.1);
  float s1 = starLayer(uv, t, 20.0, 0.75 + 0.45*uBass, 8.5, 1.6);
  float s2 = starLayer(uv, t, 14.0, 1.05 + 0.60*uBass, 10.0, 2.1);
  float s3 = starLayer(uv, t, 10.0, 1.40 + 0.80*uBass, 12.0, 2.8);

  // Add a faint “meteor thread” texture to increase perceived density.
  float streak = fbm(p * 5.5 + vec2(t*0.9, -t*0.6));
  streak = smoothstep(0.70, 0.98, streak) * (0.06 + 0.10*uTreble);

  // Color: starfall can be colder with occasional warm glints.
  vec3 cold = vec3(0.80, 0.88, 1.00);
  vec3 warm = vec3(1.00, 0.86, 0.70);

  float stars = (0.45*s0 + 0.55*s1 + 0.80*s2 + 1.10*s3);
  float warmMix = smoothstep(0.35, 0.95, fbm(p*2.2 + 7.1)) * (0.15 + 0.30*uMid);
  vec3 starCol = mix(cold, warm, warmMix);

  vec3 col = velvet;
  col += starCol * stars;
  col += cold * streak;

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  // energy breathing
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
