// web/app/home/player/visualizer/themes/gravitationalLattice.ts
// doesn't even render
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

// ---- Particle sim (data texture) ----
// One texel per particle: RG = pos (0..1), BA = vel (0..1 mapped from -1..1)
const FS_SIM = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrev;
uniform vec2 uTexRes;   // data texture dimensions (e.g. 8x8)
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

vec2 decodeVel(vec2 ba){
  // stored 0..1, decode to -1..1
  return ba * 2.0 - 1.0;
}

vec2 encodeVel(vec2 v){
  // clamp, encode to 0..1
  v = clamp(v, vec2(-1.0), vec2(1.0));
  return v * 0.5 + 0.5;
}

vec2 texelUvFromIndex(float idx){
  float w = uTexRes.x;
  float x = mod(idx, w);
  float y = floor(idx / w);
  return (vec2(x, y) + 0.5) / uTexRes;
}

void main(){
  // Determine particle index from fragment coord (we render a full-screen tri to the FBO sized as data tex)
  // so gl_FragCoord maps to texels directly.
  vec2 fc = gl_FragCoord.xy - vec2(0.5);
  float idx = fc.y * uTexRes.x + fc.x;

  vec4 s = texture(uPrev, (fc + 0.5) / uTexRes);
  vec2 pos = s.rg;
  vec2 vel = decodeVel(s.ba);

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

    // Keep the simulation spatially calm. Audio should light the lattice,
  // not yank its geometry around.
  float drive = smoothstep(0.05, 0.85, e);
  float damping = mix(0.986, 0.978, drive);
  float dt = 0.46;

  // Slow autonomous attractor. Centroid adds only a tiny phase bias.
  vec2 attract = vec2(0.5) + 0.16 * vec2(
    sin(uTime * 0.115 + 0.45 * cen),
    cos(uTime * 0.097 + 0.35 * cen)
  );

  vec2 toA = attract - pos;
  vec2 acc = 0.145 * toA;

  // Mild curl field: audio increases liveliness, not displacement.
  vec2 wind = vec2(
    sin(uTime * 0.17 + pos.y * 6.0),
    cos(uTime * 0.15 + pos.x * 6.0)
  );
  acc += wind * (0.012 + 0.010 * drive + 0.006 * tre);

  // Deterministic links. Do not let audio change topology.
  float N = uTexRes.x * uTexRes.y;
  float seed = idx;
  for (int k = 0; k < 4; k++){
    float r = hash12(vec2(seed, float(k) + 1.23));
    float j = floor(r * N);
    vec2 uvj = texelUvFromIndex(j);
    vec2 pj = texture(uPrev, uvj).rg;

    vec2 d = pj - pos;
    // wrap space (torus) for continuity
    d -= round(d);

    float dist = length(d) + 1e-4;
    vec2 dir = d / dist;

       // Rest length breathes slowly, but not from raw music bands.
    float rest = 0.19 + 0.035 * sin(uTime * 0.075 + float(k) * 1.7);
    float kSpring = 0.24 + 0.055 * drive;
    float force = (dist - rest) * kSpring;

    acc += dir * force;
  }

  // Repulsion to prevent collapse (soft)
    float rep = 0.014 + 0.006 * drive;
  acc += normalize(vec2(hash12(vec2(idx, 9.1)) - 0.5, hash12(vec2(idx, 2.7)) - 0.5)) * rep;

  // Integrate
  vel += acc * dt;
  vel *= damping;

  pos += vel * dt * 0.05;

  // wrap
  pos = fract(pos);

  outColor = vec4(pos, encodeVel(vel));
}
`;

// ---- Render: accumulate point glow + link glow ----
const FS_RENDER = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform sampler2D uState;
uniform vec2 uTexRes;
uniform float uTime;

uniform float uEnergy;
uniform float uMid;
uniform float uCentroid;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 texelUvFromIndex(float idx){
  float w = uTexRes.x;
  float x = mod(idx, w);
  float y = floor(idx / w);
  return (vec2(x, y) + 0.5) / uTexRes;
}

float segDist(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h);
}

void main(){
  vec2 px = (vUv*uRes - 0.5*uRes) / min(uRes.x, uRes.y);
  // map pixel to “space” in [-0.5..0.5] but we render in wrapped 0..1 particle space
  vec2 p = fract(px * 0.85 + 0.5);

  float e = clamp(uEnergy, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  float N = uTexRes.x * uTexRes.y;

  // palette: deep → lavender
  vec3 colA = vec3(0.03, 0.03, 0.05);
  vec3 colB = vec3(0.30, 0.22, 0.55);
  vec3 colC = vec3(0.85, 0.78, 0.98);

  vec3 col = colA;

  // render modest particle count (we assume texRes sized accordingly; if we use 8x8 we’ll take first 36)
  float count = min(N, 36.0);

  // glow radii (almost constant; structure does the work)
  float pointK = mix(220.0, 160.0, e);
  float linkK  = mix(160.0, 120.0, e);

    // Link topology is stable; movement comes from node drift, not rewiring.
  float topo = 0.0;

  for (int i = 0; i < 36; i++){
    float fi = float(i);
    if (fi >= count) break;

    vec2 uvi = texelUvFromIndex(fi);
    vec2 pi = texture(uState, uvi).rg;

    // point glow (wrap distance)
    vec2 d = pi - p;
    d -= round(d);
    float r2 = dot(d, d);
    float g = exp(-pointK * r2);
    col += mix(colB, colC, 0.55 + 0.45*cen) * g * (0.7 + 0.5*e);

    // links (4 per node, deterministic)
    float seed = fi + topo;
    for (int k = 0; k < 4; k++){
      float r = hash12(vec2(seed, float(k) + 1.23));
      float j = floor(r * N);
      vec2 pj = texture(uState, texelUvFromIndex(j)).rg;

      // compute shortest distance to segment in wrapped space:
      // we pick representation with minimal wrap by shifting endpoints near p
      vec2 a = pi;
      vec2 b = pj;

      // choose wrap shifts to minimize distance to p
      vec2 aShift = a - round(a - p);
      vec2 bShift = b - round(b - p);

      float sd = segDist(p, aShift, bShift);
      float lg = exp(-linkK * sd * sd) * (0.12 + 0.22*mid);

      col += colB * lg;
    }
  }

  // subtle vignette
  float r = length(px);
  col *= smoothstep(1.25, 0.35, r);

  // energy breathing (gentle)
  col *= 0.93 + 0.18*e;

  fragColor = vec4(col, 1.0);
}
`;

function createTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

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

function seedState(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number,
) {
  // Seed positions in a loose ring, velocities small.
  const data = new Uint8Array(w * h * 4);
  const N = w * h;
  for (let i = 0; i < N; i++) {
    const t = (i / Math.max(1, N - 1)) * Math.PI * 2;
    const rad = 0.22 + 0.08 * Math.random();
    const x = 0.5 + rad * Math.cos(t) + 0.02 * (Math.random() - 0.5);
    const y = 0.5 + rad * Math.sin(t) + 0.02 * (Math.random() - 0.5);

    const vx = 0.5 + 0.08 * (Math.random() - 0.5); // encoded 0..1
    const vy = 0.5 + 0.08 * (Math.random() - 0.5);

    const o = i * 4;
    data[o + 0] = Math.max(0, Math.min(255, Math.floor((x % 1) * 255)));
    data[o + 1] = Math.max(0, Math.min(255, Math.floor((y % 1) * 255)));
    data[o + 2] = Math.max(0, Math.min(255, Math.floor(vx * 255)));
    data[o + 3] = Math.max(0, Math.min(255, Math.floor(vy * 255)));
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

export function createGravitationalLatticeTheme(): Theme {
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;

  let progSim: WebGLProgram | null = null;
  let progRender: WebGLProgram | null = null;

  let texA: WebGLTexture | null = null;
  let texB: WebGLTexture | null = null;
  let fboA: WebGLFramebuffer | null = null;
  let fboB: WebGLFramebuffer | null = null;
  let ping = true;

  let lastTime = 0;
  let smoothEnergy = 0;
  let smoothBass = 0;
  let smoothMid = 0;
  let smoothTreble = 0;
  let smoothCentroid = 0;

  // data texture resolution
  const tw = 8;
  const th = 8;

  // sim uniforms
  let uPrevS: WebGLUniformLocation | null = null;
  let uTexResS: WebGLUniformLocation | null = null;
  let uTimeS: WebGLUniformLocation | null = null;
  let uEnergyS: WebGLUniformLocation | null = null;
  let uBassS: WebGLUniformLocation | null = null;
  let uMidS: WebGLUniformLocation | null = null;
  let uTrebleS: WebGLUniformLocation | null = null;
  let uCentroidS: WebGLUniformLocation | null = null;

  // render uniforms
  let uResR: WebGLUniformLocation | null = null;
  let uStateR: WebGLUniformLocation | null = null;
  let uTexResR: WebGLUniformLocation | null = null;
  let uTimeR: WebGLUniformLocation | null = null;
  let uEnergyR: WebGLUniformLocation | null = null;
  let uMidR: WebGLUniformLocation | null = null;
  let uCentroidR: WebGLUniformLocation | null = null;

  return {
    name: "gravitational-lattice",
    init(gl) {
      tri = makeFullscreenTriangle(gl);
      progSim = createProgram(gl, VS, FS_SIM);
      progRender = createProgram(gl, VS, FS_RENDER);

      texA = createTex(gl, tw, th);
      texB = createTex(gl, tw, th);
      fboA = createFbo(gl, texA);
      fboB = createFbo(gl, texB);

      // seed with byte data (works even if texture storage is 16F; values are normalized)
      seedState(gl, texA, tw, th);
      seedState(gl, texB, tw, th);
      ping = true;

      // sim uniforms
      uPrevS = gl.getUniformLocation(progSim, "uPrev");
      uTexResS = gl.getUniformLocation(progSim, "uTexRes");
      uTimeS = gl.getUniformLocation(progSim, "uTime");
      uEnergyS = gl.getUniformLocation(progSim, "uEnergy");
      uBassS = gl.getUniformLocation(progSim, "uBass");
      uMidS = gl.getUniformLocation(progSim, "uMid");
      uTrebleS = gl.getUniformLocation(progSim, "uTreble");
      uCentroidS = gl.getUniformLocation(progSim, "uCentroid");

      // render uniforms
      uResR = gl.getUniformLocation(progRender, "uRes");
      uStateR = gl.getUniformLocation(progRender, "uState");
      uTexResR = gl.getUniformLocation(progRender, "uTexRes");
      uTimeR = gl.getUniformLocation(progRender, "uTime");
      uEnergyR = gl.getUniformLocation(progRender, "uEnergy");
      uMidR = gl.getUniformLocation(progRender, "uMid");
      uCentroidR = gl.getUniformLocation(progRender, "uCentroid");
    },
    render(gl, opts) {
      if (!tri || !progSim || !progRender || !texA || !texB || !fboA || !fboB)
        return;

      const a = opts.audio;
      const rawEnergy = a.energy ?? 0;
      const rawBass = a.bass ?? 0;
      const rawMid = a.mid ?? 0;
      const rawTreble = a.treble ?? 0;
      const rawCentroid = a.centroid ?? 0;

      const dt =
        lastTime > 0
          ? Math.max(0, Math.min(0.08, opts.time - lastTime))
          : 1 / 60;
      lastTime = opts.time;

      const follow = 1 - Math.exp(-dt * 5.5);

      smoothEnergy += (rawEnergy - smoothEnergy) * follow;
      smoothBass += (rawBass - smoothBass) * follow;
      smoothMid += (rawMid - smoothMid) * follow;
      smoothTreble += (rawTreble - smoothTreble) * follow;
      smoothCentroid += (rawCentroid - smoothCentroid) * follow;

      const energy = smoothEnergy;
      const bass = smoothBass;
      const mid = smoothMid;
      const treble = smoothTreble;
      const centroid = smoothCentroid;

      const src = ping ? texA : texB;
      const dstFbo = ping ? fboB : fboA;

      const previousFbo = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;
      const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

      // SIM PASS (render to data texture sized viewport)
      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
      gl.viewport(0, 0, tw, th);
      gl.useProgram(progSim);
      gl.bindVertexArray(tri.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);
      gl.uniform1i(uPrevS, 0);
      gl.uniform2f(uTexResS, tw, th);
      gl.uniform1f(uTimeS, opts.time);
      gl.uniform1f(uEnergyS, energy);
      gl.uniform1f(uBassS, bass);
      gl.uniform1f(uMidS, mid);
      gl.uniform1f(uTrebleS, treble);
      gl.uniform1f(uCentroidS, centroid);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // RENDER PASS (to whatever target the engine had bound)
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFbo);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3],
      );
      gl.useProgram(progRender);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA); // newest state
      gl.uniform1i(uStateR, 0);
      gl.uniform2f(uResR, opts.width, opts.height);
      gl.uniform2f(uTexResR, tw, th);
      gl.uniform1f(uTimeR, opts.time);
      gl.uniform1f(uEnergyR, energy);
      gl.uniform1f(uMidR, mid);
      gl.uniform1f(uCentroidR, centroid);

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

      if (progSim) gl.deleteProgram(progSim);
      if (progRender) gl.deleteProgram(progRender);
      progSim = null;
      progRender = null;
    },
  };
}
