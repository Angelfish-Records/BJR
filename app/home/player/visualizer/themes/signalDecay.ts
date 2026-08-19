// web/app/home/player/visualizer/themes/signalDecay.ts
// Phosphor Erosion / ERODE: preserve the glassy blue-green feedback world,
// normalize its physical timing, separate musical roles, and let signal matter
// erode deterministically across the recording while ghost memory persists.
import type { Theme } from "../types";
import { createPingPongTheme } from "./themeFactory";

const SIM_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uFrame;
uniform float uDeltaTime;
uniform float uMid;
uniform float uTreble;

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

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.64, -1.17, 1.17, 1.64) * p;
    a *= 0.5;
  }

  return v;
}

vec2 localFlow(vec2 p, float t) {
  vec2 cell = floor(p * 2.35);
  vec2 local = fract(p * 2.35) - 0.5;

  float seed = hash(cell);
  float a = seed * 6.28318 + t * (0.35 + seed * 0.55);
  vec2 orbit = vec2(cos(a), sin(a));

  float curlA = fbm(
    p * 1.35
    + orbit * 0.8
    + vec2(t * 0.28, -t * 0.18)
  );

  float curlB = fbm(
    p * 1.35
    - orbit * 0.7
    + vec2(-t * 0.22, t * 0.31)
  );

  vec2 curl = vec2(
    curlA - 0.5,
    curlB - 0.5
  );

  curl = vec2(
    curl.y,
    -curl.x
  );

  float pull =
    1.0
    - smoothstep(
      0.10,
      0.78,
      length(local)
    );

  return mix(
    curl,
    curl + orbit * 0.55,
    pull
  );
}

