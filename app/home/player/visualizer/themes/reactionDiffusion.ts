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

// Update shader: Gray–Scott in RG (U=R, V=G).
const FS_UPDATE = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;

uniform float uEnergy;
uniform float uBass;
uniform float uTreble;
uniform float uCentroid;

// Laplacian weights
vec2 lap(vec2 uv, vec2 px){
  vec2 c  = texture(uPrev, uv).rg;
  vec2 n  = texture(uPrev, uv + vec2(0.0,  px.y)).rg;
  vec2 s  = texture(uPrev, uv - vec2(0.0,  px.y)).rg;
  vec2 e  = texture(uPrev, uv + vec2(px.x, 0.0)).rg;
  vec2 w  = texture(uPrev, uv - vec2(px.x, 0.0)).rg;
  vec2 ne = texture(uPrev, uv + vec2(px.x, px.y)).rg;
  vec2 nw = texture(uPrev, uv + vec2(-px.x, px.y)).rg;
  vec2 se = texture(uPrev, uv + vec2(px.x, -px.y)).rg;
  vec2 sw = texture(uPrev, uv + vec2(-px.x, -px.y)).rg;

  return (n+s+e+w)*0.20 + (ne+nw+se+sw)*0.05 - c;
}

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main(){
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;

  vec2 uvv = texture(uPrev, uv).rg;
  float U = uvv.r;
  float V = uvv.g;

  vec2 L = lap(uv, px);

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float tre  = clamp(uTreble, 0.0, 1.0);
  float cen  = clamp(uCentroid, 0.0, 1.0);

  // Diffusion
  float Du = 0.95;
  float Dv = 0.45;

  // Feed/kill: audio modulates within safe aesthetic ranges
  float f = 0.022 + 0.018 * bass + 0.006 * sin(uTime*0.3 + 6.0*cen);
  float k = 0.052 + 0.020 * tre  + 0.006 * cos(uTime*0.25);

  // Reaction
  float uv2 = U * V * V;
  float dU = Du * L.r - uv2 + f * (1.0 - U);
  float dV = Dv * L.g + uv2 - (f + k) * V;

  // Small timestep (stabilises on varying DPR)
  float dt = 1.05;

  U += dt * dU;
  V += dt * dV;

  // Audio injection (moving source)
  vec2 center = vec2(0.5) + 0.20 * vec2(sin(uTime*0.37 + 4.0*cen), cos(uTime*0.29 + 3.0*bass));
  float r = length((uv - center) * vec2(uRes.x/uRes.y, 1.0));
  float inject = smoothstep(0.09, 0.0, r) * (0.10 + 0.25*e);

  // add V (dye), consume U a bit
  V = clamp(V + inject, 0.0, 1.0);
  U = clamp(U - inject * 0.35, 0.0, 1.0);

  // subtle background noise to keep it alive on silence
  float n = (hash(uv*uRes + uTime) - 0.5) * 0.002;
  V = clamp(V + n, 0.0, 1.0);

  outColor = vec4(U, V, 0.0, 1.0);
}
`

// Display shader: render patterns from V (and U-V contrast), with vignette.
const FS_DRAW = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uEnergy;
uniform float uCentroid;

float smoothBand(float x, float a, float b){
  return smoothstep(a, b, x) * (1.0 - smoothstep(b, b+0.08, x));
}

void main(){
  vec2 uv = vUv;
  vec2 p = (uv*uRes - 0.5*uRes) / min(uRes.x,uRes.y);

  vec2 s = texture(uTex, uv).rg;
  float U = s.r;
  float V = s.g;

  float e = clamp(uEnergy, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  float v = V;
  float edge = abs(U - V);

  // Bands
  float b1 = smoothstep(0.15, 0.85, v);
  float b2 = smoothBand(v + 0.25*edge, 0.25, 0.70);

  vec3 colA = vec3(0.06, 0.04, 0.08);
  vec3 colB = vec3(0.25, 0.45, 0.95);
  vec3 colC = vec3(0.85, 0.70, 0.98);

  vec3 col = mix(colA, colB, b1);
  col = mix(col, colC, b2 * (0.55 + 0.35*cen));

  // Edge glow
  col += vec3(0.9, 0.95, 1.0) * pow(edge, 1.4) * (0.25 + 0.9*e);

  // Vignette
  float r = length(p);
  col *= smoothstep(1.25, 0.35, r);

  fragColor = vec4(col, 1.0);
}
`

function createTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.bindTexture(gl.TEXTURE_2D, null)
  return tex
}

