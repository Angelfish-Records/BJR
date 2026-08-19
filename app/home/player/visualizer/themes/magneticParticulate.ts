// web/app/home/player/visualizer/themes/magneticParticulate.ts
// Spacetime Imprint / IMPRINT: preserve the magnetic particulate identity while
// revealing one deformable satin-like surface whose fixed pins trace pressure,
// folds, travelling ripples, and local musical impacts.
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

// Magnetic Particulate — Spacetime Imprint
// A continuous elastic field rendered simultaneously as liquid satin,
// magnetic filaments, and thousands of fixed impression-board pins.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uTrackProgress;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

const float TAU = 6.28318530718;

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
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.16, 1.16, 1.62) * p;
    a *= 0.5;
  }

  return v;
}

vec2 curl(vec2 p) {
  float eps = 0.0028;

  float n1 = fbm(p + vec2(0.0, eps));
  float n2 = fbm(p - vec2(0.0, eps));
  float n3 = fbm(p + vec2(eps, 0.0));
  float n4 = fbm(p - vec2(eps, 0.0));

  vec2 grad = vec2(
    n3 - n4,
    n1 - n2
  ) / (2.0 * eps);

  return normalize(
    vec2(
      grad.y,
      -grad.x
    )
    + vec2(0.0001)
  );
}

float filament(
  vec2 p,
  vec2 dir,
  float scale
) {
  vec2 n = vec2(
    -dir.y,
    dir.x
  );

  float along = dot(
    p,
    dir
  );

  float across = dot(
    p,
    n
  );

  float lane = abs(
    fract(across * scale)
    - 0.5
  );

  float broken = fbm(
    vec2(
      along * 1.8,
      across * 0.35
    )
  );

  float laneMask =
    1.0
    - smoothstep(
      0.018,
      0.19,
      lane
    );

  return laneMask
    * smoothstep(
      0.22,
      0.95,
      broken
    );
}

float pressureWell(
  vec2 p,
  vec2 c,
  float radius
) {
  float d =
    length(p - c)
    / radius;

  return exp(
    -d * d * 2.6
  );
}

vec2 impactCenterA(float t) {
  return vec2(
    0.22 * sin(t * 1.7),
    0.18 * cos(t * 1.3)
  );
}

vec2 impactCenterB(float t) {
  return vec2(
    0.46 * sin(t * 0.8 + 2.1),
    0.34 * cos(t * 0.9 + 1.4)
  );
}

vec2 impactCenterC(float t) {
  return vec2(
    -0.34
      + 0.18 * sin(t * 0.57 + 4.0),
    0.24
      + 0.14 * cos(t * 0.71 + 0.8)
  );
}

float radialRipple(
  vec2 p,
  vec2 c,
  float phase,
  float frequency,
  float falloff
) {
  float d = length(
    p - c
  );

  return sin(
    d * frequency
    - phase
  ) * exp(
    -d * falloff
  );
}

float shearPacket(
  vec2 p,
  float t,
  float phaseOffset
) {
  vec2 dir = normalize(
    vec2(
      0.82,
      0.57
    )
  );

  vec2 normalDir = vec2(
    -dir.y,
    dir.x
  );

  float crossPosition =
    dot(
      p,
      normalDir
    )
    - 0.24
    * sin(
      t * 0.72
      + phaseOffset
    );

  float envelope = exp(
    -crossPosition
    * crossPosition
    * 5.2
  );

  return sin(
    dot(
      p,
      dir
    )
    * 13.5
    - t * 5.2
    + phaseOffset
  ) * envelope;
}

