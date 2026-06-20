// web/app/home/player/visualizer/themes/orbitalScript.ts
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
  float denom = max(dot(ba, ba), 0.00001);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba*h);
}

vec2 rot(vec2 p, float a){
  float s = sin(a);
  float c = cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

float ropeNoise(float a, float seed, float t){
  return
    0.45 * sin(a*1.17 + seed*2.10 + t*0.43) +
    0.32 * sin(a*2.31 - seed*1.70 - t*0.29) +
    0.23 * sin(a*3.73 + seed*4.60 + t*0.17);
}

void main(){
  vec2 uv = vUv;

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = uv - 0.5;

  // Feedback field: slow rotational smear plus uneven zoom drift.
  float wooze = 0.35 + 0.65 * smoothstep(0.05, 0.85, e);
  float memoryRot =
    0.020 * sin(uTime*0.13) +
    0.014 * sin(uTime*0.041 + bass*2.0);

  float memoryZoom =
    1.0 +
    0.010 * sin(uTime*0.091) +
    0.007 * sin(uTime*0.033 + 2.5);

  vec2 drift = vec2(
    0.0045 * sin(uTime*0.19 + mid*2.0),
    0.0035 * cos(uTime*0.16 - bass*1.5)
  );

  vec2 advP = rot(p * memoryZoom, memoryRot * wooze) + drift * wooze;
  vec2 uv2 = advP + 0.5;

  vec3 prevA = texture(uPrev, uv).rgb;
  vec3 prevB = texture(uPrev, uv2).rgb;
  vec3 ink = mix(prevA, prevB, 0.48);

  float decay = 0.987 - 0.010*tre + 0.004*bass;
  ink *= clamp(decay, 0.955, 0.993);

  // Unreliable centre: field subtly leans and fails to agree with itself.
  vec2 centreDrift = vec2(
    0.040 * sin(uTime*0.071) + 0.018 * sin(uTime*0.023 + 3.1),
    0.034 * cos(uTime*0.057) + 0.016 * sin(uTime*0.031 - 1.6)
  ) * (0.50 + 0.70*wooze);

  // Slow breathing zoom, deliberately non-periodic-feeling.
  float zoom =
    1.0 +
    0.080 * sin(uTime*0.073) +
    0.045 * sin(uTime*0.031 + 2.0) +
    0.025 * bass;

  vec2 q = ((uv - 0.5) * aspect - centreDrift) * zoom;

  // Differential rotation: inner/outer rings disagree slightly.
  float rq = length(q);
  float localRot =
    0.050 * sin(uTime*0.17 - rq*8.0) +
    0.025 * sin(uTime*0.061 + rq*15.0);
  q = rot(q, localRot * (0.35 + 0.75*wooze));

  float collapse = smoothstep(0.62, 1.0, bass) * (0.45 + 0.55*e);
  float lock = smoothstep(0.18, 0.88, e) * (0.18 + 0.42*mid);

  vec3 add = vec3(0.0);

  for(int s = 0; s < 9; s++){
    float fs = float(s);
    float minD = 1e9;

    float orbitSeed = fs * 1.731;
    float centreAng =
      uTime * (0.060 + 0.010*fs) +
      fs * 0.86 +
      1.7 * sin(uTime*0.027 + fs);

    vec2 C =
      0.205 *
      vec2(cos(centreAng), sin(centreAng)) *
      (0.72 + 0.34*sin(uTime*0.049 + fs*1.3) + 0.20*bass);

    C += 0.025 * vec2(
      sin(uTime*0.083 + fs*2.2),
      cos(uTime*0.069 - fs*1.4)
    );

    float R =
      0.135 +
      0.031*fs +
      0.016*sin(fs*2.0 + cen*3.0 + uTime*0.07);

    R *= mix(1.0, 0.74 + 0.08*sin(uTime*0.23 + fs), collapse);

    float w =
      0.23 +
      0.035*sin(fs + cen*4.0) +
      0.065*tre;

    float phi = fs*0.91 + uTime*w;
    float shared = uTime*(0.22 + 0.07*cen);
    phi = mix(phi, shared + fs*0.38, lock);

    vec2 prevP = C;
    bool hasPrev = false;

    for(int i = 0; i <= 28; i++){
      float fi = float(i) / 28.0;
      float a = phi + fi * 6.28318530718;

      float rope =
        ropeNoise(a, orbitSeed, uTime) *
        (0.030 + 0.026*wooze + 0.020*bass);

      float sag =
        sin(a*0.5 + uTime*0.11 + fs) *
        (0.020 + 0.018*mid);

      float rLocal = R + rope + sag;

      vec2 radial = vec2(cos(a), sin(a));
      vec2 tangent = vec2(-radial.y, radial.x);

      vec2 curP = C + rLocal * radial;

      // Rope flex: tangential slippage makes the line feel material, not wired.
      curP += tangent *
        (
          0.018 * sin(a*2.0 - uTime*0.21 + fs*1.7) +
          0.010 * sin(a*5.0 + uTime*0.13)
        ) *
        (0.75 + 0.85*wooze);

      // Wobbly hand-drawn looseness, but slow enough not to become jitter.
      curP += 0.012 * vec2(
        sin(a*3.1 + uTime*0.19 + fs),
        cos(a*2.7 - uTime*0.15 - fs)
      ) * (0.45 + 0.85*cen);

      if(hasPrev){
        float d = sdSegment(q, prevP, curP);
        minD = min(minD, d);
      }

      prevP = curP;
      hasPrev = true;
    }

    float strokeW =
      0.0060 +
      0.0017*sin(uTime*0.17 + fs) +
      0.0022*bass;

    float body = exp(-pow(minD / strokeW, 2.0));
    float halo = exp(-pow(minD / (strokeW*4.6), 1.35));

    vec3 bruisedViolet = vec3(0.26, 0.13, 0.36);
    vec3 warmGhost = vec3(0.82, 0.66, 0.92);
    vec3 sourBlue = vec3(0.34, 0.48, 0.82);

    vec3 strokeCol = mix(bruisedViolet, warmGhost, 0.30 + 0.45*cen);
    strokeCol = mix(strokeCol, sourBlue, 0.18 + 0.18*sin(fs*1.8 + uTime*0.05));

    float pulse = 0.09 + 0.18*e + 0.09*bass;
    add += strokeCol * body * pulse;
    add += strokeCol * halo * (0.010 + 0.026*e);
  }

  ink += add;

  float grain = (hash12(uv*uRes + uTime*11.0) - 0.5) * 0.0035;
  ink += vec3(grain);

  outColor = vec4(clamp(ink, 0.0, 1.0), 1.0);
}
`;

const FS_DRAW = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uBass;
uniform float uCentroid;

vec2 rot(vec2 p, float a){
  float s = sin(a);
  float c = cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

void main(){
  vec2 uv = vUv;
  vec2 px = (uv*uRes - 0.5*uRes) / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  vec2 ghostA = vec2(
    0.0048*sin(uTime*0.31),
    0.0038*cos(uTime*0.23)
  ) * (0.70 + 0.90*e);

  vec2 ghostB = vec2(
    0.0060*cos(uTime*0.17 + 1.7),
    0.0045*sin(uTime*0.19 - 0.8)
  ) * (0.35 + 0.75*bass);

  vec2 lens = px;
  lens = rot(lens, 0.018*sin(uTime*0.09));
  float r = length(lens);

  vec2 warpedUv =
    0.5 +
    lens * min(uRes.x, uRes.y) / uRes *
    (
      1.0 +
      0.018*sin(uTime*0.11) +
      0.020*r*r*sin(uTime*0.07 + bass*2.0)
    );

  vec3 inkA = texture(uTex, warpedUv).rgb;
  vec3 inkB = texture(uTex, warpedUv + ghostA).rgb;
  vec3 inkC = texture(uTex, warpedUv - ghostB).rgb;

  vec3 ink = inkA + inkB*0.42 + inkC*0.24;

  float lum = dot(ink, vec3(0.299, 0.587, 0.114));
  lum = pow(lum, 0.74);

  vec3 bg = vec3(0.012, 0.011, 0.017);
  vec3 bruise = vec3(0.18, 0.09, 0.27);
  vec3 violet = vec3(0.54, 0.38, 0.78);
  vec3 pearl = vec3(0.96, 0.88, 1.00);

  vec3 col = bg;
  col += bruise * lum * (0.55 + 0.45*e);
  col += violet * ink * (0.20 + 0.26*cen);
  col += pearl * pow(max(ink, vec3(0.0)), vec3(1.35)) * (0.12 + 0.22*e);

  float vignette = smoothstep(1.34, 0.32, r);
  float blackout = 0.92 + 0.08*sin(uTime*0.37 + r*7.0) * smoothstep(0.55, 1.25, r);
  col *= vignette * blackout;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

function createTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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

function clearTex(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number,
) {
  const data = new Uint8Array(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const s = Math.random() < 0.0018 ? 18 + Math.random() * 22 : 0;
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

  let uPrevI: WebGLUniformLocation | null = null;
  let uResI: WebGLUniformLocation | null = null;
  let uTimeI: WebGLUniformLocation | null = null;
  let uEnergyI: WebGLUniformLocation | null = null;
  let uBassI: WebGLUniformLocation | null = null;
  let uMidI: WebGLUniformLocation | null = null;
  let uTrebleI: WebGLUniformLocation | null = null;
  let uCentroidI: WebGLUniformLocation | null = null;

  let uTexD: WebGLUniformLocation | null = null;
  let uResD: WebGLUniformLocation | null = null;
  let uTimeD: WebGLUniformLocation | null = null;
  let uEnergyD: WebGLUniformLocation | null = null;
  let uBassD: WebGLUniformLocation | null = null;
  let uCentroidD: WebGLUniformLocation | null = null;

  function ensureSim(gl: WebGL2RenderingContext, w: number, h: number) {
    const targetW = Math.min(900, Math.max(380, Math.floor(w * 0.72)));
    const targetH = Math.min(900, Math.max(380, Math.floor(h * 0.72)));

    if (targetW === simW && targetH === simH && texA && texB && fboA && fboB) {
      return;
    }

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
      uTimeD = gl.getUniformLocation(progDraw, "uTime");
      uEnergyD = gl.getUniformLocation(progDraw, "uEnergy");
      uBassD = gl.getUniformLocation(progDraw, "uBass");
      uCentroidD = gl.getUniformLocation(progDraw, "uCentroid");
    },

    render(gl, opts) {
      if (!tri || !progInk || !progDraw) return;

      ensureSim(gl, opts.width, opts.height);
      if (!texA || !texB || !fboA || !fboB) return;

      const audio = opts.audio;
      const energy = audio.energy ?? 0;
      const bass = audio.bass ?? 0;
      const mid = audio.mid ?? 0;
      const treble = audio.treble ?? 0;
      const centroid = audio.centroid ?? 0;

      const src = ping ? texA : texB;
      const dstFbo = ping ? fboB : fboA;

      const previousFbo = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;

      const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

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

      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFbo);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3],
      );

      gl.useProgram(progDraw);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA);

      gl.uniform1i(uTexD, 0);
      gl.uniform2f(uResD, opts.width, opts.height);
      gl.uniform1f(uTimeD, opts.time);
      gl.uniform1f(uEnergyD, energy);
      gl.uniform1f(uBassD, bass);
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