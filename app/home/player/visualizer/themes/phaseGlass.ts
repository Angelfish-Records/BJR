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

// Light-field update: diffuse/decay + inject gentle noise gradients.
const FS_FIELD = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;

uniform float uEnergy;
uniform float uBass;
uniform float uCentroid;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p){
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a,b,u.x) + (c-a)*u.y*(1.0-u.x) + (d-b)*u.x*u.y;
}

void main(){
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  vec3 c = texture(uPrev, uv).rgb;

  // diffusion (small blur)
  vec3 blur =
    texture(uPrev, uv + vec2(px.x, 0.0)).rgb +
    texture(uPrev, uv - vec2(px.x, 0.0)).rgb +
    texture(uPrev, uv + vec2(0.0, px.y)).rgb +
    texture(uPrev, uv - vec2(0.0, px.y)).rgb;
  blur *= 0.25;

  float diff = 0.04 + 0.06*cen;         // centroid increases “glass coherence”
  float decay = 0.995 - 0.010*bass;     // bass makes it “heavier” (more persistence)

  vec3 field = mix(c, blur, diff) * decay;

  // inject low-frequency drifting structure
  vec2 p = (uv - 0.5) * vec2(uRes.x/uRes.y, 1.0);
  float t = uTime * 0.06;

  float n = noise(p*2.0 + vec2(t, -t));
  float m = noise(p*3.5 + vec2(-t*0.7, t*0.9));

  vec3 injectA = vec3(0.12, 0.10, 0.18) * (n - 0.5);
  vec3 injectB = vec3(0.30, 0.22, 0.45) * (m - 0.5);

  field += (injectA + injectB) * (0.06 + 0.18*e);

  field = clamp(field, 0.0, 1.0);
  outColor = vec4(field, 1.0);
}
`

// Glass render: refract the light-field through a few drifting planes, add Fresnel.
const FS_GLASS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uField;
uniform vec2 uRes;
uniform float uTime;

uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

vec3 sampleField(vec2 uv, float chroma){
  // subtle chromatic separation
  vec2 d = vec2(chroma, -chroma) / uRes;
  float r = texture(uField, uv + d).r;
  float g = texture(uField, uv).g;
  float b = texture(uField, uv - d).b;
  return vec3(r,g,b);
}

void main(){
  vec2 uv = vUv;
  vec2 px = (uv*uRes - 0.5*uRes) / min(uRes.x,uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  float t = uTime * 0.12;

  // base light field (background)
  vec3 base = sampleField(uv, 1.5 + 3.0*cen);

  // Define 4 “planes” in screen-space: each gives a normal-like vector for refraction.
  // Audio steers their orientation (mid) and refraction strength (centroid).
  vec3 col = vec3(0.02, 0.02, 0.03) + base * 0.85;

  float ior = 1.02 + 0.10*cen + 0.03*tre; // refraction index
  float refr = 0.006 + 0.018*cen;         // refraction strength

  for(int i=0;i<4;i++){
    float fi = float(i);
    float ang = t*0.6 + fi*1.2 + 1.8*mid;
    vec2 n = normalize(vec2(cos(ang), sin(ang)));

    // plane “mask” in screen space: soft bands
    float band = dot(px, n);
    float width = 0.22 + 0.06*sin(fi + t*0.3);
    float msk = smoothstep(width, width-0.10, abs(band));

    // drift / parallax
    vec2 drift = 0.03 * vec2(sin(t*0.7 + fi), cos(t*0.6 - fi)) * (0.4 + 0.6*bass);

    // refract offset
    vec2 off = (n * refr) * (0.6 + 0.7*msk) * (ior - 1.0);
    off += drift / vec2(uRes.x, uRes.y);

    vec3 samp = sampleField(fract(uv + off), 1.2 + 4.0*cen);

    // Fresnel-like edge
    float fres = pow(1.0 - clamp(msk, 0.0, 1.0), 2.0);

    // tint per plane (tight palette)
    vec3 tintA = vec3(0.20, 0.14, 0.35);
    vec3 tintB = vec3(0.78, 0.70, 0.96);
    vec3 tint = mix(tintA, tintB, 0.35 + 0.55*cen);

    vec3 layer = samp * tint;

    col = mix(col, col + layer, msk * (0.22 + 0.20*e));
    col += layer * fres * (0.06 + 0.12*tre);
  }

  // subtle vignette
  float r = length(px);
  col *= smoothstep(1.25, 0.35, r);

  // calm breathing
  col *= 0.94 + 0.12*e;

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
  for (let i = 0; i < w * h; i++) {
    const o = i * 4
    const v = Math.random() < 0.002 ? 10 + Math.random() * 18 : 0
    data[o + 0] = v
    data[o + 1] = v
    data[o + 2] = v
    data[o + 3] = 255
  }
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data)
  gl.bindTexture(gl.TEXTURE_2D, null)
}

export function createPhaseGlassTheme(): Theme {
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let progField: WebGLProgram | null = null
  let progGlass: WebGLProgram | null = null

  let texA: WebGLTexture | null = null
  let texB: WebGLTexture | null = null
  let fboA: WebGLFramebuffer | null = null
  let fboB: WebGLFramebuffer | null = null
  let ping = true

  let simW = 0
  let simH = 0

  // field uniforms
  let uPrevF: WebGLUniformLocation | null = null
  let uResF: WebGLUniformLocation | null = null
  let uTimeF: WebGLUniformLocation | null = null
  let uEnergyF: WebGLUniformLocation | null = null
  let uBassF: WebGLUniformLocation | null = null
  let uCentroidF: WebGLUniformLocation | null = null

  // glass uniforms
  let uFieldG: WebGLUniformLocation | null = null
  let uResG: WebGLUniformLocation | null = null
  let uTimeG: WebGLUniformLocation | null = null
  let uEnergyG: WebGLUniformLocation | null = null
  let uBassG: WebGLUniformLocation | null = null
  let uMidG: WebGLUniformLocation | null = null
  let uTrebleG: WebGLUniformLocation | null = null
  let uCentroidG: WebGLUniformLocation | null = null

  function ensureSim(gl: WebGL2RenderingContext, w: number, h: number) {
    const targetW = Math.min(760, Math.max(320, Math.floor(w * 0.68)))
    const targetH = Math.min(760, Math.max(320, Math.floor(h * 0.68)))
    if (targetW === simW && targetH === simH && texA && texB && fboA && fboB) return

    if (fboA) gl.deleteFramebuffer(fboA)
    if (fboB) gl.deleteFramebuffer(fboB)
    if (texA) gl.deleteTexture(texA)
    if (texB) gl.deleteTexture(texB)

    simW = targetW
    simH = targetH

    texA = createTex(gl, simW, simH)
    texB = createTex(gl, simW, simH)
    fboA = createFbo(gl, texA)
    fboB = createFbo(gl, texB)

    clearTex(gl, texA, simW, simH)
    clearTex(gl, texB, simW, simH)
    ping = true
  }

  return {
    name: 'phase-glass',
    init(gl) {
      tri = makeFullscreenTriangle(gl)
      progField = createProgram(gl, VS, FS_FIELD)
      progGlass = createProgram(gl, VS, FS_GLASS)

      uPrevF = gl.getUniformLocation(progField, 'uPrev')
      uResF = gl.getUniformLocation(progField, 'uRes')
      uTimeF = gl.getUniformLocation(progField, 'uTime')
      uEnergyF = gl.getUniformLocation(progField, 'uEnergy')
      uBassF = gl.getUniformLocation(progField, 'uBass')
      uCentroidF = gl.getUniformLocation(progField, 'uCentroid')

      uFieldG = gl.getUniformLocation(progGlass, 'uField')
      uResG = gl.getUniformLocation(progGlass, 'uRes')
      uTimeG = gl.getUniformLocation(progGlass, 'uTime')
      uEnergyG = gl.getUniformLocation(progGlass, 'uEnergy')
      uBassG = gl.getUniformLocation(progGlass, 'uBass')
      uMidG = gl.getUniformLocation(progGlass, 'uMid')
      uTrebleG = gl.getUniformLocation(progGlass, 'uTreble')
      uCentroidG = gl.getUniformLocation(progGlass, 'uCentroid')
    },
    render(gl, opts) {
      if (!tri || !progField || !progGlass) return
      ensureSim(gl, opts.width, opts.height)
      if (!texA || !texB || !fboA || !fboB) return

      const a = opts.audio
      const energy = a.energy ?? 0
      const bass = a.bass ?? 0
      const mid = a.mid ?? 0
      const treble = a.treble ?? 0
      const centroid = a.centroid ?? 0

      const src = ping ? texA : texB
      const dstFbo = ping ? fboB : fboA

      // Field update
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo)
      gl.viewport(0, 0, simW, simH)
      gl.useProgram(progField)
      gl.bindVertexArray(tri.vao)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, src)
      gl.uniform1i(uPrevF, 0)
      gl.uniform2f(uResF, simW, simH)
      gl.uniform1f(uTimeF, opts.time)
      gl.uniform1f(uEnergyF, energy)
      gl.uniform1f(uBassF, bass)
      gl.uniform1f(uCentroidF, centroid)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      // Glass render to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, opts.width, opts.height)
      gl.useProgram(progGlass)

      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA)
      gl.uniform1i(uFieldG, 0)

      gl.uniform2f(uResG, opts.width, opts.height)
      gl.uniform1f(uTimeG, opts.time)
      gl.uniform1f(uEnergyG, energy)
      gl.uniform1f(uBassG, bass)
      gl.uniform1f(uMidG, mid)
      gl.uniform1f(uTrebleG, treble)
      gl.uniform1f(uCentroidG, centroid)

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

      if (progField) gl.deleteProgram(progField)
      if (progGlass) gl.deleteProgram(progGlass)
      progField = null
      progGlass = null
    },
  }
}