float surfaceHeight(
  vec2 p,
  float t,
  float progress,
  float bass,
  float mid
) {
  // Long-form verb: IMPRINT.
  // The material begins taut, acquires deeper impressions through the middle,
  // and ends as a heavily loaded but still coherent spacetime membrane.
  float load = smoothstep(
    0.08,
    0.92,
    progress
  );

  float secondary = smoothstep(
    0.28,
    0.72,
    progress
  );

  float lateLoad = smoothstep(
    0.68,
    0.96,
    progress
  );

  vec2 c1 = impactCenterA(t);
  vec2 c2 = impactCenterB(t);
  vec2 c3 = impactCenterC(t);

  float wellA = pressureWell(
    p,
    c1,
    0.54
  );

  float wellB = pressureWell(
    p,
    c2,
    0.40
  );

  float wellC = pressureWell(
    p,
    c3,
    0.31
  );

  // Quiet autonomous undulation gives the sheet a living resting state.
  float h =
    0.010
    * sin(
      p.x * 3.4
      + t * 0.70
    )
    * cos(
      p.y * 2.8
      - t * 0.56
    );

  // Bass is allowed to deepen local impressions because local deformation is
  // the physical concept of this theme; it never moves the camera or rescales
  // the master coordinate frame.
  h -= wellA
    * (
      0.036
      + 0.092 * load
    )
    * (
      0.78
      + 0.38 * bass
    );

  h -= wellB
    * (
      0.012
      + 0.058 * secondary
    )
    * (
      0.82
      + 0.28 * bass
    );

  h -= wellC
    * 0.060
    * lateLoad
    * (
      0.80
      + 0.24 * bass
    );

  // Travelling pressure rings remain analytically reconstructible from time.
  h += radialRipple(
    p,
    c1,
    t * 8.0,
    23.0,
    1.65
  )
    * (
      0.006
      + 0.030 * load
    )
    * (
      0.68
      + 0.48 * bass
    );

  h += radialRipple(
    p,
    c2,
    t * 6.2 + 1.7,
    27.0,
    1.85
  )
    * 0.026
    * secondary
    * (
      0.72
      + 0.38 * mid
    );

  h += radialRipple(
    p,
    c3,
    t * 7.1 + 3.6,
    31.0,
    2.05
  )
    * 0.024
    * lateLoad
    * (
      0.70
      + 0.34 * mid
    );

  // Mids excite travelling shear/tension rather than changing topology.
  h += shearPacket(
    p,
    t,
    0.0
  )
    * (
      0.004
      + 0.016
      * secondary
      * (
        0.38
        + 0.62 * mid
      )
    );

  h += shearPacket(
    p * 1.12,
    -t * 0.84,
    2.4
  )
    * 0.012
    * lateLoad
    * (
      0.42
      + 0.58 * mid
    );

  return h;
}

vec3 oceanIridescence(
  float x,
  float spectralCentroid
) {
  vec3 teal = vec3(
    0.08,
    0.72,
    0.68
  );

  vec3 blue = vec3(
    0.12,
    0.38,
    0.92
  );

  vec3 violet = vec3(
    0.56,
    0.22,
    0.88
  );

  vec3 pearl = vec3(
    0.82,
    0.96,
    0.92
  );

  vec3 a = mix(
    teal,
    blue,
    smoothstep(
      0.10,
      0.55,
      x
    )
  );

  vec3 b = mix(
    violet,
    pearl,
    smoothstep(
      0.45,
      0.95,
      x
    )
  );

  vec3 colour = mix(
    a,
    b,
    smoothstep(
      0.35,
      0.85,
      x
    )
  );

  // Spectral centroid cools or warms the same established oceanic material
  // without replacing its palette identity.
  vec3 warmBias = vec3(
    1.04,
    0.98,
    0.92
  );

  vec3 coolBias = vec3(
    0.92,
    0.99,
    1.07
  );

  return colour
    * mix(
      warmBias,
      coolBias,
      spectralCentroid
    );
}

