// web/app/home/player/visualizer/themes/meaningLeak.ts
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

// Recursive Salience Field (“Meaning Leak”)
// Single-pass, full-coverage, SCREEN-siphon-friendly.
// Baseline mode when audio is idle; smoothly transitions into salience/halo mode on playback.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
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
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.71, -1.13, 1.13, 1.71) * p;
    a *= 0.5;
  }
  return v;
}

// curl-ish flow from fbm
vec2 flow(vec2 p, float t) {
  float a = fbm(p*1.25 + vec2( t*0.18, -t*0.14));
  float b = fbm(p*1.25 + vec2(-t*0.12,  t*0.20));
  vec2 g = vec2(a - 0.5, b - 0.5);
  vec2 v = vec2(g.y, -g.x);
  v += 0.30 * vec2(sin(t*0.11), cos(t*0.09));
  return v;
}

// soft contrast curve around mid-gray
float softContrast(float x, float k) {
  // k in ~[0,1], higher => more contrast
  float m = 0.5;
  float y = (x - m) * (1.0 + 2.2*k) + m;
  // keep smooth, not harsh
  return clamp(mix(x, y, 0.85), 0.0, 1.0);
}

vec3 palette(float x, float play) {
  // restrained, “discovered” color: pearl/teal/violet/rose
  vec3 deep  = vec3(0.012, 0.012, 0.018);
  vec3 fog   = vec3(0.060, 0.070, 0.095);
  vec3 pearl = vec3(0.86, 0.84, 0.80);
  vec3 teal  = vec3(0.45, 0.80, 0.78);
  vec3 vio   = vec3(0.56, 0.44, 0.86);
  vec3 rose  = vec3(0.88, 0.62, 0.74);

  float a = smoothstep(0.08, 0.92, x);

  // baseline stays mostly desaturated
  vec3 base = mix(deep, fog, a);

  // in play mode, chroma condenses locally (no full-spectrum cycling)
  vec3 chroma = mix(teal, vio, smoothstep(0.30, 0.85, x));
  chroma = mix(chroma, rose, smoothstep(0.72, 0.98, x));

  // only a portion of the luminance gets “pearled”
  vec3 outc = mix(base, chroma, 0.10 + 0.35*play*a);
  outc = mix(outc, pearl, (0.05 + 0.12*play) * smoothstep(0.55, 0.98, x));

  return outc;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float rms = clamp(uRms, 0.0, 1.0);

  // Playback detector: uses rms when present, else energy.
  float drive = max(e, rms);

  // Transition: baseline -> active
  float play = smoothstep(0.02, 0.12, drive);

  // Inline stability: widen tiny details at low internal res
  float resMin = min(uRes.x, uRes.y);
  float soft = clamp((520.0 / max(240.0, resMin)), 0.9, 1.7);

  // Time: baseline is slower; playback thickens time with bass (viscosity vibe)
  float tBase = uTime * 0.06;
  float tPlay = uTime * (0.08 + 0.04*uMid) * (1.0 - 0.20*uBass);
  float t = mix(tBase, tPlay, play);

  // Base field (full-coverage)
  vec2 q = p;
  q += 0.08 * vec2(sin(t*0.9), cos(t*0.7));

  // Flow advection (subtle in baseline, stronger in play)
  vec2 v = flow(q, t);
  q += v * (0.06 + 0.10*play) * (0.55 + 0.65*uMid);

  // “world texture”
  float f0 = fbm(q*1.35 + vec2(0.0, t*0.35));
  float f1 = fbm(q*2.25 - vec2(t*0.22, t*0.18));
  float field = clamp(0.62*f0 + 0.38*f1, 0.0, 1.0);

  // Salience: image “notices itself” (edges/curvature/contrast)
  // Use derivative-based sample steps for stability across changing internal res.
  vec2 px = 1.0 / max(uRes, vec2(1.0));
  vec2 s = px * (2.0 * soft);

  float fx1 = fbm((q + vec2(s.x, 0.0))*1.35 + vec2(0.0, t*0.35));
  float fx2 = fbm((q - vec2(s.x, 0.0))*1.35 + vec2(0.0, t*0.35));
  float fy1 = fbm((q + vec2(0.0, s.y))*1.35 + vec2(0.0, t*0.35));
  float fy2 = fbm((q - vec2(0.0, s.y))*1.35 + vec2(0.0, t*0.35));

  vec2 grad = vec2(fx1 - fx2, fy1 - fy2) / max(1e-6, (2.0*max(s.x, s.y)));
  float gmag = length(grad);

  // Curvature proxy: gradient direction change via second-order finite diff
  float fxx = fx1 + fx2 - 2.0*f0;
  float fyy = fy1 + fy2 - 2.0*f0;
  float curv = abs(fxx) + abs(fyy);

  // Salience combines edge + curvature, boosted by treble, gated by play
  float sal = (0.85*gmag + 0.65*curv);
  sal *= (0.70 + 0.85*uTreble);
  sal *= (0.20 + 0.80*play);
  sal = clamp(sal * 2.2, 0.0, 1.0);

  // Meaning leak: contrast increases selectively where salience exists
  float k = (0.08 + 0.42*play) * (0.55 + 0.45*drive);
  float shaped = softContrast(field, k * sal);

  // Base color (restrained), then local chroma condensation under salience
  vec3 col = palette(shaped, play);

  // Halo: soft “edge significance” without drawing outlines
  // Subtle chromatic fringe aligned to gradient direction, scaled by salience.
  vec2 dir = normalize(grad + vec2(1e-6, 1e-6));
  float fringePx = (0.9 + 1.4*play) * (0.5 + 0.7*uTreble) * soft;
  vec2 off = dir * fringePx * px;

  float lC = shaped;
  float lR = clamp(softContrast(clamp(0.62*fbm((q + off)*1.35 + vec2(0.0, t*0.35)) + 0.38*f1, 0.0, 1.0), k * sal), 0.0, 1.0);
  float lB = clamp(softContrast(clamp(0.62*fbm((q - off)*1.35 + vec2(0.0, t*0.35)) + 0.38*f1, 0.0, 1.0), k * sal), 0.0, 1.0);

  // build a very subtle fringe; keep it adult
  vec3 fringe = vec3(lR - lC, 0.0, lC - lB);
  fringe *= (0.06 + 0.16*play) * sal;

  col += fringe;

  // “importance glow”: lift highlights where salience peaks, but cap hard whites (SCREEN-safe)
  float glow = smoothstep(0.20, 0.95, sal) * (0.06 + 0.18*play) * (0.55 + 0.45*drive);
  col += vec3(0.95, 0.95, 1.00) * glow * smoothstep(0.55, 0.98, shaped);

  // Baseline: add a tiny film grain-like microtexture so idle isn’t dead
  float grain = noise(uv*uRes*0.35 + vec2(uTime*0.8, -uTime*0.6));
  col += vec3(grain - 0.5) * (0.010 + 0.010*(1.0-play));

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  // global breathing (very gentle)
  col *= 0.92 + 0.20 * drive;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function createMeaningLeakTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null

  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null
  let uRms: WebGLUniformLocation | null = null
  let uBass: WebGLUniformLocation | null = null
  let uMid: WebGLUniformLocation | null = null
  let uTreble: WebGLUniformLocation | null = null

  return {
    name: 'meaning-leak',
    init(gl) {
      program = createProgram(gl, VS, FS)
      tri = makeFullscreenTriangle(gl)
      uRes = gl.getUniformLocation(program, 'uRes')
      uTime = gl.getUniformLocation(program, 'uTime')
      uEnergy = gl.getUniformLocation(program, 'uEnergy')
      uRms = gl.getUniformLocation(program, 'uRms')
      uBass = gl.getUniformLocation(program, 'uBass')
      uMid = gl.getUniformLocation(program, 'uMid')
      uTreble = gl.getUniformLocation(program, 'uTreble')
    },
    render(gl, opts) {
      if (!program || !tri) return

      const bass = opts.audio.bass ?? opts.audio.energy
      const mid = opts.audio.mid ?? opts.audio.energy
      const treble = opts.audio.treble ?? opts.audio.energy
      const rms = opts.audio.rms ?? 0

      gl.useProgram(program)
      gl.bindVertexArray(tri.vao)

      gl.uniform2f(uRes, opts.width, opts.height)
      gl.uniform1f(uTime, opts.time)
      gl.uniform1f(uEnergy, opts.audio.energy)
      gl.uniform1f(uRms, rms)
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
