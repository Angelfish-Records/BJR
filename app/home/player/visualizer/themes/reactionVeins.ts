// web/app/home/player/visualizer/themes/reactionVeins.ts
// Reaction Veins — soft hardening pass.
// Preserve the original reaction-front / ridged-vein topology and vascular-tissue
// palette; keep cheaper field evaluation and deterministic whole-track development.
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

// Reaction–Diffusion Veins (organic memory skin)
//
// Still deliberately procedural rather than stateful reaction diffusion. The
// original visual language is retained: one advected reaction field, one ridged
// vein topology, pale reaction edges, mottled mauve tissue, and a dark vignette.
// Track progress develops that same topology instead of replacing it with a new
// anatomical hierarchy.
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

// Efficiency retained from the hardening pass: four octaves are enough for the
// moving material fields. The original six-octave version spent most of its
// budget inside the repeated flow loop.
float fbm4(vec2 p) {
  float v = 0.0;
  float amplitude = 0.55;

  for (int i = 0; i < 4; i++) {
    v += amplitude * noise(p);
    p = mat2(1.63, -1.14, 1.14, 1.63) * p;
    amplitude *= 0.5;
  }

  return v;
}

// TOPOLOGY LOCK: this is the original single ridged vein family. Keep its
// frequency ladder, rotation, and five-octave construction intact. Progress may
// reveal more of this field, but audio/time must not replace or rewire it.
float ridged(vec2 p) {
  float v = 0.0;
  float amplitude = 0.65;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += amplitude * n;
    frequency *= 2.05;
    amplitude *= 0.55;
    p = mat2(0.86, -0.50, 0.50, 0.86) * p;
  }

  return v;
}

// Original curl-ish growth bias, evaluated with the cheaper four-octave FBM.
vec2 flow(vec2 p, float t) {
  float a = fbm4(
    p * 1.1
    + vec2(
      t * 0.2,
      -t * 0.17
    )
  );

  float b = fbm4(
    p * 1.1
    + vec2(
      -t * 0.16,
      t * 0.22
    )
  );

  vec2 g = vec2(
    a - 0.5,
    b - 0.5
  );

  return vec2(
    g.y,
    -g.x
  );
}

void main() {
  vec2 p =
    (vUv * uRes - 0.5 * uRes)
    / max(
      1.0,
      min(uRes.x, uRes.y)
    );

  float t = uTime * 0.08;

  float progress = clamp(
    uTrackProgress,
    0.0,
    1.0
  );

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

  // Long-form development without a new aesthetic vocabulary.
  //
  // ~10%: broad, partially latent reaction veins.
  // ~50%: the same field is thicker and more interconnected.
  // ~90%: the same topology is richly resolved, with stronger fine boundaries.
  float chapterA = smoothstep(
    0.06,
    0.30,
    progress
  );

  float chapterB = smoothstep(
    0.38,
    0.70,
    progress
  );

  float chapterC = smoothstep(
    0.74,
    0.96,
    progress
  );

  float development =
    0.16
    + 0.27 * chapterA
    + 0.31 * chapterB
    + 0.26 * chapterC;

  // Original memory-skin advection, made cheaper by using three four-octave
  // flow evaluations instead of five six-octave evaluations. Crucially, this is
  // autonomous: music no longer changes the world's coordinate motion.
  vec2 a = p * 1.15;
  float adv = 0.235;

  for (int i = 0; i < 3; i++) {
    vec2 f = flow(
      a,
      t
    );

    a += f * adv * 0.082;
    adv *= 0.84;
  }

  // Original phase-shifted reagent fields.
  float U = fbm4(
    a * 1.6
    + vec2(
      0.0,
      t * 1.2
    )
  );

  float V = fbm4(
    a * 1.6
    + vec2(
      12.3,
      -t * 1.1
    )
  );

  float diff = abs(
    U - V
  );

  float front = smoothstep(
    0.08,
    0.32,
    diff
  );

  // ORIGINAL TOPOLOGY: one ridged field at the original scale and drift.
  float veinBase = ridged(
    a * 2.4
    + vec2(
      t * 0.4,
      -t * 0.25
    )
  );

  // Progress reveals more of the same topology. No extra vein families are
  // introduced, and audio does not change the threshold.
  float veinThreshold = mix(
    0.392,
    0.318,
    development
  );

  float veins = smoothstep(
    veinThreshold,
    0.92,
    veinBase
  );

  veins *=
    0.35
    + (
      0.70
      + 0.07 * chapterB
      + 0.06 * chapterC
    ) * front;

  // Preserve the original healing/thickening language. Bass and RMS affect
  // material fullness only; whole-track development provides the durable arc.
  float thickness = smoothstep(
    0.12,
    0.55,
    veins
  );

  thickness *=
    0.55
    + 0.25 * development
    + 0.16 * bass
    + 0.10 * rms;

  // Original boundary chatter, now with treble as its explicit responsibility.
  float edge = smoothstep(
    0.25,
    0.85,
    abs(
      veinBase - 0.5
    )
  );

  edge *=
    0.075
    + 0.035 * development
    + 0.075 * treble
    + 0.018 * energy;

  // Original palette: organic marble / vascular tissue.
  vec3 deep = vec3(
    0.06,
    0.05,
    0.08
  );

  vec3 skin = vec3(
    0.20,
    0.16,
    0.22
  );

  // Centroid only nudges the established lavender vein colour around its
  // original value; it does not introduce a new palette.
  vec3 warmVein = vec3(
    0.72,
    0.60,
    0.82
  );

  vec3 coolVein = vec3(
    0.68,
    0.64,
    0.88
  );

  vec3 vein = mix(
    warmVein,
    coolVein,
    spectralCentroid
  );

  vec3 hl = vec3(
    0.95,
    0.96,
    1.00
  );

  float body = smoothstep(
    0.20,
    0.95,
    fbm4(
      a * 1.1
      - vec2(
        t * 0.25,
        t * 0.18
      )
    )
  );

  vec3 col = mix(
    deep,
    skin,
    body
  );

  col = mix(
    col,
    vein,
    clamp(
      thickness,
      0.0,
      1.0
    )
  );

  // Keep the original pale reactive edge. Mids strengthen the reaction front;
  // treble catches its fine boundary.
  col += hl
    * edge
    * (
      0.70
      + 0.42 * front
      + 0.10 * mid
      + 0.05 * treble
    );

  // Mids add a very small local reaction lift rather than shifting topology.
  col += vein
    * front
    * (
      0.010
      + 0.026 * mid
    );

  // Original gentle mottling.
  float mott = fbm4(
    a * 3.2
    + vec2(
      -t * 0.6,
      t * 0.4
    )
  );

  col *=
    0.88
    + 0.18 * mott;

  // Original vignette.
  float r = length(p);

  float vig =
    1.0
    - smoothstep(
      0.25,
      1.35,
      r
    );

  col *=
    0.55
    + 0.70 * vig;

  // Replace the old frame-wide energy pump with a much smaller RMS body lift.
  // This keeps the original exposure range without letting every band whiten the
  // entire image.
  col *=
    0.945
    + 0.060 * rms;

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

export function createReactionVeinsTheme(): Theme {
  return createSinglePassTheme({
    name: "reaction-veins",
    fragmentShader: FS,
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