void main() {
  vec2 uv = vUv;
  vec2 texel =
    1.0
    / max(
      uRes,
      vec2(1.0)
    );

  vec2 p =
    (uv * uRes - 0.5 * uRes)
    / min(
      uRes.x,
      uRes.y
    );

  float t = uTime * 0.10;
  float e = clamp(
    uEnergy,
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

  // The legacy shader was tuned implicitly for one simulation step per 60 Hz
  // frame. Normalize those rates to elapsed scene time so adaptive realtime FPS
  // and offline export FPS preserve approximately the same physical evolution.
  float dt = clamp(
    uDeltaTime,
    0.0,
    0.08
  );

  float step60 = dt * 60.0;

  vec2 f = localFlow(
    p,
    t
  );

  vec2 shimmer = vec2(
    fbm(
      p * 3.8
      + vec2(
        t * 1.7,
        2.0
      )
    ),
    fbm(
      p * 3.8
      + vec2(
        5.0,
        -t * 1.4
      )
    )
  ) - 0.5;

  // Autonomous transport: music illuminates the signal but does not accelerate
  // or deform the global flow field.
  vec2 advect =
    uv
    - (
      f * 17.0
      + shimmer * 4.5
    )
    * texel
    * step60;

  vec4 prev = texture(
    uPrev,
    clamp(
      advect,
      vec2(0.001),
      vec2(0.999)
    )
  );

  vec4 blur = vec4(0.0);

  blur += texture(
    uPrev,
    uv + vec2(texel.x, 0.0)
  );

  blur += texture(
    uPrev,
    uv + vec2(-texel.x, 0.0)
  );

  blur += texture(
    uPrev,
    uv + vec2(0.0, texel.y)
  );

  blur += texture(
    uPrev,
    uv + vec2(0.0, -texel.y)
  );

  blur *= 0.25;

  float blurMix =
    1.0
    - pow(
      1.0 - 0.042,
      step60
    );

  vec4 state = mix(
    prev,
    blur,
    clamp(
      blurMix,
      0.0,
      1.0
    )
  );

  vec2 warp = vec2(
    fbm(
      p * 1.8
      + vec2(
        t * 0.7,
        -t * 0.4
      )
    ),
    fbm(
      p * 1.8
      + vec2(
        9.0 - t * 0.5,
        t * 0.6
      )
    )
  ) - 0.5;

  vec2 q =
    p
    + warp * 0.39;

  float carrierA = sin(
    (q.x * 7.6 + q.y * 2.3)
    + t * 2.3
  );

  float carrierB = sin(
    (q.y * 7.1 - q.x * 1.9)
    - t * 1.7
  );

  float carrierC = sin(
    dot(
      q,
      normalize(
        vec2(0.74, 0.67)
      )
    )
    * 12.4
    + t * 1.15
  );

  float signal =
    (
      carrierA
      + carrierB
      + carrierC
    )
    * 0.333;

  signal += (
    fbm(
      q * 2.45
      + vec2(
        t,
        -t * 0.6
      )
    )
    - 0.5
  ) * 0.72;

  // Energy and mids own fresh local signal injection, not the underlying flow.
  float injection = smoothstep(
    0.61 - 0.050 * e - 0.045 * mid,
    0.99,
    abs(signal)
  );

  injection *=
    1.0
    - smoothstep(
      0.08,
      1.16,
      length(p)
    );

  injection *=
    (
      0.052
      + 0.095 * e
      + 0.055 * mid
    )
    * step60;

  vec3 spectral = vec3(
    smoothstep(
      0.20,
      0.95,
      signal
    ),
    smoothstep(
      0.18,
      0.88,
      fbm(
        q * 2.0
        + vec2(
          3.1,
          t
        )
      )
    ),
    smoothstep(
      0.18,
      0.90,
      -signal + 0.42
    )
  );

  float rgbRetention = pow(
    0.958,
    step60
  );

  float alphaRetention = pow(
    0.968,
    step60
  );

  state.rgb *= rgbRetention;
  state.rgb += spectral * injection;

  // Treble owns the fine phosphor/scan fault rather than global brightness.
  float scan =
    1.0
    - smoothstep(
      0.0,
      0.025,
      abs(
        fract(
          uv.y * 42.0
          - t * 3.0
        )
        - 0.5
      )
    );

  state.b +=
    scan
    * (
      0.003
      + 0.018 * treble
    )
    * step60;

  state.a = max(
    state.a * alphaRetention,
    injection * 2.35
  );

  // uFrame remains part of the shared ping-pong contract, but reset/recreation
  // now injects immediately instead of forcing two blank frames.
  float frameGuard = step(
    -1.0,
    uFrame
  );

  fragColor = clamp(
    state * frameGuard,
    vec4(0.0),
    vec4(1.0)
  );
}
`;

const DISPLAY_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uState;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uTrackProgress;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

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

  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = mat2(1.62, -1.11, 1.11, 1.62) * p;
    a *= 0.5;
  }

  return v;
}

void main() {
  vec2 uv = vUv;

  vec2 texel =
    1.0
    / max(
      uRes,
      vec2(1.0)
    );

  vec2 p =
    (uv * uRes - 0.5 * uRes)
    / min(
      uRes.x,
      uRes.y
    );

  float t = uTime * 0.10;

  float e = clamp(
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

  vec4 s = texture(
    uState,
    uv
  );

  float lx = texture(
    uState,
    uv + vec2(texel.x, 0.0)
  ).a;

  float rx = texture(
    uState,
    uv - vec2(texel.x, 0.0)
  ).a;

  float uy = texture(
    uState,
    uv + vec2(0.0, texel.y)
  ).a;

  float dy = texture(
    uState,
    uv - vec2(0.0, texel.y)
  ).a;

  float edge = smoothstep(
    0.02,
    0.42,
    length(
      vec2(
        lx - rx,
        uy - dy
      )
    )
  );

  // Autonomous shadow-play remains part of the theme's successful identity.
  float shadowA = fbm(
    p * 1.15
    + vec2(
      t * 0.95,
      -t * 0.42
    )
  );

  float shadowB = fbm(
    p * 2.10
    + vec2(
      -t * 0.55,
      t * 0.72
    )
  );

  float shadow = smoothstep(
    0.24,
    0.82,
    shadowA * 0.72
    + shadowB * 0.28
  );

  float veil = smoothstep(
    0.20,
    0.88,
    fbm(
      p * 0.85
      + vec2(
        -t * 1.15,
        t * 0.38
      )
    )
  );

  // Long-form verb: ERODE.
  // A static multiscale weakness field makes the chapter reconstructible from
  // trackProgress01 alone. Material disappears before its cold ghost memory.
  float erosionField =
    noise(
      p * 1.35
      + vec2(
        4.7,
        -3.1
      )
    )
    * 0.52
    + noise(
      p * 3.40
      + vec2(
        -8.2,
        5.6
      )
    )
    * 0.30
    + noise(
      p * 8.60
      + vec2(
        11.3,
        2.4
      )
    )
    * 0.18;

  float abrasion = smoothstep(
    0.12,
    0.58,
    progress
  );

  float fracture = smoothstep(
    0.52,
    0.88,
    progress
  );

  float residue = smoothstep(
    0.78,
    0.98,
    progress
  );

  float bodyErosion =
    abrasion * 0.56
    + fracture * 0.44;

  float ghostErosion =
    abrasion * 0.46
    + fracture * 0.34
    + residue * 0.20;

  float bodyThreshold = mix(
    -0.16,
    0.68,
    bodyErosion
  );

  float ghostThreshold = mix(
    -0.20,
    0.53,
    ghostErosion
  );

  float bodySurvival = smoothstep(
    bodyThreshold - 0.075,
    bodyThreshold + 0.075,
    erosionField
  );

  float ghostSurvival = smoothstep(
    ghostThreshold - 0.085,
    ghostThreshold + 0.085,
    erosionField
  );

  float erosionFront =
    (
      1.0
      - smoothstep(
        0.025,
        0.095,
        abs(
          erosionField
          - bodyThreshold
        )
      )
    )
    * smoothstep(
      0.16,
      0.90,
      progress
    );

  // Fine transmission faults are time-driven and local. Treble makes them more
  // visible without changing the geometry or master coordinate frame.
  float grain = hash(
    floor(
      (p + 1.3) * 205.0
    )
    + floor(
      t * 20.0
    )
  );

  float dropout = smoothstep(
    0.92 - 0.065 * treble,
    0.995,
    grain
  );

  vec3 deep = vec3(
    0.014,
    0.015,
    0.030
  );

  vec3 ghost = mix(
    vec3(
      0.12,
      0.34,
      0.48
    ),
    vec3(
      0.17,
      0.28,
      0.62
    ),
    spectralCentroid
  );

  vec3 leaf = mix(
    vec3(
      0.28,
      0.58,
      0.20
    ),
    vec3(
      0.18,
      0.50,
      0.30
    ),
    spectralCentroid
  );

  vec3 hot = mix(
    vec3(
      0.72,
      0.92,
      0.92
    ),
    vec3(
      0.80,
      0.86,
      1.00
    ),
    spectralCentroid
  );

  vec3 residualBlue = mix(
    vec3(
      0.24,
      0.54,
      0.78
    ),
    vec3(
      0.34,
      0.44,
      0.94
    ),
    spectralCentroid
  );

  vec3 col = deep;

  // RMS owns persistent ghost depth.
  col += ghost
    * s.rgb
    * ghostSurvival
    * (
      1.02
      + 0.46 * rms
    );

  // Bass owns the substantial green body; mids expose its internal signal.
  col += leaf
    * s.g
    * s.a
    * bodySurvival
    * (
      0.28
      + 0.34 * bass
      + 0.13 * mid
    );

  col += mix(
    leaf,
    ghost,
    0.46
  )
    * s.r
    * s.b
    * bodySurvival
    * (
      0.025
      + 0.095 * mid
    );

  // Treble owns the phosphor edge. It survives longer than the material body.
  col += hot
    * edge
    * mix(
      bodySurvival,
      ghostSurvival,
      0.76
    )
    * (
      0.10
      + 0.29 * treble
    );

  col += residualBlue
    * s.a
    * ghostSurvival
    * (
      0.065
      + 0.15 * rms
    );

  // As matter disappears, a narrow cold erosion front briefly exposes the
  // signal boundary. Energy may intensify it locally but never pumps the frame.
  col += hot
    * erosionFront
    * s.a
    * (
      0.018
      + 0.070 * treble
      + 0.032 * e
    );

  col *= mix(
    0.38,
    1.18,
    shadow
  );

  col *= mix(
    1.0,
    0.58,
    veil * (1.0 - shadow)
  );

  col *=
    1.0
    - dropout
    * (
      0.10
      + 0.28 * treble
    );

  float r = length(p);

  float vig =
    1.0
    - smoothstep(
      0.25,
      1.35,
      r
    );

  col *=
    0.50
    + 0.78 * vig;

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

export function createSignalDecayTheme(): Theme {
  return createPingPongTheme({
    name: "signal-decay",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
    resetOnTrackProgressSeek: true,
    extraFloatUniforms: [
      {
        name: "uTrackProgress",
        getValue: (opts) => opts.trackProgress01 ?? 0,
      },
      {
        name: "uRms",
        getValue: (opts) => opts.audio.rms ?? opts.audio.energy,
      },
      {
        name: "uBass",
        getValue: (opts) => opts.audio.bass ?? opts.audio.energy,
      },
      {
        name: "uMid",
        getValue: (opts) => opts.audio.mid ?? opts.audio.energy,
      },
      {
        name: "uTreble",
        getValue: (opts) => opts.audio.treble ?? opts.audio.energy,
      },
      {
        name: "uCentroid",
        getValue: (opts) => opts.audio.centroid ?? 0.5,
      },
    ],
  });
}