void main() {
  vec2 uv = vUv;

  float minRes = max(
    1.0,
    min(
      uRes.x,
      uRes.y
    )
  );

  vec2 p =
    (uv * uRes - 0.5 * uRes)
    / minRes;

  float t = uTime * 0.10;

  float energy = clamp(
    uEnergy,
    0.0,
    1.0
  );

  float rms = clamp(
    uRms,
    0.0,
    1.0
  );

  float bass = clamp(
    uBass,
    0.0,
    1.0
  );

  float mid = clamp(
    uMid,
    0.0,
    1.0
  );

  float treble = clamp(
    uTreble,
    0.0,
    1.0
  );

  float spectralCentroid = clamp(
    uCentroid,
    0.0,
    1.0
  );

  float progress = clamp(
    uTrackProgress,
    0.0,
    1.0
  );

  float load = smoothstep(
    0.08,
    0.92,
    progress
  );

  float lateLoad = smoothstep(
    0.68,
    0.96,
    progress
  );

  // ------------------------------------------------------------------
  // ONE CONTINUOUS DEFORMABLE SURFACE
  // ------------------------------------------------------------------
  float normalEps = 0.0036;

  float h0 = surfaceHeight(
    p,
    t,
    progress,
    bass,
    mid
  );

  float hx = surfaceHeight(
    p + vec2(normalEps, 0.0),
    t,
    progress,
    bass,
    mid
  );

  float hy = surfaceHeight(
    p + vec2(0.0, normalEps),
    t,
    progress,
    bass,
    mid
  );

  vec2 slope = vec2(
    hx - h0,
    hy - h0
  ) / normalEps;

  vec3 surfaceNormal = normalize(
    vec3(
      -slope.x * 0.62,
      -slope.y * 0.62,
      1.0
    )
  );

  float slopeStrength = clamp(
    length(slope) * 0.30,
    0.0,
    1.0
  );

  // The old fabricWarp concept is retained, but now all spatial deformation is
  // derived from the same pseudo-height field that drives lighting and pins.
  vec2 q =
    p
    - slope * 0.020;

  q += 0.030 * vec2(
    fbm(
      p * 1.2
      + vec2(
        t,
        -t * 0.4
      )
    ),
    fbm(
      p * 1.2
      + vec2(
        7.2 - t * 0.3,
        t * 0.6
      )
    )
  );

  // ------------------------------------------------------------------
  // MAGNETIC FIELD / FILAMENTS — EXISTING IDENTITY, STABLE FREQUENCY
  // ------------------------------------------------------------------
  vec2 field = curl(
    q * 1.35
    + vec2(
      t * 0.35,
      -t * 0.18
    )
  );

  float basin = fbm(
    q * 1.1
    + vec2(
      -t * 0.22,
      t * 0.16
    )
  );

  float cluster = smoothstep(
    0.32,
    0.92,
    basin
  );

  // Audio no longer changes how many field lanes exist.
  float f1 = filament(
    q + field * 0.05,
    field,
    15.0
  );

  float f2 = filament(
    q * 1.35 - field * 0.08,
    field,
    25.0
  ) * 0.55;

  float lines =
    (f1 + f2)
    * (
      0.35
      + 0.80 * cluster
    );

  // ------------------------------------------------------------------
  // FIXED IMPRESSION-BOARD PINS
  // ------------------------------------------------------------------
  const float pinScale = 142.0;

  vec2 pinCoord =
    (p + 1.2)
    * pinScale;

  vec2 pinGrid = floor(
    pinCoord
  );

  vec2 pinCell =
    fract(
      pinCoord
    )
    - 0.5;

  float rnd = hash(
    pinGrid
  );

  vec2 randomDir = normalize(
    vec2(
      hash(
        pinGrid + 11.7
      ) - 0.5,
      hash(
        pinGrid + 31.4
      ) - 0.5
    )
    + vec2(0.0001)
  );

  float alignment = abs(
    dot(
      randomDir,
      field
    )
  );

  vec2 pinAcross = vec2(
    dot(
      pinCell,
      field
    ),
    dot(
      pinCell,
      vec2(
        -field.y,
        field.x
      )
    )
  );

  float pinDistance = length(
    pinAcross
    * vec2(
      0.55,
      1.85
    )
  );

  float grainShape =
    1.0
    - smoothstep(
      0.035,
      0.26,
      pinDistance
    );

  // Identity is stable. Alignment changes the pin's presentation modestly,
  // but audio never changes the grid density or regenerates pin positions.
  float grainMask = smoothstep(
    0.48,
    1.0,
    rnd
      + alignment * 0.32
      + 0.15
  );

  float grains =
    grainShape
    * grainMask;

  float depression = smoothstep(
    0.012,
    0.145,
    -h0
  );

  float crest = smoothstep(
    0.012,
    0.110,
    h0
  );

  float pinBody =
    grains
    * (
      0.62
      + 0.38
      * (
        1.0 - depression
      )
    );

  // ------------------------------------------------------------------
  // SATIN / SPACETIME LIGHTING
  // ------------------------------------------------------------------
  vec3 lightDir = normalize(
    vec3(
      -0.52,
      0.46,
      0.72
    )
  );

  vec3 viewDir = vec3(
    0.0,
    0.0,
    1.0
  );

  vec3 halfDir = normalize(
    lightDir
    + viewDir
  );

  float diffuse = max(
    dot(
      surfaceNormal,
      lightDir
    ),
    0.0
  );

  float satinSpec = pow(
    max(
      dot(
        surfaceNormal,
        halfDir
      ),
      0.0
    ),
    18.0
  );

  float grazing = pow(
    1.0
    - clamp(
      surfaceNormal.z,
      0.0,
      1.0
    ),
    0.72
  );

  float orientationPhase = clamp(
    0.50
      + 0.26 * surfaceNormal.x
      - 0.18 * surfaceNormal.y
      + 0.08 * (
        spectralCentroid - 0.5
      ),
    0.0,
    1.0
  );

  vec3 satin = oceanIridescence(
    orientationPhase,
    spectralCentroid
  );

  // ------------------------------------------------------------------
  // EXISTING IRIDESCENT / PARTICULATE LANGUAGE
  // ------------------------------------------------------------------
  vec3 deep = vec3(
    0.030,
    0.028,
    0.045
  );

  vec3 dust = vec3(
    0.42,
    0.42,
    0.50
  );

  vec3 fieldBlue = vec3(
    0.18,
    0.42,
    0.68
  );

  vec3 hot = vec3(
    0.92,
    0.96,
    1.00
  );

  float shimmerField = fbm(
    q * 2.8
    + field * 0.9
    + vec2(
      t * 0.42,
      -t * 0.31
    )
  );

  float shimmerMask = smoothstep(
    0.74,
    0.94,
    shimmerField
      + cluster * 0.18
      + alignment * 0.10
  );

  float shimmerPhase = fbm(
    q * 5.6
    + vec2(
      t * 0.9,
      t * 0.37
    )
  );

  float combinedIridescence = clamp(
    shimmerPhase * 0.46
      + orientationPhase * 0.54,
    0.0,
    1.0
  );

  vec3 shimmer = oceanIridescence(
    combinedIridescence,
    spectralCentroid
  );

  // Stable pin identity with smooth time evolution: no floor(time) hash jumps.
  float sparkleSeed = hash(
    pinGrid
    + vec2(
      17.3,
      9.1
    )
  );

  float sparklePhase =
    0.5
    + 0.5
    * sin(
      t * 18.0
      + sparkleSeed * TAU
    );

  float sparkle =
    smoothstep(
      0.885,
      0.995,
      sparkleSeed
    )
    * pow(
      sparklePhase,
      7.0
    )
    * grains;

  float flux = smoothstep(
    0.68,
    0.98,
    fbm(
      q * 4.4
      + field * 0.6
      + vec2(
        t * 0.6,
        -t
      )
    )
  );

  vec3 col = deep;

  // Existing field lines remain, now with mids as their principal excitation.
  col += fieldBlue
    * lines
    * (
      0.34
      + 0.40 * mid
    );

  // RMS gives the particulate substrate sustained material body.
  col += dust
    * pinBody
    * (
      0.40
      + 0.62 * cluster
    )
    * (
      0.82
      + 0.26 * rms
    );

  // The continuous surface adds satin relief without covering the particles.
  col += satin
    * (
      0.025
      + 0.095 * rms
    )
    * (
      0.28
      + 0.72 * diffuse
    )
    * (
      0.30
      + 0.70 * slopeStrength
    );

  col += shimmer
    * grains
    * shimmerMask
    * (
      0.14
      + 0.20 * rms
      + 0.06 * mid
    );

  // Treble owns pin facets and fine sparkle.
  col += hot
    * sparkle
    * (
      0.10
      + 0.68 * treble
    );

  col += mix(
    satin,
    hot,
    0.56
  )
    * grains
    * satinSpec
    * (
      0.035
      + 0.19 * treble
    );

  col += satin
    * grazing
    * (
      0.018
      + 0.082 * rms
    )
    * (
      0.38
      + 0.62 * load
    );

  col += vec3(
    0.30,
    0.55,
    0.86
  )
    * flux
    * lines
    * (
      0.10
      + 0.20 * mid
    );

  // Compression and raised ripple crests change pin relief rather than count.
  col += oceanIridescence(
    clamp(
      orientationPhase
      + 0.12,
      0.0,
      1.0
    ),
    spectralCentroid
  )
    * grains
    * crest
    * (
      0.022
      + 0.075 * treble
    );

  col *=
    1.0
    - depression
    * grains
    * 0.24;

  // Energy is now a local pressure-intersection light, not a frame-wide pump.
  vec2 c1 = impactCenterA(t);
  vec2 c2 = impactCenterB(t);
  vec2 c3 = impactCenterC(t);

  float impactField = max(
    pressureWell(
      p,
      c1,
      0.54
    ),
    max(
      pressureWell(
        p,
        c2,
        0.40
      )
        * smoothstep(
          0.22,
          0.70,
          progress
        ),
      pressureWell(
        p,
        c3,
        0.31
      )
        * lateLoad
    )
  );

  float impactRidge =
    impactField
    * clamp(
      slopeStrength * 1.5,
      0.0,
      1.0
    );

  col += hot
    * impactRidge
    * (
      0.015
      + 0.060 * energy
      + 0.030 * bass
    );

  // Defined vignette equivalent of the old reversed smoothstep.
  float r = length(
    p
  );

  float vig =
    1.0
    - smoothstep(
      0.25,
      1.35,
      r
    );

  col *=
    0.56
    + 0.72 * vig;

  // Restrained tone guard preserves colour separation at ripple intersections.
  col = vec3(1.0) - exp(
    -max(
      col,
      vec3(0.0)
    )
    * 1.08
  );

  fragColor = vec4(
    clamp(
      col,
      0.0,
      1.0
    ),
    1.0
  );
}
`;

export function createMagneticParticulateTheme(): Theme {
  let program: WebGLProgram | null = null;

  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;

  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let uTrackProgress: WebGLUniformLocation | null = null;
  let uRms: WebGLUniformLocation | null = null;
  let uBass: WebGLUniformLocation | null = null;
  let uMid: WebGLUniformLocation | null = null;
  let uTreble: WebGLUniformLocation | null = null;
  let uCentroid: WebGLUniformLocation | null = null;

  return {
    name: "magnetic-particulate",

    init(gl) {
      program = createProgram(
        gl,
        VS,
        FS,
      );

      tri = makeFullscreenTriangle(
        gl,
      );

      uRes = gl.getUniformLocation(
        program,
        "uRes",
      );

      uTime = gl.getUniformLocation(
        program,
        "uTime",
      );

      uEnergy = gl.getUniformLocation(
        program,
        "uEnergy",
      );

      uTrackProgress = gl.getUniformLocation(
        program,
        "uTrackProgress",
      );

      uRms = gl.getUniformLocation(
        program,
        "uRms",
      );

      uBass = gl.getUniformLocation(
        program,
        "uBass",
      );

      uMid = gl.getUniformLocation(
        program,
        "uMid",
      );

      uTreble = gl.getUniformLocation(
        program,
        "uTreble",
      );

      uCentroid = gl.getUniformLocation(
        program,
        "uCentroid",
      );
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(
        program,
      );

      gl.bindVertexArray(
        tri.vao,
      );

      gl.uniform2f(
        uRes,
        opts.width,
        opts.height,
      );

      gl.uniform1f(
        uTime,
        opts.time,
      );

      gl.uniform1f(
        uEnergy,
        opts.audio.energy,
      );

      gl.uniform1f(
        uTrackProgress,
        opts.trackProgress01 ?? 0,
      );

      gl.uniform1f(
        uRms,
        opts.audio.rms ?? opts.audio.energy,
      );

      gl.uniform1f(
        uBass,
        opts.audio.bass ?? opts.audio.energy,
      );

      gl.uniform1f(
        uMid,
        opts.audio.mid ?? opts.audio.energy,
      );

      gl.uniform1f(
        uTreble,
        opts.audio.treble ?? opts.audio.energy,
      );

      gl.uniform1f(
        uCentroid,
        opts.audio.centroid ?? 0.5,
      );

      gl.drawArrays(
        gl.TRIANGLES,
        0,
        3,
      );

      gl.bindVertexArray(
        null,
      );

      gl.useProgram(
        null,
      );
    },

    dispose(gl) {
      if (tri?.buf) {
        gl.deleteBuffer(
          tri.buf,
        );
      }

      if (tri?.vao) {
        gl.deleteVertexArray(
          tri.vao,
        );
      }

      tri = null;

      if (program) {
        gl.deleteProgram(
          program,
        );
      }

      program = null;
    },
  };
}
