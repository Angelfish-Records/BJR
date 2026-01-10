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

float hash(vec2 p){
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

vec2 curl(vec2 p){
  // finite difference curl from scalar noise
  float e = 0.0025;
  float n1 = noise(p + vec2(0.0, e));
  float n2 = noise(p - vec2(0.0, e));
  float n3 = noise(p + vec2(e, 0.0));
  float n4 = noise(p - vec2(e, 0.0));
  float dx = n1 - n2;
  float dy = n3 - n4;
  return normalize(vec2(dx, -dy) + 1e-4);
}

void main(){
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float tre  = clamp(uTreble, 0.0, 1.0);
  float cen  = clamp(uCentroid, 0.0, 1.0);

  // field scale: audio changes topology (not stroke size)
  float fieldScale = mix(1.6, 3.4, cen) + 1.2*tre;
  vec2 p = (uv - 0.5) * fieldScale;

  // time drift
  p += 0.25 * vec2(sin(uTime*0.13), cos(uTime*0.11));

  vec2 v = curl(p + 0.15*sin(uTime*0.2));
  float speed = 0.25 + 0.65*e + 0.30*bass;

  // semi-Lagrangian advection (sample backwards)
  vec2 prevUV = uv - v * speed * px * 18.0;

  // wrap
  prevUV = fract(prevUV);

  vec3 ink = texture(uPrev, prevUV).rgb;

  // decay slowly (long continuity)
  float decay = 0.985 - 0.015*tre;
  ink *= decay;

  // inject “ink” at a moving pen point (topology modulated by audio)
  vec2 pen = vec2(0.5) + 0.22 * vec2(sin(uTime*0.35 + 3.0*cen), cos(uTime*0.27 + 2.0*bass));
  float r = length((uv - pen) * vec2(uRes.x/uRes.y, 1.0));
  float blob = smoothstep(0.06, 0.0, r);

  // ink colour shifts with centroid
  vec3 cA = vec3(0.10, 0.06, 0.12);
  vec3 cB = vec3(0.85, 0.75, 0.98);
  vec3 penCol = mix(cA, cB, smoothstep(0.15, 0.85, cen));

  float inject = blob * (0.06 + 0.22*e + 0.10*bass);

  ink += penCol * inject;

  // tiny noise keeps texture alive
  float n = (hash(uv*uRes + uTime) - 0.5) * 0.002;
  ink += vec3(n);

  ink = clamp(ink, 0.0, 1.0);

  outColor = vec4(ink, 1.0);
}
`

const FS_DRAW = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uEnergy;

void main(){
  vec2 uv = vUv;
  vec2 p = (uv*uRes - 0.5*uRes) / min(uRes.x,uRes.y);

  vec3 ink = texture(uTex, uv).rgb;

  // tone map: ink becomes “calligraphy on darkness”
  float lum = dot(ink, vec3(0.299, 0.587, 0.114));
  lum = pow(lum, 0.85);

  vec3 bg = vec3(0.03, 0.03, 0.04);
  vec3 paperGlow = vec3(0.25, 0.18, 0.35) * (0.15 + 0.65*uEnergy);

  vec3 col = bg + paperGlow * lum + ink * (0.6 + 0.7*uEnergy);

  // vignette
  float r = length(p);
  col *= smoothstep(1.25, 0.35, r);

  fragColor = vec4(col, 1.0);
}
`

function createTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
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

function clearTex(gl: WebGL2RenderingContext, tex: WebGLTexture, w: number, h: number) {
  const data = new Uint8Array(w * h * 4)
  // start near-black, a few faint specks
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const s = Math.random() < 0.002 ? 40 + Math.random() * 40 : 0
    data[o + 0] = s
    data[o + 1] = s
    data[o + 2] = s
    data[o + 3] = 255
  }
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function createCalligraphyTheme(): Theme {
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let progUpdate: WebGLProgram | null = null
  let progDraw: WebGLProgram | null = null

  let texA: WebGLTexture | null = null
  let texB: WebGLTexture | null = null
  let fboA: WebGLFramebuffer | null = null
  let fboB: WebGLFramebuffer | null = null
  let ping = true

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

  function ensureSim(gl: WebGL2RenderingContext, w: number, h: number) {
    const target = Math.min(560, Math.max(240, Math.floor(Math.min(w, h) * 0.60)))
    const nextW = target
    const nextH = target
    if (nextW === simW && nextH === simH && texA && texB && fboA && fboB) return

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

    clearTex(gl, texA, simW, simH)
    clearTex(gl, texB, simW, simH)
    ping = true
  }

  return {
    name: 'calligraphy',
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

      // update
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

      // draw
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, opts.width, opts.height)

      gl.useProgram(progDraw)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA)
      gl.uniform1i(uTexD, 0)

      gl.uniform2f(uResD, opts.width, opts.height)
      gl.uniform1f(uEnergyD, energy)

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
