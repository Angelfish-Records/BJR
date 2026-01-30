import type { Theme } from "../types";
import { createProgram, makeFullscreenTriangle } from "../gl";

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FS_INK = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;

uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h);
}

vec2 rot(vec2 p, float a){
  float s=sin(a), c=cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

void main(){
  vec2 uv = vUv;
  vec2 px = 1.0 / uRes;

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  // prior ink + slow decay (long memory)
  vec3 prev = texture(uPrev, uv).rgb;

  // gentle advection: rotate around center slowly (gives precession continuity)
  vec2 p = uv - 0.5;
  float swirl = (0.06 + 0.10*cen) * sin(uTime*0.11);
  vec2 adv = rot(p, swirl) - p;
  vec2 uv2 = fract(uv + adv * (0.12 + 0.12*e));
  prev = mix(prev, texture(uPrev, uv2).rgb, 0.35);

  float decay = 0.992 - 0.010*tre;  // treble slightly increases “dryness”
  vec3 ink = prev * decay;

  // Draw strokes: 8 orbits, each approximated as polyline of 12 segments.
  // Audio steers geometry (locking), not thickness.
  vec2 aspect = vec2(uRes.x/uRes.y, 1.0);
  vec2 q = (uv - 0.5) * aspect;

  float baseT = uTime * 0.18;
  float lock = smoothstep(0.20, 0.85, e) * (0.30 + 0.55*mid); // phase locking strength

  float minD = 1e9;
  vec3 add = vec3(0.0);

  for(int s=0;s<8;s++){
    float fs = float(s);

    // centres (slow drift; bass shifts in/out)
    float angC = baseT*0.5 + fs*1.1 + 2.0*cen;
    vec2 C = 0.22 * vec2(cos(angC), sin(angC)) * (0.70 + 0.40*bass);

    // orbit radii
    float R = 0.18 + 0.05*sin(fs*2.0 + cen*3.0);

    // phase: each stroke has its own oscillator; lock pulls them toward shared phase.
    float w = 0.55 + 0.08*sin(fs + cen*4.0) + 0.12*tre;
    float phi = fs*0.9 + uTime*w;
    float shared = uTime*(0.55 + 0.10*cen);
    phi = mix(phi, shared + fs*0.35, lock);

    // generate polyline samples
    vec2 prevP = C + R * vec2(cos(phi), sin(phi));
    for(int i=1;i<=12;i++){
      float fi = float(i)/12.0;

      // slight lissajous warp (centroid steers)
      float a = phi + fi*6.28318*(1.0 + 0.25*cen);
      vec2 curP = C + R * vec2(cos(a), sin(a));
      curP += 0.06 * vec2(sin(a*2.0 + fs), cos(a*3.0 - fs)) * (0.25 + 0.75*cen);

      float d = sdSegment(q, prevP, curP);
      minD = min(minD, d);

      prevP = curP;
    }

    // tint per stroke (subtle, premium)
    vec3 colA = vec3(0.10, 0.06, 0.12);
    vec3 colB = vec3(0.80, 0.72, 0.96);
    vec3 strokeCol = mix(colA, colB, 0.35 + 0.55*cen);
    float wStroke = 0.0045; // constant thickness-ish
    float inkHere = exp(-pow(minD / wStroke, 2.0)) * (0.12 + 0.22*e);

    add += strokeCol * inkHere;
  }

  ink += add;

  // tiny noise to stop banding
  float n = (hash12(uv*uRes + uTime) - 0.5) * 0.003;
  ink += vec3(n);

  ink = clamp(ink, 0.0, 1.0);
  outColor = vec4(ink, 1.0);
}
`;

const FS_DRAW = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uEnergy;
uniform float uCentroid;

void main(){
  vec2 uv = vUv;
  vec2 px = (uv*uRes - 0.5*uRes) / min(uRes.x,uRes.y);

  vec3 ink = texture(uTex, uv).rgb;

  float e = clamp(uEnergy, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  // tonal mapping: dark velvet + luminous ink
  float lum = dot(ink, vec3(0.299,0.587,0.114));
  lum = pow(lum, 0.78);

  vec3 bg = vec3(0.02, 0.02, 0.03);
  vec3 glowA = vec3(0.20, 0.14, 0.35);
  vec3 glowB = vec3(0.90, 0.85, 1.00);

  vec3 col = bg;
  col += glowA * lum * (0.55 + 0.55*e);
  col += glowB * ink * (0.18 + 0.35*cen);

  // vignette
  float r = length(px);
  col *= smoothstep(1.25, 0.35, r);

  fragColor = vec4(col, 1.0);
}
`;

function createTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function createFbo(gl: WebGL2RenderingContext, tex: WebGLTexture) {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Failed to create framebuffer");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

function clearTex(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number,
) {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const s = Math.random() < 0.0015 ? 18 + Math.random() * 18 : 0;
    data[o + 0] = s;
    data[o + 1] = s;
    data[o + 2] = s;
    data[o + 3] = 255;
  }
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    w,
    h,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createOrbitalScriptTheme(): Theme {
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let progInk: WebGLProgram | null = null;
  let progDraw: WebGLProgram | null = null;

  let texA: WebGLTexture | null = null;
  let texB: WebGLTexture | null = null;
  let fboA: WebGLFramebuffer | null = null;
  let fboB: WebGLFramebuffer | null = null;
  let ping = true;

  let simW = 0;
  let simH = 0;

  // uniforms ink
  let uPrevI: WebGLUniformLocation | null = null;
  let uResI: WebGLUniformLocation | null = null;
  let uTimeI: WebGLUniformLocation | null = null;
  let uEnergyI: WebGLUniformLocation | null = null;
  let uBassI: WebGLUniformLocation | null = null;
  let uMidI: WebGLUniformLocation | null = null;
  let uTrebleI: WebGLUniformLocation | null = null;
  let uCentroidI: WebGLUniformLocation | null = null;

  // uniforms draw
  let uTexD: WebGLUniformLocation | null = null;
  let uResD: WebGLUniformLocation | null = null;
  let uEnergyD: WebGLUniformLocation | null = null;
  let uCentroidD: WebGLUniformLocation | null = null;

  function ensureSim(gl: WebGL2RenderingContext, w: number, h: number) {
    const targetW = Math.min(840, Math.max(360, Math.floor(w * 0.72)));
    const targetH = Math.min(840, Math.max(360, Math.floor(h * 0.72)));
    if (targetW === simW && targetH === simH && texA && texB && fboA && fboB)
      return;

    if (fboA) gl.deleteFramebuffer(fboA);
    if (fboB) gl.deleteFramebuffer(fboB);
    if (texA) gl.deleteTexture(texA);
    if (texB) gl.deleteTexture(texB);

    simW = targetW;
    simH = targetH;

    texA = createTex(gl, simW, simH);
    texB = createTex(gl, simW, simH);
    fboA = createFbo(gl, texA);
    fboB = createFbo(gl, texB);

    clearTex(gl, texA, simW, simH);
    clearTex(gl, texB, simW, simH);

    ping = true;
  }

  return {
    name: "orbital-script",
    init(gl) {
      tri = makeFullscreenTriangle(gl);
      progInk = createProgram(gl, VS, FS_INK);
      progDraw = createProgram(gl, VS, FS_DRAW);

      uPrevI = gl.getUniformLocation(progInk, "uPrev");
      uResI = gl.getUniformLocation(progInk, "uRes");
      uTimeI = gl.getUniformLocation(progInk, "uTime");
      uEnergyI = gl.getUniformLocation(progInk, "uEnergy");
      uBassI = gl.getUniformLocation(progInk, "uBass");
      uMidI = gl.getUniformLocation(progInk, "uMid");
      uTrebleI = gl.getUniformLocation(progInk, "uTreble");
      uCentroidI = gl.getUniformLocation(progInk, "uCentroid");

      uTexD = gl.getUniformLocation(progDraw, "uTex");
      uResD = gl.getUniformLocation(progDraw, "uRes");
      uEnergyD = gl.getUniformLocation(progDraw, "uEnergy");
      uCentroidD = gl.getUniformLocation(progDraw, "uCentroid");
    },
    render(gl, opts) {
      if (!tri || !progInk || !progDraw) return;
      ensureSim(gl, opts.width, opts.height);
      if (!texA || !texB || !fboA || !fboB) return;

      const a = opts.audio;
      const energy = a.energy ?? 0;
      const bass = a.bass ?? 0;
      const mid = a.mid ?? 0;
      const treble = a.treble ?? 0;
      const centroid = a.centroid ?? 0;

      const src = ping ? texA : texB;
      const dstFbo = ping ? fboB : fboA;

      // Ink update
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
      gl.viewport(0, 0, simW, simH);
      gl.useProgram(progInk);
      gl.bindVertexArray(tri.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(uPrevI, 0);
      gl.uniform2f(uResI, simW, simH);
      gl.uniform1f(uTimeI, opts.time);
      gl.uniform1f(uEnergyI, energy);
      gl.uniform1f(uBassI, bass);
      gl.uniform1f(uMidI, mid);
      gl.uniform1f(uTrebleI, treble);
      gl.uniform1f(uCentroidI, centroid);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // Draw to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, opts.width, opts.height);
      gl.useProgram(progDraw);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA);
      gl.uniform1i(uTexD, 0);

      gl.uniform2f(uResD, opts.width, opts.height);
      gl.uniform1f(uEnergyD, energy);
      gl.uniform1f(uCentroidD, centroid);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);

      ping = !ping;
    },
    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf);
      if (tri?.vao) gl.deleteVertexArray(tri.vao);
      tri = null;

      if (fboA) gl.deleteFramebuffer(fboA);
      if (fboB) gl.deleteFramebuffer(fboB);
      if (texA) gl.deleteTexture(texA);
      if (texB) gl.deleteTexture(texB);
      fboA = null;
      fboB = null;
      texA = null;
      texB = null;
      simW = 0;
      simH = 0;

      if (progInk) gl.deleteProgram(progInk);
      if (progDraw) gl.deleteProgram(progDraw);
      progInk = null;
      progDraw = null;
    },
  };
}
