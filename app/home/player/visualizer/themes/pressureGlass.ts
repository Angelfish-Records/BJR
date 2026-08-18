// web/app/home/player/visualizer/themes/pressureGlass.ts
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

// Pressure Glass
// A stressed liquid-crystal sheet whose autonomous microscopic life remains
// materially coherent while the whole-track viewpoint slowly turns across it.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

const float PI = 3.14159265359;

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

  // This shader evaluates FBM seven times per pixel because the pressure
  // pseudo-normal uses four finite-difference samples. Five octaves preserve
  // the liquid-crystal structure while removing the least visible sixth octave
  // from every one of those calls.
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.74, -1.12, 1.12, 1.74) * p;
    amplitude *= 0.5;
  }

  return value;
}

mat2 rot(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

vec3 thinFilm(float x) {
  float r = 0.5 + 0.5 * cos(6.28318 * (x + 0.00));
  float g = 0.5 + 0.5 * cos(6.28318 * (x + 0.33));
  float b = 0.5 + 0.5 * cos(6.28318 * (x + 0.66));

  return vec3(r, g, b);
}

void main() {
  vec2 viewP =
    (vUv * uRes - 0.5 * uRes)
    / min(uRes.x, uRes.y);

  float e = smoothstep(
    0.02,
    0.98,
    clamp(uEnergy, 0.0, 1.0)
  );

  float bass = smoothstep(
    0.04,
    0.96,
    clamp(uBass, 0.0, 1.0)
  );

  float mid = smoothstep(
    0.04,
    0.96,
    clamp(uMid, 0.0, 1.0)
  );

  float treble = smoothstep(
    0.06,
    0.94,
    clamp(uTreble, 0.0, 1.0)
  );

  float spectralCentroid = clamp(
    uCentroid,
    0.0,
    1.0
  );

  float trackProgress = clamp(
    uTrackProgress,
    0.0,
    1.0
  );

  // Long-form verb: TURN.
  //
  // The stressed material itself does not rotate in response to the music.
  // Playback position owns a single cinematic roll of the field of view across
  // the same optical sheet. The slight easing keeps the beginning established
  // and lets the latter half carry more of the perceptual turn.
  float journey =
    trackProgress
    * trackProgress
    * (3.0 - 2.0 * trackProgress);

  float turnJourney = pow(
    journey,
    1.12
  );

  float viewAngle =
    mix(
      -0.30,
      0.62,
      turnJourney
    )
    + 0.035 * sin(trackProgress * PI);

  vec2 p = rot(viewAngle) * viewP;

  // Autonomous material time. Pressure convection, breathing and microscopic
  // sweep stay alive independently of both track progress and instantaneous
  // musical excitation.
  float t = max(uTime, 0.0) * 0.12;

  vec2 q =
    p
    * (
      1.35
      + 0.20 * sin(t * 0.30)
    );

  q += 0.18 * vec2(
    sin(t * 1.20),
    cos(t * 0.90)
  );

  vec2 pressureCoord =
    q * 1.20
    + vec2(0.0, t * 0.90);

  float pressureRaw = fbm(
    pressureCoord
  );

  float pressure = smoothstep(
    0.20,
    0.95,
    pressureRaw
  );

  // Internal stress gradients -> pseudo normals. These are already the most
  // expensive part of the shader, so later optical refinements reuse them.
  float eps = 0.0025;

  float px1 = fbm(
    (q + vec2(eps, 0.0)) * 1.20
      + vec2(0.0, t * 0.90)
  );

  float px2 = fbm(
    (q - vec2(eps, 0.0)) * 1.20
      + vec2(0.0, t * 0.90)
  );

  float py1 = fbm(
    (q + vec2(0.0, eps)) * 1.20
      + vec2(0.0, t * 0.90)
  );

  float py2 = fbm(
    (q - vec2(0.0, eps)) * 1.20
      + vec2(0.0, t * 0.90)
  );

  vec2 grad = vec2(
    px1 - px2,
    py1 - py2
  ) / (2.0 * eps);

  // Pressure Glass is a deliberate exception to the usual rule that audio
  // should not deform structure. Stress is the physical metaphor of this
  // theme, so strong musical energy is allowed to load the material itself.
  // The camera, viewing angle and master clock remain completely independent.
  float stressSurge = smoothstep(
    0.34,
    0.86,
    e
  );

  // Square the envelope so ordinary passages retain the autonomous glide while
  // stronger moments cross into distinctly more confrontational deformation.
  stressSurge *= stressSurge;

  // Reuse the existing pressure field to make the surge spatially uneven.
  // This prevents the response from reading as a uniform canvas wobble.
  float stressAsymmetry =
    0.52
    + 0.48 * sin(
      pressureRaw * 8.5
      + q.x * 2.6
      - q.y * 2.1
      + t * 0.72
    );

  float localStress =
    stressSurge
    * (
      0.58
      + 0.42 * stressAsymmetry
    );

  float bulge =
    (
      0.26
      + 0.025 * sin(t * 0.41)
      + 0.15 * localStress
    )
    * (pressure - 0.5);

  vec2 drift =
    vec2(0.06, -0.05)
    * sin(
      t * 0.70
      + pressure * 2.0
    )
    * (
      0.64
      + 0.10 * sin(t * 0.33)
      + 0.28 * localStress
    );

  vec2 micro =
    0.018
    * grad
    * (
      0.44
      + 0.16 * sin(t * 3.0)
      + 0.64 * localStress
    );

  // A small tangential shear makes high-energy moments feel as though internal
  // stress is slipping sideways along the existing pseudo-normal field. It is
  // bounded and field-local: the global frame never jumps.
  vec2 stressShear =
    vec2(
      grad.y,
      -grad.x
    )
    * sin(
      pressureRaw * 9.0
      - t * 1.15
    )
    * (
      0.010 * localStress
    );

  vec2 wuv =
    p
    + drift
    + micro
    + grad * bulge
    + stressShear;

  // Refraction-like secondary fields. No additional noise field is introduced
  // during hardening; these existing samples also supply the audio masks.
  float glass = fbm(
    wuv * 2.20
      + vec2(t * 0.35, -t * 0.22)
  );

  float bands = fbm(
    wuv * 4.0
      - vec2(t * 0.18, t * 0.26)
  );

  float gradientMagnitude = length(
    grad
  );

  // Thin-film interference remains structurally tied to the glass. Spectral
  // centroid may bias colour, but no audio feature displaces the phase field.
  float phase = fract(
    0.55 * glass
      + 0.45 * bands
      + 0.12 * gradientMagnitude
      + 0.15 * sin(t * 0.60)
      + (spectralCentroid - 0.5) * 0.08
  );

  vec3 primaryFilm = thinFilm(
    phase
  );

  // Reuse the pseudo-normal as a view-angle-sensitive birefringence cue. This
  // makes the long TURN optically meaningful without another FBM evaluation.
  vec2 stressDirection = normalize(
    grad + vec2(0.0001)
  );

  vec2 polarizerAxis = vec2(
    cos(viewAngle + 0.85),
    sin(viewAngle + 0.85)
  );

  float polarization =
    0.5
    + 0.5 * dot(
      stressDirection,
      polarizerAxis
    );

  vec3 shiftedFilm = thinFilm(
    fract(
      phase
      + 0.17
      + pressure * 0.07
    )
  );

  vec3 iridescence = mix(
    primaryFilm,
    shiftedFilm,
    0.08 + 0.20 * polarization
  );

  // Glass body retains the original dark microscopic character.
  vec3 base = mix(
    vec3(0.04, 0.05, 0.08),
    vec3(0.10, 0.12, 0.18),
    glass
  );

  vec3 col = mix(
    base,
    iridescence,
    0.53 + 0.28 * pressure
  );

  // Frequency bands still own local appearance. Broad-band energy has already
  // been spent above on the theme's deliberate material-stress exception.
  // Bass reveals broad stressed regions.
  float broadStress = smoothstep(
    0.30,
    0.88,
    pressure * 0.78 + glass * 0.22
  );

  col += mix(
    base,
    iridescence,
    0.44
  ) * broadStress
    * (
      0.012
      + 0.065 * bass
    );

  // Mids illuminate existing interference boundaries.
  float interferenceEdge = smoothstep(
    0.10,
    0.42,
    abs(glass - bands)
  );

  col += iridescence
    * interferenceEdge
    * (
      0.010
      + 0.080 * mid
    );

  // Treble brightens stable pseudo-normal sheen rather than creating ripples.
  float sheen = smoothstep(
    0.10,
    0.55,
    gradientMagnitude
  );

  vec3 pearl = vec3(
    0.90,
    0.95,
    1.00
  );

  col += pearl
    * sheen
    * (
      0.085
      + 0.145 * treble
      + 0.025 * e
    );

  // Subtle material failure: high-stress regions can split, crumble and
  // partially dissolve. This reuses the existing pressure / interference
  // fields so the effect reads as the sheet itself failing under load.
  float lateWear = smoothstep(
    0.22,
    0.90,
    trackProgress
  );

  float failureDrive =
    (
      0.20
      + 0.80 * lateWear
    )
    * (
      0.26
      + 0.74 * localStress
    );

  float fractureField = abs(
    sin(
      pressureRaw * 10.5
      + glass * 4.4
      - bands * 5.1
      + q.x * 2.8
      - q.y * 2.2
      - t * 0.55
    )
  );

  float splitHalo =
    smoothstep(
      0.82,
      0.95,
      fractureField
    )
    * smoothstep(
      0.18,
      0.58,
      gradientMagnitude
    )
    * smoothstep(
      0.12,
      0.44,
      abs(glass - bands)
    )
    * failureDrive;

  float splitCore =
    smoothstep(
      0.91,
      0.985,
      fractureField
    )
    * smoothstep(
      0.22,
      0.62,
      gradientMagnitude
    )
    * failureDrive;

  float crumble =
    smoothstep(
      0.26,
      0.74,
      pressure
    )
    * (
      0.45 * splitHalo
      + 0.55 * splitCore
    );

  col = mix(
    col,
    col * 0.18 + vec3(0.012, 0.014, 0.020),
    0.42 * crumble
  );

  col += iridescence
    * splitHalo
    * (
      0.016
      + 0.040 * mid
    );

  col += pearl
    * splitHalo
    * (
      0.014
      + 0.050 * treble
    );

  col *=
    1.0
    - 0.20 * splitCore;

  // Screen-space vignette stays fixed while the field beneath it turns.
  float radius = length(
    viewP
  );

  float vignette = smoothstep(
    1.35,
    0.25,
    radius
  );

  col *=
    0.55
    + 0.70 * vignette;

  // Whole-frame pumping is deliberately restrained.
  col *=
    0.98
    + 0.05 * e;

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

export function createPressureGlassTheme(): Theme {
  return createSinglePassTheme({
    name: "pressure-glass",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uTrackProgress",
        getValue: (opts) => opts.trackProgress01 ?? 0,
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
