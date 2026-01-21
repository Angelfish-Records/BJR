// web/app/home/player/visualizer/themes/oilFlow.ts
import type {Theme} from '../types'
import {createProgram, makeFullscreenTriangle} from '../gl'
import {createPingPong, type PingPong} from '../gl/pingpong'

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

// Temporal Oil Flow needs a feedback buffer. We do:
// 1) SIM PASS: prevTex -> nextTex (advection + diffusion + mixing)
// 2) DRAW PASS: nextTex -> screen (tone + iridescent edges)
const SIM_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform sampler2D uPrev;

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
    p = mat2(1.73, -1.10, 1.10, 1.73) * p;
    a *= 0.5;
  }
  return v;
}

vec2 velField(vec2 p, float t) {
  // divergence-ish velocity from two fbm channels, rotated for flow
  float a = fbm(p*1.2 + vec2(t*0.18, -t*0.16));
  float b = fbm(p*1.2 + vec2(-t*0.14, t*0.20));
  vec2 g = vec2(a - 0.5, b - 0.5);
  vec2 v = vec2(g.y, -g.x);

  // add a slow laminar drift so it feels like “oil on water”
  v += 0.35 * vec2(sin(t*0.12), cos(t*0.10));
  return v;
}

vec3 softBlur(sampler2D tex, vec2 uv, vec2 px) {
  // 5-tap cross blur (cheap diffusion)
  vec3 c = texture(tex, uv).rgb;
  vec3 x1 = texture(tex, uv + vec2(px.x, 0.0)).rgb;
  vec3 x2 = texture(tex, uv - vec2(px.x, 0.0)).rgb;
  vec3 y1 = texture(tex, uv + vec2(0.0, px.y)).rgb;
  vec3 y2 = texture(tex, uv - vec2(0.0, px.y)).rgb;
  return (c*0.52 + (x1+x2+y1+y2)*0.12);
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / max(uRes, vec2(1.0));
  float e = clamp(uEnergy, 0.0, 1.0);
  float t = uTime * 0.10;

  // viscosity: high energy -> lower viscosity (more volatile), low energy -> thicker
  float viscosity = mix(0.94, 0.78, e);      // higher = more “sticky memory”
  float advAmt    = mix(0.010, 0.030, e);    // how far to advect
  float diffAmt   = mix(0.010, 0.030, 1.0 - e); // thicker -> more diffusion (oil smear)

  // velocity in normalized space, scaled by aspect
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);
  vec2 v = velField(p, t);
  vec2 adv = v * advAmt;

  // backtrace
  vec2 srcUv = uv - adv;

  // sample previous state
  vec3 prev = texture(uPrev, srcUv).rgb;

  // diffusion / smoothing
  vec3 blur = softBlur(uPrev, srcUv, px);
  vec3 mixed = mix(prev, blur, diffAmt);

  // inject gentle dye so it never dies (global, not local)
  float dye = fbm(p*1.6 + vec2(t*0.45, -t*0.38));
  vec3 inkA = vec3(0.06, 0.05, 0.10);
  vec3 inkB = vec3(0.18, 0.16, 0.26);
  vec3 inkC = vec3(0.55, 0.45, 0.80);
  vec3 dyeCol = mix(inkA, mix(inkB, inkC, dye), dye);

  float inject = (0.0025 + 0.010 * e);
  mixed = mix(mixed, dyeCol, inject);

  // decay / memory (viscosity)
  mixed *= viscosity;

  // keep within sane range
  mixed = clamp(mixed, 0.0, 1.0);

  fragColor = vec4(mixed, 1.0);
}
`

const DRAW_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform sampler2D uTex;

float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

vec3 thinFilm(float x) {
  float r = 0.5 + 0.5 * cos(6.28318 * (x + 0.00));
  float g = 0.5 + 0.5 * cos(6.28318 * (x + 0.33));
  float b = 0.5 + 0.5 * cos(6.28318 * (x + 0.66));
  return vec3(r, g, b);
}

void main() {
  vec2 uv = vUv;
  vec2 px = 1.0 / max(uRes, vec2(1.0));
  float e = clamp(uEnergy, 0.0, 1.0);
  float t = uTime * 0.10;

  vec3 c = texture(uTex, uv).rgb;

  // edge instability: detect local gradients and apply iridescent sheen
  float cx1 = luma(texture(uTex, uv + vec2(px.x, 0.0)).rgb);
  float cx2 = luma(texture(uTex, uv - vec2(px.x, 0.0)).rgb);
  float cy1 = luma(texture(uTex, uv + vec2(0.0, px.y)).rgb);
  float cy2 = luma(texture(uTex, uv - vec2(0.0, px.y)).rgb);
  vec2 g = vec2(cx1 - cx2, cy1 - cy2);
  float gm = length(g);

  float sheen = smoothstep(0.02, 0.18, gm) * (0.18 + 0.35*e);

  // iridescence phase driven by gradient direction + time
  float phase = fract(0.25 + 0.18 * atan(g.y, g.x) + 0.10 * sin(t*0.8) + 0.20 * gm);
  vec3 iri = thinFilm(phase);

  // tone curve to feel “luxurious”
  vec3 base = pow(c, vec3(0.85));
  base = mix(vec3(0.03, 0.03, 0.06), base, 1.10);

  vec3 col = base + iri * sheen;

  // subtle global breathing tied to energy, not per-beat
  col *= 0.92 + 0.22 * e;

  // vignette
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function createOilFlowTheme(): Theme {
  let simProgram: WebGLProgram | null = null
  let drawProgram: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null

  let ping: PingPong | null = null

  // uniforms
  let sim_uRes: WebGLUniformLocation | null = null
  let sim_uTime: WebGLUniformLocation | null = null
  let sim_uEnergy: WebGLUniformLocation | null = null
  let sim_uPrev: WebGLUniformLocation | null = null

  let draw_uRes: WebGLUniformLocation | null = null
  let draw_uTime: WebGLUniformLocation | null = null
  let draw_uEnergy: WebGLUniformLocation | null = null
  let draw_uTex: WebGLUniformLocation | null = null

  return {
    name: 'oil-flow',
    init(gl) {
      const gl2 = gl as WebGL2RenderingContext
      simProgram = createProgram(gl2, VS, SIM_FS)
      drawProgram = createProgram(gl2, VS, DRAW_FS)
      tri = makeFullscreenTriangle(gl2)

      sim_uRes = gl2.getUniformLocation(simProgram, 'uRes')
      sim_uTime = gl2.getUniformLocation(simProgram, 'uTime')
      sim_uEnergy = gl2.getUniformLocation(simProgram, 'uEnergy')
      sim_uPrev = gl2.getUniformLocation(simProgram, 'uPrev')

      draw_uRes = gl2.getUniformLocation(drawProgram, 'uRes')
      draw_uTime = gl2.getUniformLocation(drawProgram, 'uTime')
      draw_uEnergy = gl2.getUniformLocation(drawProgram, 'uEnergy')
      draw_uTex = gl2.getUniformLocation(drawProgram, 'uTex')

      // Start with a modest buffer; will resize on first render.
      ping = createPingPong(gl2, 64, 64)

      // Prime the buffers with something non-black (single sim step with uPrev=0)
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, ping.dstFbo())
      gl2.viewport(0, 0, ping.w, ping.h)
      gl2.useProgram(simProgram)
      gl2.bindVertexArray(tri.vao)

      gl2.uniform2f(sim_uRes, ping.w, ping.h)
      gl2.uniform1f(sim_uTime, 0)
      gl2.uniform1f(sim_uEnergy, 0)

      gl2.activeTexture(gl2.TEXTURE0)
      // bind src (will be empty, but that’s okay)
      gl2.bindTexture(gl2.TEXTURE_2D, ping.srcTex())
      gl2.uniform1i(sim_uPrev, 0)

      gl2.drawArrays(gl2.TRIANGLES, 0, 3)

      gl2.bindVertexArray(null)
      gl2.useProgram(null)
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, null)

      ping.swap()
    },
    render(gl, opts) {
      if (!simProgram || !drawProgram || !tri || !ping) return
      const gl2 = gl as WebGL2RenderingContext

      // Keep feedback buffer at (or near) screen res.
      // If you want cheaper: resize to opts.width/2, opts.height/2.
      const w = Math.max(2, Math.floor(opts.width))
      const h = Math.max(2, Math.floor(opts.height))
      if (ping.w !== w || ping.h !== h) {
        ping.resize(gl2, w, h)
      }

      const e = opts.audio.energy

      // ---- SIM PASS ----
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, ping.dstFbo())
      gl2.viewport(0, 0, ping.w, ping.h)
      gl2.useProgram(simProgram)
      gl2.bindVertexArray(tri.vao)

      gl2.uniform2f(sim_uRes, ping.w, ping.h)
      gl2.uniform1f(sim_uTime, opts.time)
      gl2.uniform1f(sim_uEnergy, e)

      gl2.activeTexture(gl2.TEXTURE0)
      gl2.bindTexture(gl2.TEXTURE_2D, ping.srcTex())
      gl2.uniform1i(sim_uPrev, 0)

      gl2.drawArrays(gl2.TRIANGLES, 0, 3)

      gl2.bindVertexArray(null)
      gl2.useProgram(null)
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, null)

      ping.swap()

      // ---- DRAW PASS ----
      gl2.viewport(0, 0, opts.width, opts.height)
      gl2.useProgram(drawProgram)
      gl2.bindVertexArray(tri.vao)

      gl2.uniform2f(draw_uRes, opts.width, opts.height)
      gl2.uniform1f(draw_uTime, opts.time)
      gl2.uniform1f(draw_uEnergy, e)

      gl2.activeTexture(gl2.TEXTURE0)
      gl2.bindTexture(gl2.TEXTURE_2D, ping.srcTex())
      gl2.uniform1i(draw_uTex, 0)

      gl2.drawArrays(gl2.TRIANGLES, 0, 3)

      gl2.bindVertexArray(null)
      gl2.useProgram(null)
    },
    dispose(gl) {
      const gl2 = gl as WebGL2RenderingContext
      if (ping) {
        ping.dispose(gl2)
        ping = null
      }
      if (tri?.buf) gl2.deleteBuffer(tri.buf)
      if (tri?.vao) gl2.deleteVertexArray(tri.vao)
      tri = null
      if (simProgram) gl2.deleteProgram(simProgram)
      if (drawProgram) gl2.deleteProgram(drawProgram)
      simProgram = null
      drawProgram = null
    },
  }
}
