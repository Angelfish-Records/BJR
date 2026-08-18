// web/app/home/player/visualizer/themes/meaningLeak.ts
// Grungy recursive salience field with autonomous disorientation and deterministic swoon episodes.
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

// Recursive Salience Field (“Meaning Leak”)
// Single-pass, full-coverage, SCREEN-siphon-friendly.
// Baseline mode when audio is idle; smoothly transitions into salience/halo mode on playback.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;

#define PI 3.14159265359

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

float easeInOut(float x) {
  x = clamp(x, 0.0, 1.0);
  return x*x*(3.0 - 2.0*x);
}

float episodeWindow(float x, float center, float width) {
  float distanceToCenter = abs(x - center);
  float envelope = 1.0 - smoothstep(width * 0.18, width, distanceToCenter);
  return easeInOut(envelope);
}

vec2 rotate2(vec2 p, float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c) * p;
}

void main() {
  vec2 uv = vUv;
  vec2 viewP =
    (uv * uRes - 0.5 * uRes)
    / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float rms = clamp(uRms, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float treble = clamp(uTreble, 0.0, 1.0);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);

  // Playback affects local contrast, colour, pressure and edge response.
  // It never owns the structural clock or the global camera.
  float drive = max(e, rms);
  float play = smoothstep(0.025, 0.16, drive);

  // Long-form verb: SWOON.
  //
  // The narrative is intentionally non-monotonic. Deterministic encroachment
  // episodes arrive and recede across the recording, so pause/seek/offline
  // rendering always land in the same perceptual chapter.
  float swoon = 0.0;
  swoon = max(
    swoon,
    episodeWindow(trackProgress, 0.16, 0.040) * 0.52
  );
  swoon = max(
    swoon,
    episodeWindow(trackProgress, 0.34, 0.052) * 0.74
  );
  swoon = max(
    swoon,
    episodeWindow(trackProgress, 0.53, 0.043) * 0.60
  );
  swoon = max(
    swoon,
    episodeWindow(trackProgress, 0.72, 0.060) * 0.88
  );
  swoon = max(
    swoon,
    episodeWindow(trackProgress, 0.90, 0.045) * 0.68
  );

  float pushPull =
    0.91
    + 0.09 * sin(
      uTime * 0.58
      + trackProgress * 11.0
    );

  float encroach = clamp(
    swoon * pushPull,
    0.0,
    1.0
  );

  // A slow double pulse gives the peripheral pressure a vascular character
  // without synchronising the whole frame to the music.
  float beatPhase = fract(uTime * 1.02);

  float beatA = 1.0 - smoothstep(
    0.0,
    0.085,
    abs(beatPhase - 0.12)
  );

  float beatB = 1.0 - smoothstep(
    0.0,
    0.095,
    abs(beatPhase - 0.30)
  );

  float bloodBeat = clamp(
    beatA * beatA
      + 0.58 * beatB * beatB,
    0.0,
    1.0
  );

  // Keep Meaning Leak's disorienting shot language, but make it autonomous.
  // The world wanders because this theme is unstable, not because a transient
  // shook the entire canvas.
  float shotClock = uTime * 0.115;
  float shotId = floor(shotClock);
  float shotPhase = fract(shotClock);
  float shotEase = easeInOut(shotPhase);

  vec2 shotSeed = vec2(
    shotId,
    shotId * 1.37 + 12.4
  );

  vec2 nextSeed = vec2(
    shotId + 1.0,
    (shotId + 1.0) * 1.37 + 12.4
  );

  vec2 shotA = vec2(
    hash12(shotSeed),
    hash12(shotSeed + 8.1)
  ) - 0.5;

  vec2 shotB = vec2(
    hash12(nextSeed),
    hash12(nextSeed + 8.1)
  ) - 0.5;

  vec2 shotPan = mix(
    shotA,
    shotB,
    shotEase
  ) * 0.18;

  float zoomA = mix(
    0.94,
    1.18,
    hash12(shotSeed + 17.0)
  );

  float zoomB = mix(
    0.94,
    1.18,
    hash12(nextSeed + 17.0)
  );

  float zoom = mix(
    zoomA,
    zoomB,
    shotEase
  );

  float angleA =
    (hash12(shotSeed + 23.0) - 0.5)
    * 0.18;

  float angleB =
    (hash12(nextSeed + 23.0) - 0.5)
    * 0.18;

  float angle = mix(
    angleA,
    angleB,
    shotEase
  );

  // Retain a very small deterministic shot-boundary snap, independent of audio.
  float shotSnap =
    pow(1.0 - shotPhase, 12.0)
    * 0.22;

  vec2 snapJitter = vec2(
    hash12(vec2(shotId, 91.7)) - 0.5,
    hash12(vec2(shotId, 42.3)) - 0.5
  ) * shotSnap * 0.022;

  float tunnelZoom =
    1.0
    + encroach * (
      0.075
      + 0.025 * sin(uTime * 0.65)
    );

  angle +=
    sin(uTime * 0.43)
    * encroach
    * 0.018;

  vec2 p = rotate2(
    (viewP + shotPan + snapJitter)
      / (zoom * tunnelZoom),
    angle
  );

  // Tunnel vision remains screen-centred even while the world underneath pans.
  vec2 tunnelCentre = vec2(
    sin(uTime * 0.17),
    cos(uTime * 0.13)
  ) * encroach * 0.024;

  float screenRadius = length(
    viewP - tunnelCentre
  );

  float clearRadius = mix(
    1.16,
    0.56,
    encroach
  );

  // Each vascular beat briefly tightens the aperture.
  clearRadius -=
    encroach
    * bloodBeat
    * 0.024;

  float peripheralMask = smoothstep(
    clearRadius * 0.70,
    clearRadius * 1.08,
    screenRadius
  );

  float acuityLoss =
    peripheralMask
    * encroach;

  // Inline stability: widen tiny details at low internal resolution.
  float resMin = min(
    uRes.x,
    uRes.y
  );

  float soft = clamp(
    520.0 / max(240.0, resMin),
    0.9,
    1.7
  );

  // Structural field evolution is autonomous. Audio no longer changes the
  // master clock or the displacement of the world texture.
  float t = max(uTime, 0.0) * 0.032;

  vec2 q = p;
  q += 0.08 * vec2(
    sin(t * 0.9),
    cos(t * 0.7)
  );

  vec2 v = flow(q, t);

  float flowStrength =
    0.062
    + 0.010 * sin(uTime * 0.11);

  q += v * flowStrength;

  // World texture. During a swoon, the peripheral high-frequency layer is
  // progressively replaced by the lower-frequency layer: a cheap single-pass
  // approximation of loss of acuity rather than an extra blur pass.
  float f0 = fbm(
    q * 1.35
      + vec2(0.0, t * 0.35)
  );

  float f1 = fbm(
    q * 2.25
      - vec2(t * 0.22, t * 0.18)
  );

  float softenedF1 = mix(
    f1,
    f0,
    acuityLoss * 0.84
  );

  float field = clamp(
    0.62 * f0
      + 0.38 * softenedF1,
    0.0,
    1.0
  );

  // Salience: image "notices itself" through edge/curvature significance.
  vec2 px = 1.0 / max(
    uRes,
    vec2(1.0)
  );

  vec2 s = px * (2.0 * soft);

  float fx1 = fbm(
    (q + vec2(s.x, 0.0)) * 1.35
      + vec2(0.0, t * 0.35)
  );

  float fx2 = fbm(
    (q - vec2(s.x, 0.0)) * 1.35
      + vec2(0.0, t * 0.35)
  );

  float fy1 = fbm(
    (q + vec2(0.0, s.y)) * 1.35
      + vec2(0.0, t * 0.35)
  );

  float fy2 = fbm(
    (q - vec2(0.0, s.y)) * 1.35
      + vec2(0.0, t * 0.35)
  );

  vec2 grad = vec2(
    fx1 - fx2,
    fy1 - fy2
  ) / max(
    1e-6,
    2.0 * max(s.x, s.y)
  );

  float gmag = length(grad);

  float fxx =
    fx1
    + fx2
    - 2.0 * f0;

  float fyy =
    fy1
    + fy2
    - 2.0 * f0;

  float curv =
    abs(fxx)
    + abs(fyy);

  float sal =
    0.85 * gmag
    + 0.65 * curv;

  // Mids and treble illuminate significance rather than move the field.
  sal *=
    0.60
    + 0.24 * mid
    + 0.34 * treble;

  sal *=
    0.34
    + 0.66 * play;

  // Loss of acuity suppresses fine peripheral salience during encroachment.
  sal *=
    1.0
    - 0.48 * acuityLoss;

  sal = clamp(
    sal * 2.2,
    0.0,
    1.0
  );

  float contrastAmount =
    (0.07 + 0.31 * play)
    * (0.62 + 0.38 * drive);

  float shaped = softContrast(
    field,
    contrastAmount * sal
  );

  vec3 col = palette(
    shaped,
    play
  );

  // Chromatic significance fringe. The peripheral offset grows during a swoon
  // so edges smear chromatically even while fine luminance detail softens.
  vec2 dir = normalize(
    grad + vec2(1e-6)
  );

  float fringePx =
    (0.55 + 0.90 * play)
    * (0.48 + 0.52 * treble)
    * soft
    * (1.0 + 1.15 * acuityLoss);

  vec2 off =
    dir
    * fringePx
    * px;

  float lC = shaped;

  float lR = clamp(
    softContrast(
      clamp(
        0.62 * fbm(
          (q + off) * 1.35
            + vec2(0.0, t * 0.35)
        ) + 0.38 * softenedF1,
        0.0,
        1.0
      ),
      contrastAmount * sal
    ),
    0.0,
    1.0
  );

  float lB = clamp(
    softContrast(
      clamp(
        0.62 * fbm(
          (q - off) * 1.35
            + vec2(0.0, t * 0.35)
        ) + 0.38 * softenedF1,
        0.0,
        1.0
      ),
      contrastAmount * sal
    ),
    0.0,
    1.0
  );

  vec3 fringe = vec3(
    lR - lC,
    0.0,
    lC - lB
  );

  fringe *=
    (0.06 + 0.15 * play)
    * sal
    * (1.0 + 0.70 * acuityLoss);

  col += fringe;

  float glow =
    smoothstep(0.20, 0.95, sal)
    * (0.06 + 0.17 * play)
    * (0.58 + 0.42 * drive);

  col +=
    vec3(0.95, 0.95, 1.00)
    * glow
    * smoothstep(
      0.55,
      0.98,
      shaped
    );

  // Grunge remains coarse and slow enough not to become video noise.
  float grainTime =
    floor(uTime * 7.0)
    / 7.0;

  float grain = noise(
    uv * uRes * 0.20
      + vec2(
        grainTime * 0.31,
        -grainTime * 0.25
      )
  );

  col +=
    vec3(grain - 0.5)
    * (0.008 + 0.010 * (1.0 - play));

  // Reuse the grain as a dirty vascular modulation rather than paying for
  // another procedural layer.
  float vascularTexture = smoothstep(
    0.42,
    0.88,
    grain
  );

  float vascularPressure =
    peripheralMask
    * encroach
    * (0.30 + 0.70 * bass)
    * (0.52 + 0.48 * bloodBeat)
    * (0.72 + 0.28 * vascularTexture);

  vec3 bloodTint = vec3(
    0.16,
    0.010,
    0.024
  );

  vec3 vascularColour =
    col * vec3(0.78, 0.58, 0.62)
    + bloodTint * 0.22;

  col = mix(
    col,
    vascularColour,
    vascularPressure * 0.44
  );

  // Stable base vignette plus the intermittent closing visual field.
  float baseVignette =
    1.0 - smoothstep(
      0.25,
      1.35,
      screenRadius
    );

  col *=
    0.55
    + 0.70 * baseVignette;

  float tunnelDark =
    peripheralMask
    * encroach;

  col *=
    1.0
    - tunnelDark
      * (0.30 + 0.08 * bloodBeat);

  // Keep whole-frame musical breathing very restrained.
  col *=
    0.98
    + 0.04 * drive;

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

export function createMeaningLeakTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;

  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uTrackProgress: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let uRms: WebGLUniformLocation | null = null;
  let uBass: WebGLUniformLocation | null = null;
  let uMid: WebGLUniformLocation | null = null;
  let uTreble: WebGLUniformLocation | null = null;

  let smoothEnergy = 0;
  let smoothRms = 0;
  let smoothBass = 0;
  let smoothMid = 0;
  let smoothTreble = 0;

  const damp = (
    current: number,
    target: number,
    rise: number,
    fall: number,
  ): number => {
    const rate = target > current ? rise : fall;
    return current + (target - current) * rate;
  };

  return {
    name: "meaning-leak",
    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);
      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uTrackProgress = gl.getUniformLocation(program, "uTrackProgress");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
      uRms = gl.getUniformLocation(program, "uRms");
      uBass = gl.getUniformLocation(program, "uBass");
      uMid = gl.getUniformLocation(program, "uMid");
      uTreble = gl.getUniformLocation(program, "uTreble");
    },
    render(gl, opts) {
      if (!program || !tri) return;

      const rawEnergy = Math.max(0, Math.min(1, opts.audio.energy));
      const rawBass = Math.max(0, Math.min(1, opts.audio.bass ?? rawEnergy));
      const rawMid = Math.max(0, Math.min(1, opts.audio.mid ?? rawEnergy));
      const rawTreble = Math.max(
        0,
        Math.min(1, opts.audio.treble ?? rawEnergy),
      );
      const rawRms = Math.max(0, Math.min(1, opts.audio.rms ?? 0));

      smoothEnergy = damp(smoothEnergy, rawEnergy, 0.16, 0.045);
      smoothRms = damp(smoothRms, rawRms, 0.14, 0.04);
      smoothBass = damp(smoothBass, rawBass, 0.18, 0.05);
      smoothMid = damp(smoothMid, rawMid, 0.13, 0.04);
      smoothTreble = damp(smoothTreble, rawTreble, 0.11, 0.035);

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uTrackProgress, opts.trackProgress01 ?? 0);
      gl.uniform1f(uEnergy, smoothEnergy);
      gl.uniform1f(uRms, smoothRms);
      gl.uniform1f(uBass, smoothBass);
      gl.uniform1f(uMid, smoothMid);
      gl.uniform1f(uTreble, smoothTreble);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindVertexArray(null);
      gl.useProgram(null);
    },
    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf);
      if (tri?.vao) gl.deleteVertexArray(tri.vao);
      tri = null;
      if (program) gl.deleteProgram(program);
      program = null;
    },
  };
}
