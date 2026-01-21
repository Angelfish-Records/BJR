// web/app/home/player/visualizer/themes/filamentStorm.ts
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

// Filament Storm (hairline geometry saturation)
// Inline-tuned: fwidth AA for “band boundaries”, softened highlights, less single-pixel glitter.
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
    p = mat2(1.70, -1.12, 1.12, 1.70) * p;
    a *= 0.5;
  }
  return v;
}

vec2 flow(vec2 p, float t) {
  float a = fbm(p*1.2 + vec2(t*0.22, -t*0.18));
  float b = fbm(p*1.2 + vec2(-t*0.16, t*0.24));
  vec2 g = vec2(a - 0.5, b - 0.5);
  vec2 v = vec2(g.y, -g.x);
  v += 0.35 * vec2(sin(t*0.12), cos(t*0.10));
  return v * (0.85 + 0.85*uMid);
}

float filamentField(vec2 p, float t) {
  vec2 a = p;
  float s = 0.0;
  float w = 1.0;

  float freq = mix(7.0, 4.2, uBass);

  for (int i = 0; i < 7; i++) {
    vec2 v = flow(a, t);
    a += v * 0.05;

    float n = fbm(a * freq + float(i) * 17.1);
    float r = 1.0 - abs(2.0*n - 1.0);
    s += w * r;

    w *= 0.72;
    freq *= 1.10;
  }

  return s / 2.2;
}

float aaBandLine(float x) {
  // x is fractional distance to band center (0 at band boundary)
  float w = fwidth(x) + 1e-5;
  return 1.0 - smoothstep(0.0, 0.055 + w, x);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // SCREEN-friendly base (dark, but not dead)
  float under = fbm(p*1.6 + vec2(0.0, t*0.35));
  vec3 base = mix(vec3(0.015, 0.015, 0.018), vec3(0.060, 0.080, 0.100), under);

  float f = filamentField(p, t);

  // lots of bands, but AA them so they don’t sparkle when internal res changes
  float bands = 20.0 + 24.0 * uTreble;
  float v = f * bands;
  float frac = fract(v);
  float d = min(frac, 1.0 - frac); // 0 at boundary
  float line = aaBandLine(d);

  // treble shimmer: keep it subtle and broad (no pixel glitter)
  float jitter = fbm(p*9.0 + vec2(t*1.9, -t*1.6));
  float shiver = (0.55 + 0.45*sin(t*6.5 + jitter*6.28318)) * (0.06 + 0.14*uTreble);
  line = clamp(line + shiver * (0.30 + 0.60*line), 0.0, 1.0);

  // bundle control (bass)
  float bundle = smoothstep(0.45, 0.95, fbm(p*2.8 + vec2(t*0.6, -t*0.5)));
  float thick = mix(0.35, 0.80, uBass) * bundle;
  float strand = pow(line, mix(1.45, 0.95, thick));

  // pearlescent palette (diverse from nebula)
  vec3 ink = vec3(0.04, 0.04, 0.05);
  vec3 pearl = vec3(0.88, 0.86, 0.82);
  vec3 rose = vec3(0.90, 0.70, 0.78);
  vec3 teal = vec3(0.60, 0.85, 0.82);

  float tint = smoothstep(0.15, 0.95, fbm(p*1.4 + 5.7));
  vec3 filamentCol = mix(pearl, mix(rose, teal, tint), 0.55);

  vec3 col = base;
  col = mix(col, ink, 0.10);
  col += filamentCol * strand * (0.16 + 0.42*e);

  // highlights: broaden + cap (avoid pinprick whites)
  float peak = smoothstep(0.72, 0.98, strand);
  col += vec3(0.98, 0.98, 1.00) * peak * (0.06 + 0.16*uTreble);

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22*e;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function createFilamentStormTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null
  let uBass: WebGLUniformLocation | null = null
  let uMid: WebGLUniformLocation | null = null
  let uTreble: WebGLUniformLocation | null = null

  return {
    name: 'filament-storm',
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
