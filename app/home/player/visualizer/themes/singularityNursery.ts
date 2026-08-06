// web/app/home/player/visualizer/themes/singularityNursery.ts
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

const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uAge;
uniform float uEnergy;
uniform float uShock;
uniform float uShockRadius;

const float PI = 3.14159265358979323846;
const float TAU = 6.28318530717958647692;

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

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;

  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p = mat2(1.61, -1.19, 1.19, 1.61) * p;
    amplitude *= 0.5;
  }

  return value;
}

float ridged(vec2 p) {
  float value = 0.0;
  float amplitude = 0.62;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);

    value += amplitude * n;

    frequency *= 2.06;
    amplitude *= 0.55;
    p = mat2(0.83, -0.56, 0.56, 0.83) * p;
  }

  return value;
}

mat2 rot(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float band(float value, float centre, float innerWidth, float outerWidth) {
  return 1.0 - smoothstep(
    innerWidth,
    outerWidth,
    abs(value - centre)
  );
}

void main() {
  float time = max(uTime, 0.0);
  float age = min(max(uAge, 0.0), 900.0);
  float e = clamp(uEnergy, 0.0, 1.0);
  float t = time * 0.11;

  // Significant age-driven approach, like a slow camera falling inward.
  float ageProgress = 1.0 - exp(-age * 0.0038);
  float cameraZoom = 1.0 + 1.08 * ageProgress;

  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p *= cameraZoom;

  vec2 d = p;

  // Slight oblateness keeps the formation feeling disc-born without
  // becoming a finished black-hole eye.
  float oblateness = 1.14;
  vec2 orbital = vec2(d.x, d.y * oblateness);

  float r = length(orbital);
  float a = atan(orbital.y, orbital.x);

  // The global mass evolves only with theme age and continuous time.
  // Audio transients must not contract or rotate the whole structure.
  float swirlStrength = 0.42 + 0.95 * ageProgress;
  float localTwist = t * 0.74 + swirlStrength / (0.24 + r * 1.48);
  float lens = 1.0 / (1.0 + 1.95 / (0.16 + r * 2.2));

  vec2 q = rot(localTwist) * orbital;
  q *= 1.0 + 0.55 * lens;

  // A transient launches near the core and then advances independently.
  // The wave is irregular rather than a perfectly clean circular ring.
  float shockWidth = 0.038 + 0.050 * uShock;
  float shockDistance = abs(r - uShockRadius);

  float shockBand = 1.0 - smoothstep(
    shockWidth * 0.28,
    shockWidth,
    shockDistance
  );

  float shockNoise = ridged(
    vec2(
      a * 3.15 - t * 0.52,
      r * 10.8 + t * 0.14
    )
  );

  float shockTexture = mix(
    0.38,
    1.0,
    smoothstep(0.42, 0.95, shockNoise)
  );

  float shockWave = uShock * shockBand * shockTexture;

  // Distort only the narrow region occupied by the travelling front.
  float shockRipple = shockWave * sin(
    (r - uShockRadius) * 74.0 - t * 3.1
  );

  q *= 1.0 + 0.045 * shockRipple;

  float darkCoreRadius = 0.028 + 0.010 * ageProgress;
  float protoCoreRadius = 0.092 + 0.022 * ageProgress;

  float darkCoreMask = 1.0 - smoothstep(
    darkCoreRadius,
    darkCoreRadius + 0.020,
    r
  );

  float umbraMask = 1.0 - smoothstep(
    protoCoreRadius,
    protoCoreRadius + 0.050,
    r
  );

  // Shared noise grammar across both outer filaments and the denser inner disc.
  // Shock displacement is local; ordinary energy no longer changes the domain.
  vec2 collapseField = vec2(
    a * 2.25 + 0.18 * sin(t * 0.65),
    (r + 0.020 * shockRipple) * 4.9 - t * 0.34
  );

  float collapseRidged = ridged(collapseField);
  float collapseFbm = fbm(q * 2.15 + vec2(-t * 0.28, t * 0.18));

  float filaments = smoothstep(
    0.50,
    0.95,
    mix(collapseRidged, collapseFbm, 0.35)
  );

  filaments *= smoothstep(protoCoreRadius + 0.014, 0.22, r);
  filaments *= 1.0 - smoothstep(0.22, 1.28, r);

  float filamentSpokes = ridged(
    vec2(a * 5.4 + collapseFbm * 1.2, r * 2.7 - t * 0.30)
  );
  filamentSpokes = smoothstep(0.55, 0.98, filamentSpokes);

  filaments *= 0.60 + 0.40 * filamentSpokes;

  // Matter brightens and deforms as the front passes, without changing
  // the overall silhouette of the nursery.
  filaments *= 1.0 + 0.48 * shockWave;

  float innerDisc = 1.0 - smoothstep(0.08, 0.34, r);
  innerDisc *= smoothstep(
    0.42,
    0.98,
    ridged(vec2(a * 1.45 - t * 0.24, r * 7.2 + collapseFbm * 0.6))
  );
  innerDisc *= 1.0 - darkCoreMask;

  float protoCore = 1.0 - smoothstep(0.0, 0.22, r);
  protoCore *= smoothstep(
    0.26,
    0.96,
    fbm(q * 5.6 + vec2(t * 0.24, -t * 0.16))
  );
  protoCore *= 1.0 - darkCoreMask;

  // Infall streaks intensify with energy.
  float infall = noise(
    vec2(a * 3.25 + collapseFbm * 1.15, r * 11.5 - t * (1.2 + 2.0 * e))
  );
  infall = smoothstep(0.84 - 0.12 * e, 0.995, infall);
  infall *= smoothstep(0.17, 0.82, r);
  infall *= 1.0 - smoothstep(0.26, 1.06, r);

  float innerHalo = band(r, 0.16 + 0.04 * ageProgress, 0.05, 0.25);
  float outerNebula = 1.0 - smoothstep(0.22, 1.22, r);
  outerNebula *= smoothstep(
    0.36,
    0.96,
    fbm(q * 1.9 + vec2(t * 0.10, -t * 0.08))
  );
  outerNebula *= 1.0 - umbraMask;

  // Stable star field with a gentle lensing warp near centre.
  vec2 starWarp = p;
  starWarp *= 1.0 + 0.18 / (0.22 + r * 2.15);

  vec2 starGrid = floor((starWarp + 1.7) * 168.0);
  vec2 starCell = fract((starWarp + 1.7) * 168.0) - 0.5;

  float starSeed = hash(starGrid);
  float starField = step(0.993 - 0.012 * e, starSeed);

  starField *= 1.0 - smoothstep(
    0.010,
    0.070,
    length(starCell)
  );

  // A restrained lower-front accretion fragment. It should read as nearby
  // matter crossing the umbra, not as a permanent horizontal axis.
  float arcHalfWidth = 0.345;
  float arcHalfHeight = 0.090;
  float arcCentreY = 0.012;

  vec2 arcSpace = vec2(
    d.x / arcHalfWidth,
    (d.y - arcCentreY) / arcHalfHeight
  );

  float arcRadius = length(arcSpace);
  float arcAngle = atan(arcSpace.y, arcSpace.x);

  vec2 arcGradient = vec2(
    arcSpace.x / arcHalfWidth,
    arcSpace.y / arcHalfHeight
  );

  float arcDistance = abs(arcRadius - 1.0) / max(
    length(arcGradient),
    0.0001
  );

  float arcBand = 1.0 - smoothstep(0.007, 0.050, arcDistance);

  float arcTexture = ridged(
    vec2(
      arcAngle * 2.35,
      arcRadius * 4.6
    ) + vec2(t * 0.35, -t * 0.13)
  );

  arcTexture = smoothstep(0.50, 0.98, arcTexture);

  float arcBreakup = smoothstep(
    0.43,
    0.90,
    fbm(
      vec2(
        arcAngle * 3.4,
        arcRadius * 6.2
      ) + vec2(-t * 0.18, t * 0.08)
    )
  );

  float frontArcDistance = abs(arcAngle + PI * 0.5);
  float arcHalfSpan = 0.84;

  float arcMask = 1.0 - smoothstep(
    arcHalfSpan - 0.15,
    arcHalfSpan,
    frontArcDistance
  );

  float arcFrontWeight = 1.0 - smoothstep(
    -0.015,
    0.074,
    arcSpace.y
  );

  float nurseryArc = arcBand
    * arcTexture
    * arcMask
    * arcFrontWeight
    * (0.28 + 0.72 * arcBreakup);

  float shoulderAttach = arcBand * arcMask * (
    1.0 - smoothstep(0.024, 0.082, abs(r - 0.25))
  );

  vec3 deep = vec3(0.006, 0.008, 0.018);
  vec3 violet = vec3(0.220, 0.120, 0.390);
  vec3 magenta = vec3(0.520, 0.170, 0.470);
  vec3 teal = vec3(0.120, 0.420, 0.520);
  vec3 amber = vec3(0.940, 0.590, 0.250);
  vec3 white = vec3(0.960, 0.985, 1.000);

  vec3 col = deep;

  col += white * starField * (0.12 + 0.26 * e);
  col += violet * outerNebula * (0.10 + 0.20 * e);
  col += mix(violet, teal, 0.45 + 0.35 * sin(a * 1.6 - t * 0.3))
    * filaments
    * (0.24 + 0.34 * e);

  col += mix(magenta, amber, smoothstep(-1.0, 1.0, sin(a * 1.8 + t * 0.6)))
    * innerDisc
    * (0.28 + 0.34 * e);

  col += amber * infall * (0.12 + 0.28 * e);
  col += mix(teal, white, 0.55) * innerHalo * (0.04 + 0.10 * e);
  col += mix(amber, white, 0.45) * protoCore * (0.22 + 0.22 * e);

  // A refractive pressure front travelling through existing matter.
  vec3 shockColour = mix(
    violet,
    teal,
    smoothstep(0.08, 0.92, r)
  );

  col += mix(shockColour, white, 0.24)
    * shockWave
    * (0.16 + 0.42 * uShock);

  // Collapse the centre back into darkness, then reintroduce only the selected foreground arc.
  col = mix(col, vec3(0.0), umbraMask * 0.78);
  col = mix(col, vec3(0.0), darkCoreMask);

  col += mix(amber, magenta, 0.16)
    * nurseryArc
    * (0.14 + 0.28 * e + 0.08 * shoulderAttach);

  float edgeVignette = 1.0 - smoothstep(0.78, 1.46, length(p));
  col *= 0.52 + 0.86 * edgeVignette;
  col *= 0.90 + 0.28 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createSingularityNurseryTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uAge: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let uShock: WebGLUniformLocation | null = null;
  let uShockRadius: WebGLUniformLocation | null = null;

  let themeStartedAtMs: number | null = null;
  let previousFrameAtMs: number | null = null;
  let lastShockAtMs = Number.NEGATIVE_INFINITY;

  let smoothedEnergy = 0;
  let energyBaseline = 0;
  let shockStrength = 0;
  let shockRadius = 0.08;

  return {
    name: "singularity-nursery",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      themeStartedAtMs = performance.now();
      previousFrameAtMs = null;
      lastShockAtMs = Number.NEGATIVE_INFINITY;

      smoothedEnergy = 0;
      energyBaseline = 0;
      shockStrength = 0;
      shockRadius = 0.08;

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uAge = gl.getUniformLocation(program, "uAge");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
      uShock = gl.getUniformLocation(program, "uShock");
      uShockRadius = gl.getUniformLocation(program, "uShockRadius");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      const nowMs = performance.now();
      const themeAgeSeconds =
        themeStartedAtMs === null ? 0 : (nowMs - themeStartedAtMs) / 1000;

      const dtSeconds =
        previousFrameAtMs === null
          ? 1 / 60
          : Math.min(0.1, Math.max(0, (nowMs - previousFrameAtMs) / 1000));

      previousFrameAtMs = nowMs;

      const rawEnergy = Math.max(0, Math.min(1, opts.audio.energy));

      // Slow body response for luminosity. It no longer controls geometry.
      const energyRate =
        rawEnergy > smoothedEnergy
          ? 1 - Math.exp(-dtSeconds * 3.0)
          : 1 - Math.exp(-dtSeconds * 1.2);

      smoothedEnergy += (rawEnergy - smoothedEnergy) * energyRate;

      // A slower baseline lets us distinguish a transient rise from a
      // generally energetic passage.
      const baselineRate = 1 - Math.exp(-dtSeconds * 1.35);
      energyBaseline += (rawEnergy - energyBaseline) * baselineRate;

      const transientRise = Math.max(0, rawEnergy - energyBaseline);
      const shockCooldownElapsed = nowMs - lastShockAtMs >= 210;

      if (transientRise >= 0.105 && shockCooldownElapsed) {
        shockStrength = Math.max(
          shockStrength,
          Math.min(1, transientRise * 2.65),
        );
        shockRadius = 0.075;
        lastShockAtMs = nowMs;
      }

      if (shockStrength > 0.001) {
        shockRadius += dtSeconds * (0.4 + 0.2 * shockStrength);
        shockStrength *= Math.exp(-dtSeconds * 0.82);

        if (shockRadius >= 1.34) {
          shockStrength = 0;
          shockRadius = 0.08;
        }
      }

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uAge, themeAgeSeconds);
      gl.uniform1f(uEnergy, smoothedEnergy);
      gl.uniform1f(uShock, shockStrength);
      gl.uniform1f(uShockRadius, shockRadius);

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

      themeStartedAtMs = null;
      previousFrameAtMs = null;
      lastShockAtMs = Number.NEGATIVE_INFINITY;

      smoothedEnergy = 0;
      energyBaseline = 0;
      shockStrength = 0;
      shockRadius = 0.08;
    },
  };
}
