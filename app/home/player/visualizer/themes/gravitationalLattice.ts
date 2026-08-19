// web/app/home/player/visualizer/themes/gravitationalLattice.ts
// Hardened around a locked 8x8 toroidal spring network: stable topology, deterministic seed,
// fixed-step autonomous physics, progress-authored coherence, and audio-reactive material only.
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
uniform vec2 uTexRes;   // data texture dimensions (8x8)
uniform float uTime;

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

  // GEOMETRY LOCK: the physical world is autonomous. Audio does not change
  // damping, spring topology, rest lengths, attractor position or repulsion.
  const float damping = 0.983;
  const float dt = 0.46;

  // Slow autonomous attractor.
  vec2 attract = vec2(0.5) + 0.16 * vec2(
    sin(uTime * 0.115),
    cos(uTime * 0.097)
  );

  vec2 toA = attract - pos;
  vec2 acc = 0.145 * toA;

  // Mild autonomous curl field.
  vec2 wind = vec2(
    sin(uTime * 0.17 + pos.y * 6.0),
    cos(uTime * 0.15 + pos.x * 6.0)
  );
  acc += wind * 0.016;

  // LOCKED TOPOLOGY: four deterministic neighbours in toroidal space.
  float N = uTexRes.x * uTexRes.y;
  float seed = idx;
  for (int k = 0; k < 4; k++){
    float r = hash12(vec2(seed, float(k) + 1.23));
    float j = floor(r * N);
    vec2 uvj = texelUvFromIndex(j);
    vec2 pj = texture(uPrev, uvj).rg;

    vec2 d = pj - pos;
    d -= round(d);

    float dist = length(d) + 1e-4;
    vec2 dir = d / dist;

    float rest = 0.19 + 0.035 * sin(uTime * 0.075 + float(k) * 1.7);
    float force = (dist - rest) * 0.262;
    acc += dir * force;
  }

  // Soft deterministic repulsion prevents collapse.
  vec2 repDir = vec2(
    hash12(vec2(idx, 9.1)) - 0.5,
    hash12(vec2(idx, 2.7)) - 0.5
  );
  float repLen = max(length(repDir), 1e-4);
  acc += (repDir / repLen) * 0.016;

  // One fixed 60 Hz physical step. TypeScript performs as many of these tiny
  // passes as scene time requires, making 30/60 FPS composition equivalent.
  vel += acc * dt;
  vel *= damping;
  pos += vel * dt * 0.05;

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
uniform float uTrackProgress;

uniform float uEnergy;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
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
  float denom = max(dot(ba, ba), 1e-6);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba*h);
}

vec2 latticeTarget(float idx){
  // First 36 visible nodes occupy every cell of a deterministic 6x6 hex-like
  // scaffold. Neighbours outside the visible 36 reuse the same stable slots.
  float slot = mod(idx * 17.0 + 5.0, 36.0);
  float row = floor(slot / 6.0);
  float col = mod(slot, 6.0);

  vec2 q = vec2(
    (col - 2.5) * 0.112 + mod(row, 2.0) * 0.056,
    (row - 2.5) * 0.102
  );

  vec2 jitter = vec2(
    hash12(vec2(idx, 4.17)),
    hash12(vec2(idx, 8.63))
  ) - 0.5;
  q += jitter * 0.012;

  float a = 0.11;
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  return fract(rot * q + 0.5);
}

vec2 coherentPos(vec2 simPos, float idx, float coherence){
  vec2 target = latticeTarget(idx);
  vec2 d = target - simPos;
  d -= round(d);
  return fract(simPos + d * coherence);
}

vec3 accentPalette(float t){
  const float TAU = 6.28318530718;
  vec3 violet = vec3(0.62, 0.30, 0.98);
  vec3 electricBlue = vec3(0.10, 0.60, 1.00);
  vec3 hotOrange = vec3(1.00, 0.40, 0.06);

  float wV = 0.5 + 0.5*cos(TAU * (t + 0.00));
  float wB = 0.5 + 0.5*cos(TAU * (t - 0.33));
  float wO = 0.5 + 0.5*cos(TAU * (t - 0.66));

  vec3 col = violet * wV * wV + electricBlue * wB * wB + hotOrange * wO * wO;
  float norm = max(wV * wV + wB * wB + wO * wO, 1e-4);
  return col / norm;
}

