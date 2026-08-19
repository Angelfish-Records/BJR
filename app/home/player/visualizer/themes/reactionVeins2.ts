// web/app/home/player/visualizer/themes/reactionVeins2.ts
// Nebular Ascension / ASCEND v3: preserve monumental dark/light cloud masses and
// the widening celestial perspective while recasting the close material as
// convective stellar plasma rather than reflective liquid.
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
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.58, -1.21, 1.21, 1.58) * p;
    a *= 0.52;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.62;

  for (int i = 0; i < 5; i++) {
    float n = noise(p);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;
    p = mat2(1.72, -0.88, 0.88, 1.72) * p;
    a *= 0.54;
  }

  return v;
}

vec2 curl(vec2 p, float t) {
  float eps = 0.045;

  float n1 = fbm(
    p
    + vec2(0.0, eps)
    + vec2(t * 0.18, -t * 0.13)
  );

  float n2 = fbm(
    p
    - vec2(0.0, eps)
    + vec2(t * 0.18, -t * 0.13)
  );

  float n3 = fbm(
    p
    + vec2(eps, 0.0)
    + vec2(-t * 0.15, t * 0.19)
  );

  float n4 = fbm(
    p
    - vec2(eps, 0.0)
    + vec2(-t * 0.15, t * 0.19)
  );

  vec2 g = vec2(
    n1 - n2,
    n3 - n4
  ) / (2.0 * eps);

  return vec2(
    g.y,
    -g.x
  );
}