function createFbo(gl: WebGL2RenderingContext, tex: WebGLTexture) {
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('Failed to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return fbo
}

function seed(gl: WebGL2RenderingContext, tex: WebGLTexture, w: number, h: number) {
  // Seed U ~ 1, V ~ tiny noise with a center blob.
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const dx = x / w - 0.5
      const dy = y / h - 0.5
      const r = Math.sqrt(dx * dx + dy * dy)
      const blob = r < 0.08 ? 1 : 0
      const noise = (Math.random() * 0.04 + 0.01) * (1 - blob) + blob * 0.9
      data[i + 0] = 255 // U
      data[i + 1] = Math.max(0, Math.min(255, Math.floor(noise * 255))) // V
      data[i + 2] = 0
      data[i + 3] = 255
    }
  }
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function createReactionDiffusionTheme(): Theme {
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null

  let progUpdate: WebGLProgram | null = null
  let progDraw: WebGLProgram | null = null

  let texA: WebGLTexture | null = null
  let texB: WebGLTexture | null = null
  let fboA: WebGLFramebuffer | null = null
  let fboB: WebGLFramebuffer | null = null
  let ping = true

  // internal sim resolution (kept modest; looks organic even at low res)
  let simW = 0
  let simH = 0

  // uniforms (update)
  let uPrev: WebGLUniformLocation | null = null
  let uResU: WebGLUniformLocation | null = null
  let uTimeU: WebGLUniformLocation | null = null
  let uEnergyU: WebGLUniformLocation | null = null
  let uBassU: WebGLUniformLocation | null = null
  let uTrebleU: WebGLUniformLocation | null = null
  let uCentroidU: WebGLUniformLocation | null = null

  // uniforms (draw)
  let uTexD: WebGLUniformLocation | null = null
  let uResD: WebGLUniformLocation | null = null
  let uEnergyD: WebGLUniformLocation | null = null
  let uCentroidD: WebGLUniformLocation | null = null

  function ensureSim(gl: WebGL2RenderingContext, w: number, h: number) {
    // pick a stable sim size based on output res, but cap it hard
    const target = Math.min(520, Math.max(220, Math.floor(Math.min(w, h) * 0.55)))
    const nextW = target
    const nextH = target

    if (nextW === simW && nextH === simH && texA && texB && fboA && fboB) return

    // cleanup old
    if (fboA) gl.deleteFramebuffer(fboA)
    if (fboB) gl.deleteFramebuffer(fboB)
    if (texA) gl.deleteTexture(texA)
    if (texB) gl.deleteTexture(texB)

    simW = nextW
    simH = nextH

    texA = createTex(gl, simW, simH)
    texB = createTex(gl, simW, simH)
    fboA = createFbo(gl, texA)
    fboB = createFbo(gl, texB)

    seed(gl, texA, simW, simH)
    seed(gl, texB, simW, simH)
    ping = true
  }

  return {
    name: 'reaction-diffusion',
    init(gl) {
      tri = makeFullscreenTriangle(gl)

      progUpdate = createProgram(gl, VS, FS_UPDATE)
      progDraw = createProgram(gl, VS, FS_DRAW)

      // update uniforms
      uPrev = gl.getUniformLocation(progUpdate, 'uPrev')
      uResU = gl.getUniformLocation(progUpdate, 'uRes')
      uTimeU = gl.getUniformLocation(progUpdate, 'uTime')
      uEnergyU = gl.getUniformLocation(progUpdate, 'uEnergy')
      uBassU = gl.getUniformLocation(progUpdate, 'uBass')
      uTrebleU = gl.getUniformLocation(progUpdate, 'uTreble')
      uCentroidU = gl.getUniformLocation(progUpdate, 'uCentroid')

      // draw uniforms
      uTexD = gl.getUniformLocation(progDraw, 'uTex')
      uResD = gl.getUniformLocation(progDraw, 'uRes')
      uEnergyD = gl.getUniformLocation(progDraw, 'uEnergy')
      uCentroidD = gl.getUniformLocation(progDraw, 'uCentroid')
    },
    render(gl, opts) {
      if (!tri || !progUpdate || !progDraw) return
      ensureSim(gl, opts.width, opts.height)
      if (!texA || !texB || !fboA || !fboB) return

      const a = opts.audio
      const energy = a.energy ?? 0
      const bass = a.bass ?? 0
      const treble = a.treble ?? 0
      const centroid = a.centroid ?? 0

      const srcTex = ping ? texA : texB
      const dstFbo = ping ? fboB : fboA

      // --- update pass (to sim FBO) ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo)
      gl.viewport(0, 0, simW, simH)

      gl.useProgram(progUpdate)
      gl.bindVertexArray(tri.vao)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, srcTex)
      gl.uniform1i(uPrev, 0)

      gl.uniform2f(uResU, simW, simH)
      gl.uniform1f(uTimeU, opts.time)
      gl.uniform1f(uEnergyU, energy)
      gl.uniform1f(uBassU, bass)
      gl.uniform1f(uTrebleU, treble)
      gl.uniform1f(uCentroidU, centroid)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // --- draw pass (to screen) ---
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, opts.width, opts.height)

      gl.useProgram(progDraw)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA) // newly updated tex
      gl.uniform1i(uTexD, 0)

      gl.uniform2f(uResD, opts.width, opts.height)
      gl.uniform1f(uEnergyD, energy)
      gl.uniform1f(uCentroidD, centroid)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindTexture(gl.TEXTURE_2D, null)
      gl.bindVertexArray(null)
      gl.useProgram(null)

      ping = !ping
    },
    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf)
      if (tri?.vao) gl.deleteVertexArray(tri.vao)
      tri = null

      if (fboA) gl.deleteFramebuffer(fboA)
      if (fboB) gl.deleteFramebuffer(fboB)
      if (texA) gl.deleteTexture(texA)
      if (texB) gl.deleteTexture(texB)

      fboA = null
      fboB = null
      texA = null
      texB = null
      simW = 0
      simH = 0

      if (progUpdate) gl.deleteProgram(progUpdate)
      if (progDraw) gl.deleteProgram(progDraw)
      progUpdate = null
      progDraw = null
    },
  }
}