void main(){
  vec2 px = (vUv*uRes - 0.5*uRes) / min(uRes.x, uRes.y);
  vec2 p = fract(px * 0.85 + 0.5);

  float e = clamp(uEnergy, 0.0, 1.0);
  float rms = clamp(uRms, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);
  float progress = clamp(uTrackProgress, 0.0, 1.0);

  // Long-form verb: COHERE. These chapter ramps are deterministic from
  // recording position, so seek/recreation/offline export recompose instantly.
  float chapterA = smoothstep(0.08, 0.32, progress);
  float chapterB = smoothstep(0.42, 0.72, progress);
  float chapterC = smoothstep(0.78, 0.96, progress);
  float coherence = 0.07 + 0.21*chapterA + 0.24*chapterB + 0.27*chapterC;

  float N = uTexRes.x * uTexRes.y;
  float count = min(N, 36.0);

  vec3 base = vec3(0.010, 0.009, 0.020);
  vec3 violet = vec3(0.42, 0.18, 0.78);
  vec3 electricBlue = vec3(0.10, 0.60, 1.00);
  vec3 hotOrange = vec3(1.00, 0.40, 0.06);
  vec3 coolCore = vec3(0.82, 0.92, 1.00);
  vec3 warmCore = vec3(1.00, 0.84, 0.58);

  float vignette = 1.0 - smoothstep(0.28, 1.22, length(px));
  float shimmer = 0.97 + 0.03*sin(uTime * 0.31 + p.x*2.2 - p.y*1.7);
  float ambientPhase = 0.055*uTime + 0.18*progress + 0.14*cen + 0.09*p.x - 0.07*p.y;
  vec3 ambientTint = accentPalette(ambientPhase);
  vec3 col = base * (0.70 + 0.30*vignette) * shimmer;
  col += ambientTint * (0.006 + 0.012*chapterB) * vignette;

  // Much narrower analytic glows than the legacy state: nodes remain luminous
  // but no longer merge into a single clipped white mass.
  const float pointK = 2600.0;
  const float linkK = 15000.0;
  float structureGain = 0.62 + 0.38*coherence;

  for (int i = 0; i < 36; i++){
    float fi = float(i);
    if (fi >= count) break;

    vec2 uvi = texelUvFromIndex(fi);
    vec2 pi = coherentPos(texture(uState, uvi).rg, fi, coherence);

    vec2 d = pi - p;
    d -= round(d);
    float r2 = dot(d, d);

    // Bass owns gravitational halo; RMS owns sustained node-core emission.
    float halo = exp(-pointK * 0.22 * r2);
    float body = exp(-pointK * r2);
    float hotCore = exp(-pointK * 4.2 * r2);

    float nodePhase = 0.052*uTime + 0.020*fi + 0.26*progress + 0.12*cen + 0.22*(pi.x - pi.y);
    vec3 nodeTint = accentPalette(nodePhase);
    vec3 haloTint = mix(violet, electricBlue, 0.50 + 0.50*sin(6.28318530718 * (nodePhase + 0.14)));
    vec3 bodyTint = mix(violet, nodeTint, 0.62);
    vec3 coreTint = mix(
      mix(nodeTint, warmCore, 0.30 + 0.20*bass),
      coolCore,
      0.36 + 0.32*cen
    );

    col += haloTint * halo * (0.028 + 0.070*bass);
    col += bodyTint * body * (0.090 + 0.120*rms + 0.030*e);
    col += coreTint * hotCore * (0.072 + 0.155*rms + 0.045*bass);

    // LOCKED TOPOLOGY: four deterministic links per node. Progress changes
    // their spatial coherence, never their identity.
    float seed = fi;
    for (int k = 0; k < 4; k++){
      float r = hash12(vec2(seed, float(k) + 1.23));
      float j = floor(r * N);
      vec2 pj = coherentPos(
        texture(uState, texelUvFromIndex(j)).rg,
        j,
        coherence
      );

      vec2 aShift = pi - round(pi - p);
      vec2 bShift = pj - round(pj - p);

      float sd = segDist(p, aShift, bShift);
      float broad = exp(-linkK * 0.34 * sd * sd);
      float filament = exp(-linkK * sd * sd);
      float fine = exp(-linkK * 3.4 * sd * sd);

      float linkPhase =
        0.078*uTime
        + 0.017*(fi + j)
        + 0.30*progress
        + 0.16*cen
        + 0.65*(aShift.x - bShift.y);
      vec3 broadTint = mix(violet, electricBlue, 0.50 + 0.50*sin(6.28318530718 * (linkPhase + 0.07)));
      vec3 filamentTint = accentPalette(linkPhase + 0.10*mid + 0.05*tre);
      vec3 fineTint = mix(electricBlue, hotOrange, 0.50 + 0.50*sin(6.28318530718 * (linkPhase + 0.19)));

      // Mid owns filament body; treble reveals the fine electrical core.
      col += broadTint * broad * (0.010 + 0.018*mid) * structureGain;
      col += filamentTint * filament * (0.030 + 0.068*mid) * structureGain;
      col += fineTint * fine * (0.010 + 0.048*tre + 0.010*bass) * structureGain;
    }
  }

  col *= 0.76 + 0.24*vignette;

  // Restrained energy lift, then filmic exponential tone mapping. The latter is
  // the anti-whiteout guardrail: overlapping glows retain internal structure.
  col *= 0.96 + 0.08*e;
  col = vec3(1.0) - exp(-col * 1.35);
  col = pow(max(col, vec3(0.0)), vec3(0.94));

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
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

function deterministic01(index: number, salt: number): number {
  let x =
    Math.imul(index + 1, 0x45d9f3b) ^ Math.imul(salt + 1, 0x119de1f3);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return (x >>> 0) / 0x100000000;
}

function seedState(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number,
) {
  // Deterministic loose ring: realtime/offline and stage recreation begin from
  // the same physical state instead of relying on runtime randomness.
  const data = new Uint8Array(w * h * 4);
  const N = w * h;
  for (let i = 0; i < N; i++) {
    const t = (i / Math.max(1, N - 1)) * Math.PI * 2;
    const rad = 0.22 + 0.08 * deterministic01(i, 0);
    const x =
      0.5 + rad * Math.cos(t) + 0.02 * (deterministic01(i, 1) - 0.5);
    const y =
      0.5 + rad * Math.sin(t) + 0.02 * (deterministic01(i, 2) - 0.5);

    const vx = 0.5 + 0.08 * (deterministic01(i, 3) - 0.5);
    const vy = 0.5 + 0.08 * (deterministic01(i, 4) - 0.5);

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
  let simTime = 0;
  let simAccumulator = 0;
  let smoothEnergy = 0;
  let smoothRms = 0;
  let smoothBass = 0;
  let smoothMid = 0;
  let smoothTreble = 0;
  let smoothCentroid = 0;

  // GEOMETRY LOCK: preserve the original 8x8 state lattice.
  const tw = 8;
  const th = 8;
  const simStepSec = 1 / 60;
  const maxSimStepsPerFrame = 5;

  // sim uniforms
  let uPrevS: WebGLUniformLocation | null = null;
  let uTexResS: WebGLUniformLocation | null = null;
  let uTimeS: WebGLUniformLocation | null = null;

  // render uniforms
  let uResR: WebGLUniformLocation | null = null;
  let uStateR: WebGLUniformLocation | null = null;
  let uTexResR: WebGLUniformLocation | null = null;
  let uTimeR: WebGLUniformLocation | null = null;
  let uTrackProgressR: WebGLUniformLocation | null = null;
  let uEnergyR: WebGLUniformLocation | null = null;
  let uRmsR: WebGLUniformLocation | null = null;
  let uBassR: WebGLUniformLocation | null = null;
  let uMidR: WebGLUniformLocation | null = null;
  let uTrebleR: WebGLUniformLocation | null = null;
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

      // render uniforms
      uResR = gl.getUniformLocation(progRender, "uRes");
      uStateR = gl.getUniformLocation(progRender, "uState");
      uTexResR = gl.getUniformLocation(progRender, "uTexRes");
      uTimeR = gl.getUniformLocation(progRender, "uTime");
      uTrackProgressR = gl.getUniformLocation(progRender, "uTrackProgress");
      uEnergyR = gl.getUniformLocation(progRender, "uEnergy");
      uRmsR = gl.getUniformLocation(progRender, "uRms");
      uBassR = gl.getUniformLocation(progRender, "uBass");
      uMidR = gl.getUniformLocation(progRender, "uMid");
      uTrebleR = gl.getUniformLocation(progRender, "uTreble");
      uCentroidR = gl.getUniformLocation(progRender, "uCentroid");

      lastTime = 0;
      simTime = 0;
      simAccumulator = 0;
    },
    render(gl, opts) {
      if (!tri || !progSim || !progRender || !texA || !texB || !fboA || !fboB)
        return;

      const a = opts.audio;
      const rawEnergy = Math.max(0, Math.min(1, a.energy ?? 0));
      const rawRms = Math.max(0, Math.min(1, a.rms ?? rawEnergy));
      const rawBass = Math.max(0, Math.min(1, a.bass ?? rawEnergy));
      const rawMid = Math.max(0, Math.min(1, a.mid ?? rawEnergy));
      const rawTreble = Math.max(0, Math.min(1, a.treble ?? rawEnergy));
      const rawCentroid = Math.max(0, Math.min(1, a.centroid ?? 0.5));
      const trackProgress01 = Math.max(
        0,
        Math.min(1, opts.trackProgress01 ?? 0),
      );

      const isFirstFrame = lastTime <= 0;
      const sceneDt = isFirstFrame
        ? simStepSec
        : Math.max(0, Math.min(0.08, opts.time - lastTime));
      if (isFirstFrame) simTime = opts.time - simStepSec;
      lastTime = opts.time;

      const follow = 1 - Math.exp(-sceneDt * 5.5);

      smoothEnergy += (rawEnergy - smoothEnergy) * follow;
      smoothRms += (rawRms - smoothRms) * follow;
      smoothBass += (rawBass - smoothBass) * follow;
      smoothMid += (rawMid - smoothMid) * follow;
      smoothTreble += (rawTreble - smoothTreble) * follow;
      smoothCentroid += (rawCentroid - smoothCentroid) * follow;

      const energy = smoothEnergy;
      const rms = smoothRms;
      const bass = smoothBass;
      const mid = smoothMid;
      const treble = smoothTreble;
      const centroid = smoothCentroid;

      const previousFbo = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;
      const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

      // Advance autonomous physics at a fixed 60 Hz independent of render FPS.
      simAccumulator = Math.min(
        simAccumulator + sceneDt,
        simStepSec * maxSimStepsPerFrame,
      );
      let simSteps = Math.min(
        maxSimStepsPerFrame,
        Math.floor((simAccumulator + 1e-9) / simStepSec),
      );

      gl.bindVertexArray(tri.vao);
      gl.useProgram(progSim);
      gl.uniform1i(uPrevS, 0);
      gl.uniform2f(uTexResS, tw, th);

      while (simSteps > 0) {
        simTime += simStepSec;
        gl.uniform1f(uTimeS, simTime);
        const src = ping ? texA : texB;
        const dstFbo = ping ? fboB : fboA;

        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
        gl.viewport(0, 0, tw, th);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        ping = !ping;
        simAccumulator = Math.max(0, simAccumulator - simStepSec);
        simSteps -= 1;
      }

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
      gl.bindTexture(gl.TEXTURE_2D, ping ? texA : texB);
      gl.uniform1i(uStateR, 0);
      gl.uniform2f(uResR, opts.width, opts.height);
      gl.uniform2f(uTexResR, tw, th);
      gl.uniform1f(uTimeR, opts.time);
      gl.uniform1f(uTrackProgressR, trackProgress01);
      gl.uniform1f(uEnergyR, energy);
      gl.uniform1f(uRmsR, rms);
      gl.uniform1f(uBassR, bass);
      gl.uniform1f(uMidR, mid);
      gl.uniform1f(uTrebleR, treble);
      gl.uniform1f(uCentroidR, centroid);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);
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
      lastTime = 0;
      simTime = 0;
      simAccumulator = 0;
    },
  };
}