vec4 samplePrev(vec2 uv) {
  return texture(
    uPrev,
    clamp(
      uv,
      vec2(0.001),
      vec2(0.999)
    )
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

  float t = uTime * 0.075;

  float energy = clamp(
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

  // The original reaction medium was implicitly tuned per rendered frame.
  // Normalize its transport, blur, persistence, and reaction rates against the
  // 60 Hz reference so realtime adaptive FPS and offline export stay aligned.
  float dt = clamp(
    uDeltaTime,
    0.0,
    0.08
  );

  float step60 = dt * 60.0;

  // Large-scale convection is autonomous. Audio illuminates and excites the
  // medium locally rather than accelerating the global fluid coordinate frame.
  vec2 swirl = curl(
    p * 1.25,
    t
  );

  vec2 slowDrift = vec2(
    fbm(
      p * 0.85
      + vec2(
        t * 0.25,
        4.0
      )
    ),
    fbm(
      p * 0.85
      + vec2(
        -3.0,
        -t * 0.22
      )
    )
  ) - 0.5;

  vec2 advectUv =
    uv
    - (
      swirl * 0.52
      + slowDrift * 0.68
    )
    * texel
    * 18.0
    * step60;

  vec4 prev = samplePrev(
    advectUv
  );

  vec4 blur;

  blur = samplePrev(
    uv + vec2(
      texel.x,
      0.0
    )
  );

  blur += samplePrev(
    uv + vec2(
      -texel.x,
      0.0
    )
  );

  blur += samplePrev(
    uv + vec2(
      0.0,
      texel.y
    )
  );

  blur += samplePrev(
    uv + vec2(
      0.0,
      -texel.y
    )
  );

  blur *= 0.25;

  float blurMix =
    1.0
    - pow(
      1.0 - 0.040,
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

  float heat = state.r;
  float reagent = state.g;
  float bloom = state.b;
  float age = state.a;

  float bodyA = fbm(
    p * 1.35
    + swirl * 0.20
    + vec2(
      t * 0.65,
      -t * 0.24
    )
  );

  float bodyB = fbm(
    p * 1.72
    - swirl * 0.16
    + vec2(
      -t * 0.42,
      t * 0.51
    )
  );

  float cloud = smoothstep(
    0.18,
    0.88,
    bodyA * 0.68
    + bodyB * 0.52
  );

  // Slow low-frequency forcing gives the reaction medium recurring monumental
  // masses. These are not reset events: the same broad structures strengthen,
  // loosen, and re-emerge continuously as autonomous scene time advances.
  float macroBreath =
    0.5
    + 0.5
    * sin(
      t * 0.92
      + bodyB * 2.8
    );

  float macroSource = smoothstep(
    0.48,
    0.72,
    bodyA * 0.62
    + bodyB * 0.46
    + macroBreath * 0.13
  );

  // Stable spatial frequency: the medium has persistent internal identity.
  float waveBands = ridged(
    p * 3.52
    + swirl * 0.55
    + vec2(
      t * 0.58,
      -t * 0.38
    )
  );

  float thermal = smoothstep(
    0.245,
    0.98,
    waveBands
  ) * cloud;

  float granular = fbm(
    p * 10.0
    + swirl * 1.3
    + vec2(
      -t * 2.0,
      t * 1.35
    )
  );

  float sparkle = smoothstep(
    0.62,
    0.96,
    granular
  ) * thermal;

  float reaction =
    heat
    * reagent
    * reagent;

  // The thermal substrate is always fed. Mids own living reaction activity;
  // treble owns fine particulate excitation; energy remains a restrained local
  // reaction accent rather than a global physics multiplier.
  float injection =
    thermal
    * (
      0.046
      + 0.030 * mid
      + 0.010 * energy
    )
    + macroSource
    * (
      0.014
      + 0.010 * mid
    )
    + sparkle
    * (
      0.018
      + 0.026 * treble
    );

  // Preserve large dark/light masses instead of globally driving heat toward
  // one. The autonomous cloud fields become the slow thermal equilibrium, while
  // reaction and music remain local activity inside those stable masses.
  float heatTarget = clamp(
    bodyA * 0.58
    + macroSource * 0.38
    + thermal * 0.18,
    0.0,
    1.0
  );

  float reagentTarget = clamp(
    bodyB
    * (
      0.42
      + 0.58 * macroSource
    )
    * cloud,
    0.0,
    1.0
  );

  float heatDelta =
    (
      heatTarget - heat
    ) * 0.028
    - reaction * 0.18
    + injection * 0.42;

  float reagentDelta =
    (
      reagentTarget - reagent
    ) * 0.018
    + reaction * 0.46
    - reagent * 0.020
    + injection * 0.46;

  heat += heatDelta * step60;
  reagent += reagentDelta * step60;

  float structuralMix =
    1.0
    - pow(
      1.0 - 0.010,
      step60
    );

  heat = mix(
    heat,
    heatTarget,
    clamp(
      structuralMix,
      0.0,
      1.0
    )
  );

  reagent = mix(
    reagent,
    reagentTarget,
    clamp(
      structuralMix * 0.72,
      0.0,
      1.0
    )
  );

  float reactionBloom =
    smoothstep(
      0.06,
      0.62,
      reagent
      - heat * 0.18
      + thermal * 0.90
    )
    * smoothstep(
      0.14,
      0.74,
      cloud
    );

  float macroBloom =
    macroSource
    * (
      0.56
      + 0.22
      * smoothstep(
        0.18,
        0.86,
        thermal
      )
    );

  float bloomTarget = clamp(
    max(
      reactionBloom * 0.88,
      macroBloom
    ),
    0.0,
    1.0
  );

  // Bidirectional relaxation lets masses form again after fading instead of
  // treating bloom as a one-way decaying memory of the reset seed.
  float bloomFollow =
    1.0
    - pow(
      1.0 - 0.020,
      step60
    );

  bloom = mix(
    bloom,
    bloomTarget,
    clamp(
      bloomFollow,
      0.0,
      1.0
    )
  );

  float bloomBlurMix =
    1.0
    - pow(
      1.0 - 0.006,
      step60
    );

  bloom = mix(
    bloom,
    blur.b,
    clamp(
      bloomBlurMix,
      0.0,
      1.0
    )
  );

  float ageRetention = pow(
    0.997,
    step60
  );

  age =
    age * ageRetention
    + (
      bloom * 0.006
      + sparkle * (
        0.010
        + 0.010 * treble
      )
      + energy * 0.0005
    )
    * step60;

  if (uFrame < 1.0) {
    // Seed directly onto the same ongoing structural attractor used by later
    // frames. Seeking therefore lands on a coherent equilibrium rather than a
    // special giant cloud that immediately collapses.
    heat = heatTarget;
    reagent = reagentTarget;
    bloom = bloomTarget;
    age =
      bloomTarget
      * 0.16;
  }

  fragColor = vec4(
    clamp(
      heat,
      0.0,
      1.0
    ),
    clamp(
      reagent,
      0.0,
      1.0
    ),
    clamp(
      bloom,
      0.0,
      1.0
    ),
    clamp(
      age,
      0.0,
      1.0
    )
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
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.55, -1.24, 1.24, 1.55) * p;
    a *= 0.52;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.62;

  for (int i = 0; i < 5; i++) {
    float n = noise(p);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;
    p = mat2(1.74, -0.84, 0.84, 1.74) * p;
    a *= 0.54;
  }

  return v;
}

float aureole(
  vec2 p,
  vec2 center,
  vec2 aspect,
  float radius,
  float width
) {
  float d = length(
    (p - center)
    * aspect
  );

  float band =
    (d - radius)
    / max(
      width,
      0.001
    );

  return exp(
    -band * band
  );
}

float radianceShaft(
  vec2 p,
  vec2 normalDir,
  float offset,
  float width
) {
  float d =
    dot(
      p,
      normalDir
    )
    - offset;

  return exp(
    -d * d
    / max(
      width * width,
      0.0001
    )
  );
}

void solarGranulation(
  vec2 p,
  float t,
  out float cellCore,
  out float cellLane
) {
  vec2 g = p * 6.2;
  vec2 baseCell = floor(g);
  vec2 local = fract(g);

  float nearest = 10.0;
  float secondNearest = 10.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 offset = vec2(
        float(x),
        float(y)
      );

      vec2 cellId =
        baseCell
        + offset;

      vec2 jitter = vec2(
        hash(cellId + 13.7),
        hash(cellId + 47.3)
      );

      // Extremely slow cellular boiling: identity remains world-space stable
      // while each convection centre swells and shifts by only a small amount.
      jitter += 0.070 * vec2(
        sin(
          t * 1.35
          + hash(cellId + 71.1) * 6.28318530718
        ),
        cos(
          t * 1.10
          + hash(cellId + 93.4) * 6.28318530718
        )
      );

      vec2 d =
        offset
        + jitter
        - local;

      float dist2 = dot(
        d,
        d
      );

      if (dist2 < nearest) {
        secondNearest = nearest;
        nearest = dist2;
      } else if (dist2 < secondNearest) {
        secondNearest = dist2;
      }
    }
  }

  float nearestDist = sqrt(
    max(
      nearest,
      0.0
    )
  );

  float boundaryGap =
    sqrt(
      max(
        secondNearest,
        0.0
      )
    )
    - nearestDist;

  cellCore =
    1.0
    - smoothstep(
      0.10,
      0.62,
      nearestDist
    );

  cellLane =
    1.0
    - smoothstep(
      0.015,
      0.095,
      boundaryGap
    );
}

float magneticLoop(
  vec2 p,
  vec2 center,
  vec2 aspect,
  float radius,
  float width
) {
  vec2 q =
    (p - center)
    * aspect;

  float d = abs(
    length(q)
    - radius
  );

  float ring =
    1.0
    - smoothstep(
      width,
      width * 2.7,
      d
    );

  float upperArc = smoothstep(
    -0.16,
    0.14,
    q.y
  );

  float anchorFade =
    1.0
    - smoothstep(
      radius * 0.72,
      radius * 1.18,
      abs(q.x)
    );

  return ring
    * upperArc
    * (
      0.52
      + 0.48 * anchorFade
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

  vec2 screenP =
    (uv * uRes - 0.5 * uRes)
    / min(
      uRes.x,
      uRes.y
    );

  float t = uTime * 0.075;

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

  // Long-form verb: ASCEND.
  // The viewer begins close to a monumental luminous cloud wall, then gains
  // altitude continuously until the same structures become part of an immense
  // nebular complex. Larger viewScale means a wider deterministic world view.
  float ascent = smoothstep(
    0.035,
    0.965,
    progress
  );

  float wideView = smoothstep(
    0.28,
    0.80,
    progress
  );

  float summit = smoothstep(
    0.72,
    0.985,
    progress
  );

  float viewScale = mix(
    0.82,
    3.20,
    ascent
  );

  vec2 cameraAnchor =
    vec2(
      -0.10,
      0.08
    )
    + vec2(
      0.040 * sin(t * 0.12),
      0.030 * cos(t * 0.10)
    );

  vec2 worldP =
    screenP * viewScale
    + cameraAnchor;

  // ------------------------------------------------------------------
  // LIVE REACTION DETAIL
  // ------------------------------------------------------------------
  vec4 s = texture(
    uState,
    uv
  );

  float heat = s.r;
  float reagent = s.g;
  float bloom = s.b;
  float age = s.a;

  float hL = texture(
    uState,
    uv - vec2(
      texel.x,
      0.0
    )
  ).b;

  float hR = texture(
    uState,
    uv + vec2(
      texel.x,
      0.0
    )
  ).b;

  float hD = texture(
    uState,
    uv - vec2(
      0.0,
      texel.y
    )
  ).b;

  float hU = texture(
    uState,
    uv + vec2(
      0.0,
      texel.y
    )
  ).b;

  vec2 grad = vec2(
    hR - hL,
    hU - hD
  ) / max(
    texel.x,
    texel.y
  );

  float gradMagnitude = length(
    grad
  );

  float stateBody = smoothstep(
    0.012,
    0.46,
    bloom
  );

  float reactionGlow = smoothstep(
    0.04,
    0.62,
    reagent
    - heat * 0.16
    + bloom * 0.52
  );

  float rim = smoothstep(
    0.08,
    1.25,
    gradMagnitude
  ) * stateBody;

  // ------------------------------------------------------------------
  // STABLE WORLD-SPACE NEBULAR SCAFFOLD
  // ------------------------------------------------------------------
  // These two fields replace the former screen-space atmosphere/sunset calls,
  // so the display budget stays essentially flat while a real widening view is
  // perceived. Their drift is intentionally far slower than the reaction state.
  float atmosphere = fbm(
    worldP * 0.76
    + vec2(
      t * 0.018,
      -t * 0.013
    )
  );

  float sunset = fbm(
    worldP * 1.34
    + vec2(
      -4.20 + t * 0.010,
      2.70 - t * 0.008
    )
  );

  // One cheap, very-low-frequency field supplies continent-scale cloud masses.
  // It moves slowly enough to read as physical nebular architecture rather than
  // procedural flicker.
  float grandField = noise(
    worldP * 0.34
    + vec2(
      5.7 + t * 0.006,
      -3.4 - t * 0.004
    )
  );

  float macroDensity = clamp(
    atmosphere * 0.55
    + sunset * 0.30
    + grandField * 0.28,
    0.0,
    1.0
  );

  // A very slow threshold tide lets huge light and dark masses repeatedly
  // strengthen and loosen throughout uninterrupted playback. It never depends
  // on seek/reset state.
  float macroTide =
    0.030 * sin(t * 0.68)
    + 0.018 * sin(t * 0.27 + 2.1);

  float macroThreshold =
    0.545
    + macroTide;

  float luminousMass = smoothstep(
    macroThreshold - 0.105,
    macroThreshold + 0.105,
    macroDensity
  );

  float broadVoid =
    1.0
    - smoothstep(
      macroThreshold - 0.225,
      macroThreshold - 0.035,
      macroDensity
    );

  // An asymmetric pillar/head/shoulder complex produces a stable monumental
  // dark cloud silhouette without drawing a literal object. As viewScale grows,
  // it naturally recedes into a much larger field, evoking a Horsehead-like
  // sense of scale rather than copying the astronomical photograph.
  float pillarAxis =
    worldP.x
    + 0.20
    + 0.11
    * sin(
      worldP.y * 1.14
      + 0.38
    )
    + (
      sunset - 0.5
    ) * 0.18;

  float pillarCore =
    1.0
    - smoothstep(
      0.11,
      0.30,
      abs(pillarAxis)
    );

  float pillarVertical =
    smoothstep(
      -1.28,
      -0.72,
      worldP.y
    )
    * (
      1.0
      - smoothstep(
        0.58,
        0.98,
        worldP.y
      )
    );

  float pillar =
    pillarCore
    * pillarVertical;

  float head =
    1.0
    - smoothstep(
      0.24,
      0.50,
      length(
        (
          worldP
          - vec2(
            -0.11,
            0.45
          )
        )
        * vec2(
          1.00,
          1.26
        )
      )
    );

  float shoulder =
    1.0
    - smoothstep(
      0.22,
      0.55,
      length(
        (
          worldP
          - vec2(
            -0.31,
            0.19
          )
        )
        * vec2(
          0.88,
          1.22
        )
      )
    );

  float darkSilhouette = clamp(
    max(
      pillar,
      max(
        head * 0.92,
        shoulder * 0.68
      )
    )
    * smoothstep(
      0.20,
      0.80,
      atmosphere + 0.16
    ),
    0.0,
    1.0
  );

  float shadowOcclusion = clamp(
    max(
      darkSilhouette,
      broadVoid * 0.62
    ),
    0.0,
    1.0
  );

  float macroEdge =
    1.0
    - smoothstep(
      0.030,
      0.115,
      abs(
        macroDensity - macroThreshold
      )
    );

  float silhouetteEdge =
    1.0
    - smoothstep(
      0.035,
      0.17,
      abs(
        darkSilhouette - 0.50
      )
    );

  // Early playback still lets the live reaction state strongly define the
  // close-up. As the camera ascends, world-space structure becomes the dominant
  // macro silhouette while the ping-pong field remains its living thermal skin.
  float stateAuthority = mix(
    0.42,
    0.20,
    wideView
  );

  float nebulaBody = clamp(
    max(
      luminousMass
      * (
        0.88
        + 0.08 * ascent
      ),
      stateBody * stateAuthority
    ),
    0.0,
    1.0
  );

  // ------------------------------------------------------------------
  // PARTICULATE / VEIN DETAIL ALSO LIVES IN THE WIDENING WORLD
  // ------------------------------------------------------------------
  float wave = ridged(
    worldP * 8.15
    + grad * 0.010
    + vec2(
      t * 1.15,
      -t * 0.72
    )
  );

  float fineWave = fbm(
    worldP * 18.0
    + grad * 0.015
    + vec2(
      -t * 2.5,
      t * 1.65
    )
  );

  float particulate =
    smoothstep(
      0.24,
      0.92,
      wave
    )
    * smoothstep(
      0.08,
      0.82,
      fineWave
    );

  float shimmerField = max(
    nebulaBody,
    smoothstep(
      0.18,
      0.72,
      heat
      + reagent * 0.65
    )
  );

  particulate *=
    shimmerField
    * (
      0.84
      + 0.44 * reactionGlow
      + 0.18 * treble
    );

  // ------------------------------------------------------------------
  // CONVECTIVE STELLAR GRANULATION
  // ------------------------------------------------------------------
  float granuleCore = 0.0;
  float granuleLane = 0.0;

  solarGranulation(
    worldP,
    t,
    granuleCore,
    granuleLane
  );

  // Granules belong to the luminous material and therefore recede naturally
  // as viewScale grows. They are not screen-space glitter.
  float granuleBody =
    granuleCore
    * nebulaBody
    * (
      0.64
      + 0.36 * stateBody
    );

  float intergranularLane =
    granuleLane
    * nebulaBody
    * (
      0.60
      + 0.40 * luminousMass
    );

  float thermalFront =
    smoothstep(
      0.10,
      1.18,
      gradMagnitude
    )
    * max(
      stateBody,
      luminousMass * 0.62
    );

  float convectiveGlow = clamp(
    granuleBody * 0.72
    + thermalFront * 0.58
    + particulate * 0.24,
    0.0,
    1.0
  );

  // ------------------------------------------------------------------
  // WARM COSMIC TONAL LADDER
  // ------------------------------------------------------------------
  vec3 deepBronze = vec3(
    0.056,
    0.031,
    0.023
  );

  vec3 plumShadow = vec3(
    0.090,
    0.047,
    0.100
  );

  vec3 mutedIndigo = vec3(
    0.060,
    0.078,
    0.160
  );

  vec3 umber = vec3(
    0.180,
    0.050,
    0.022
  );

  vec3 crimsonHeat = vec3(
    0.520,
    0.080,
    0.030
  );

  vec3 burntOrange = vec3(
    0.910,
    0.260,
    0.055
  );

  vec3 roseGold = vec3(
    0.760,
    0.285,
    0.205
  );

  vec3 amber = vec3(
    0.930,
    0.455,
    0.135
  );

  vec3 deepGold = vec3(
    0.980,
    0.655,
    0.190
  );

  vec3 radiantGold = vec3(
    1.000,
    0.800,
    0.330
  );

  vec3 champagne = vec3(
    1.000,
    0.905,
    0.670
  );

  vec3 pearl = vec3(
    1.000,
    0.970,
    0.865
  );

  vec3 base = mix(
    deepBronze,
    mutedIndigo,
    smoothstep(
      0.18,
      0.88,
      atmosphere
    ) * 0.30
  );

  base = mix(
    base,
    plumShadow,
    broadVoid * 0.34
  );

  float thermalPhase = smoothstep(
    0.12,
    0.88,
    heat
    + reactionGlow * 0.30
  );

  vec3 thermalCol = mix(
    roseGold,
    amber,
    thermalPhase
  );

  thermalCol = mix(
    thermalCol,
    deepGold,
    smoothstep(
      0.30,
      0.92,
      reagent
      + reactionGlow * 0.24
    )
  );

  thermalCol = mix(
    thermalCol,
    radiantGold,
    ascent
      * smoothstep(
        0.42,
        0.98,
        bloom
        + reagent * 0.35
      )
      * 0.72
  );

  float spectralElevation = smoothstep(
    0.30,
    0.82,
    spectralCentroid
  );

  vec3 elevatedGold = mix(
    radiantGold,
    champagne,
    spectralElevation
  );

  // ------------------------------------------------------------------
  // SELF-EMISSIVE PLASMA FRONTS
  // ------------------------------------------------------------------
  // The former pseudo-normal/specular model made the medium read as polished
  // liquid. Hot gas should emit at compression fronts instead of reflecting a
  // virtual lamp, so gradients now drive thermal radiation directly.
  float compressionFront = smoothstep(
    0.14,
    1.35,
    gradMagnitude
  );

  float whiteHotFront =
    compressionFront
    * smoothstep(
      0.22,
      0.88,
      reagent
      + bloom * 0.38
    );

  float coronalShear =
    macroEdge
    * (
      0.42
      + 0.58 * fineWave
    );

  // ------------------------------------------------------------------
  // CELESTIAL SCALE: STRUCTURES REVEALED BY THE SAME ASCENDING CAMERA
  // ------------------------------------------------------------------
  float aureoleA = aureole(
    worldP,
    vec2(
      -0.74,
      0.58
    ),
    vec2(
      0.78,
      1.08
    ),
    0.92,
    0.18
  );

  float aureoleB = aureole(
    worldP,
    vec2(
      0.86,
      -0.46
    ),
    vec2(
      1.10,
      0.82
    ),
    1.04,
    0.22
  );

  float aureoleC = aureole(
    worldP,
    vec2(
      0.02,
      1.18
    ),
    vec2(
      0.92,
      1.18
    ),
    1.08,
    0.24
  );

  float aureoleField =
    aureoleA * 0.46
    + aureoleB
      * wideView
      * 0.58
    + aureoleC
      * summit
      * 0.54;

  vec2 shaftNormalA = normalize(
    vec2(
      0.82,
      -0.57
    )
  );

  vec2 shaftNormalB = normalize(
    vec2(
      0.58,
      0.82
    )
  );

  float shaftField =
    radianceShaft(
      worldP,
      shaftNormalA,
      -0.10
        + 0.04 * sin(t * 0.18),
      0.22
    )
    + radianceShaft(
      worldP,
      shaftNormalA,
      0.46,
      0.16
    ) * 0.42
    + radianceShaft(
      worldP,
      shaftNormalB,
      -0.48,
      0.19
    )
      * summit
      * 0.48;

  shaftField *=
    wideView
    * (
      0.24
      + 0.76 * luminousMass
    );

  // ------------------------------------------------------------------
  // MAGNETIC PLASMA LOOPS / FLARES
  // ------------------------------------------------------------------
  float flarePulseA =
    0.5
    + 0.5
    * sin(
      t * 3.8
      + 0.8
    );

  float flarePulseB =
    0.5
    + 0.5
    * sin(
      t * 2.9
      + 3.4
    );

  float loopA = magneticLoop(
    worldP,
    vec2(
      -0.54,
      -0.10
    ),
    vec2(
      1.00,
      1.42
    ),
    0.42,
    0.020
  );

  float loopB = magneticLoop(
    worldP,
    vec2(
      0.48,
      0.20
    ),
    vec2(
      0.88,
      1.58
    ),
    0.34,
    0.018
  );

  float magneticFlare =
    loopA
    * smoothstep(
      0.34,
      0.88,
      flarePulseA
    )
    + loopB
      * smoothstep(
        0.48,
        0.93,
        flarePulseB
      )
      * (
        0.42
        + 0.58 * wideView
      );

  magneticFlare *= max(
    luminousMass,
    stateBody * 0.70
  );

  // ------------------------------------------------------------------
  // COMPOSITION
  // ------------------------------------------------------------------
  vec3 activeShadow = mix(
    umber,
    crimsonHeat,
    smoothstep(
      0.18,
      0.82,
      heat
      + granuleCore * 0.26
    )
  );

  vec3 col = mix(
    base,
    activeShadow,
    nebulaBody * 0.20
  );

  col = mix(
    col,
    thermalCol,
    nebulaBody
    * (
      0.58
      + 0.10 * stateBody
    )
  );

  // Intergranular lanes carve the boiling photospheric network before the
  // emissive layers are accumulated.
  col *=
    1.0
    - intergranularLane
    * (
      0.18
      + 0.10 * (
        1.0 - wideView
      )
    );

  // Stable broad luminosity now owns the principal cloud mass. The live
  // reaction state enriches it but cannot make the macro structure disappear.
  col += deepGold
    * luminousMass
    * (
      0.060
      + 0.060 * bass
    );

  // Bass gives the live thermal body mass and warmth.
  col += deepGold
    * stateBody
    * heat
    * (
      0.025
      + 0.080 * bass
    );

  // RMS sustains radiance within existing structures rather than lifting voids.
  col += radiantGold
    * nebulaBody
    * (
      0.022
      + 0.080 * rms
    )
    * (
      0.38
      + 0.62 * reactionGlow
    );

  // Mids reveal living internal veins.
  col += deepGold
    * particulate
    * (
      0.18
      + 0.34 * mid
    );

  // Treble catches champagne particulate and state boundaries.
  col += elevatedGold
    * particulate
    * (
      0.038
      + 0.21 * treble
    );

  col += champagne
    * rim
    * (
      0.045
      + 0.11 * treble
      + 0.06 * reactionGlow
    );

  col += roseGold
    * smoothstep(
      0.56,
      0.98,
      age
    )
    * stateBody
    * 0.055;

  float haze = smoothstep(
    0.08,
    0.86,
    heat
    + bloom * 0.45
  );

  col += mix(
    mix(
      plumShadow,
      crimsonHeat,
      0.56 * nebulaBody
    ),
    amber,
    sunset
  )
    * haze
    * 0.055;

  // Convective cell interiors radiate from within rather than catching a
  // reflective highlight.
  col += burntOrange
    * granuleBody
    * (
      0.045
      + 0.055 * bass
      + 0.035 * rms
    );

  col += radiantGold
    * convectiveGlow
    * (
      0.030
      + 0.070 * rms
      + 0.040 * mid
    );

  col += champagne
    * whiteHotFront
    * (
      0.030
      + 0.090 * treble
      + 0.030 * spectralElevation
    );

  col += deepGold
    * coronalShear
    * nebulaBody
    * (
      0.020
      + 0.045 * mid
    );

  // Stable macro boundaries are the principal high-contrast golden architecture.
  col += deepGold
    * macroEdge
    * luminousMass
    * (
      0.040
      + 0.050 * mid
    );

  // Large-scale aureoles and shafts remain subordinate to the clouds. They
  // become perceptible only because the viewpoint has widened.
  float celestialMask = max(
    luminousMass * 0.86,
    smoothstep(
      0.14,
      0.80,
      bloom
      + heat * 0.32
    )
    * 0.55
  );

  col += elevatedGold
    * aureoleField
    * celestialMask
    * (
      0.015
      + 0.055 * wideView
    );

  col += champagne
    * shaftField
    * celestialMask
    * (
      0.012
      + 0.050 * wideView
      + 0.025 * rms
    );

  float pearlReveal =
    summit
    * smoothstep(
      0.42,
      0.96,
      reactionGlow
      + rim * 0.28
      + macroEdge * 0.20
    );

  col += pearl
    * pearlReveal
    * (
      0.018
      + 0.045 * treble
    );

  // Sparse magnetic loops remain part of the same stellar surface. Mids ignite
  // the plasma body; treble catches the hottest coronal edge.
  col += radiantGold
    * magneticFlare
    * (
      0.035
      + 0.090 * mid
    );

  col += pearl
    * magneticFlare
    * compressionFront
    * (
      0.012
      + 0.065 * treble
    );

  // Energy remains a local reaction accent only.
  col += radiantGold
    * reactionGlow
    * particulate
    * energy
    * 0.038;

  // Apply the stable dark cloud after emissive assembly so these structures do
  // not disappear merely because the live reaction texture brightens.
  col *=
    1.0
    - shadowOcclusion
    * (
      0.58
      + 0.14 * wideView
    );

  // A restrained champagne rim keeps the silhouette majestic rather than flat.
  col += champagne
    * silhouetteEdge
    * (
      0.028
      + 0.060 * treble
      + 0.025 * wideView
    );

  float r = length(
    screenP
  );

  float vig =
    1.0
    - smoothstep(
      0.26,
      1.46,
      r
    );

  col *=
    0.80
    + 0.30 * vig;

  // Filmic shoulder keeps gold/champagne separation while allowing genuine
  // negative space around the stable dark nebular forms.
  col = vec3(1.0) - exp(
    -max(
      col,
      vec3(0.0)
    )
    * 1.08
  );

  col = pow(
    max(
      col,
      vec3(0.0)
    ),
    vec3(0.93)
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

export function createReactionVeins2Theme(): Theme {
  return createPingPongTheme({
    name: "reaction-veins-2",
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
