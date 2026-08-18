// web/app/home/player/visualizer/themes/filamentStorm.ts
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

// Filament Storm
// A stable advected filament field whose optical character progressively opens
// from restrained cold phosphorescence into full iridescence across the track.
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

  vec2 u = f * f * (3.0 - 2.0 * f);

  return mix(a, b, u.x)
    + (c - a) * u.y * (1.0 - u.x)
    + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;

  // Five octaves preserve the filament structure while dropping the least
  // visible high-frequency octave from every nested FBM evaluation.
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.70, -1.12, 1.12, 1.70) * p;
    amplitude *= 0.5;
  }

  return value;
}

vec2 flow(vec2 p, float t) {
  float a = fbm(p * 1.2 + vec2(t * 0.18, -t * 0.14));
  float b = fbm(p * 1.2 + vec2(-t * 0.13, t * 0.18));

  vec2 gradient = vec2(a - 0.5, b - 0.5);
  vec2 velocity = vec2(gradient.y, -gradient.x);

  velocity += 0.24 * vec2(
    sin(t * 0.10),
    cos(t * 0.085)
  );

  // Structural motion belongs to scene time, never momentary audio.
  return velocity * 0.92;
}

float filamentField(vec2 p, float t) {
  vec2 advected = p;
  float sum = 0.0;
  float weight = 1.0;

  // Keep topology stable. Audio will affect illumination and thickness later,
  // not the number or placement of contours.
  float frequency = 5.15;

  for (int i = 0; i < 7; i++) {
    vec2 velocity = flow(advected, t);
    advected += velocity * 0.05;

    float n = fbm(
      advected * frequency
        + float(i) * 17.1
    );

    float ridge = 1.0 - abs(2.0 * n - 1.0);
    sum += weight * ridge;

    weight *= 0.72;
    frequency *= 1.10;
  }

  return sum / 2.2;
}

float aaBandLine(float x) {
  float width = fwidth(x) + 1e-5;

  return 1.0 - smoothstep(
    0.0,
    0.055 + width,
    x
  );
}

vec3 iridescentPalette(float x) {
  float phase = fract(x);

  vec3 violet = vec3(0.50, 0.30, 1.00);
  vec3 magenta = vec3(1.00, 0.26, 0.72);
  vec3 coral = vec3(1.00, 0.46, 0.34);
  vec3 gold = vec3(1.00, 0.78, 0.30);
  vec3 mint = vec3(0.30, 1.00, 0.72);
  vec3 cyan = vec3(0.20, 0.78, 1.00);

  vec3 colour = violet;
  colour = mix(colour, magenta, smoothstep(0.06, 0.24, phase));
  colour = mix(colour, coral, smoothstep(0.20, 0.40, phase));
  colour = mix(colour, gold, smoothstep(0.36, 0.54, phase));
  colour = mix(colour, mint, smoothstep(0.50, 0.70, phase));
  colour = mix(colour, cyan, smoothstep(0.66, 0.86, phase));
  colour = mix(colour, violet, smoothstep(0.84, 0.99, phase));

  return colour;
}

void main() {
  vec2 p =
    (vUv * uRes - 0.5 * uRes)
    / min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);

  float bass = smoothstep(
    0.05,
    0.95,
    clamp(uBass, 0.0, 1.0)
  );

  float mid = smoothstep(
    0.05,
    0.95,
    clamp(uMid, 0.0, 1.0)
  );

  float treble = smoothstep(
    0.08,
    0.90,
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

  // Long-form verb: IRIDESCE.
  //
  // Progress owns only the optical opening of the storm. The underlying
  // topology, drift and contour count remain the same visual world.
  float journey =
    trackProgress
    * trackProgress
    * (3.0 - 2.0 * trackProgress);

  float dichroicOpening = smoothstep(
    0.10,
    0.72,
    journey
  );

  float prismOpening = smoothstep(
    0.48,
    0.96,
    journey
  );

  // Structural drift is autonomous and intentionally slow.
  float t = max(uTime, 0.0) * 0.090;

  // Larger spatial scale: calmer behind text, with strong negative space.
  vec2 q = p * 0.66;

  float under = clamp(
    fbm(q * 1.35 + vec2(0.0, t * 0.35)),
    0.0,
    1.0
  );

  vec3 deep = vec3(0.010, 0.012, 0.020);
  vec3 atmosphere = vec3(0.038, 0.050, 0.070);

  vec3 base = mix(
    deep,
    atmosphere,
    under
  );

  float field = filamentField(q, t);

  // Constant contour count: treble may illuminate fine structure, but it must
  // not spawn or delete contours.
  float bands = 13.5;
  float bandValue = field * bands;
  float bandFraction = fract(bandValue);
  float distanceToBand = min(
    bandFraction,
    1.0 - bandFraction
  );

  float line = aaBandLine(distanceToBand);

  // Phosphorescent breathing remains autonomous. Audio only provides a modest
  // local lift after the geometry has been established.
  float jitter = clamp(
    fbm(q * 3.4 + vec2(t * 0.55, -t * 0.48)),
    0.0,
    1.0
  );

  float breath =
    0.5
    + 0.5 * sin(
      t * 1.7
      + jitter * 3.14159
    );

  line = clamp(
    line
      * (
        0.88
        + 0.16 * breath
        + 0.06 * e
      ),
    0.0,
    1.0
  );

  float bundle = smoothstep(
    0.34,
    0.90,
    fbm(q * 1.75 + vec2(t * 0.34, -t * 0.28))
  );

  // Bass fattens existing filaments instead of moving the field.
  float thickness =
    mix(0.52, 0.84, bass)
    * bundle;

  float strand = pow(
    line,
    mix(1.26, 0.92, thickness)
  );

  float aa = fwidth(distanceToBand) + 1e-5;

  float halo = 1.0 - smoothstep(
    0.030 + aa,
    0.115 + aa,
    distanceToBand
  );

  halo = max(
    halo - line * 0.52,
    0.0
  );

  // Reuse structural fields as optical coordinates instead of paying for
  // three additional colour-only FBM evaluations.
  float spectralPhase = fract(
    0.10
      + under * 0.23
      + bundle * 0.29
      + jitter * 0.21
      + field * 0.11
      + q.x * 0.045
      - q.y * 0.032
      + t * 0.014
      + (spectralCentroid - 0.5) * 0.16
  );

  vec3 spectral = iridescentPalette(
    spectralPhase
  );

  vec3 splitSpectrum = iridescentPalette(
    spectralPhase
      + 0.14
      + 0.08 * under
  );

  vec3 coldPearl = vec3(0.68, 0.76, 0.94);
  vec3 softViolet = vec3(0.70, 0.58, 0.90);

  vec3 restrained = mix(
    coldPearl,
    softViolet,
    smoothstep(0.18, 0.82, under)
  );

  // Early in the track the field is restrained and pearlescent. The same
  // spatial colour coordinates then open progressively into full spectral
  // separation instead of simply increasing saturation.
  vec3 filamentColour = mix(
    restrained,
    spectral,
    0.10 + 0.80 * dichroicOpening
  );

  vec3 pearl = vec3(0.84, 0.90, 0.98);

  filamentColour = mix(
    filamentColour,
    pearl,
    0.20 - 0.10 * journey
  );

  vec3 haloColour = mix(
    spectral,
    splitSpectrum,
    0.36 + 0.48 * prismOpening
  );

  // Permit a trace of late-track colour into the atmosphere without lifting
  // the black floor or flattening the filament hierarchy.
  base += haloColour
    * under
    * (0.004 + 0.014 * prismOpening);

  vec3 col = base;

  float colourLift =
    0.28
    + 0.22 * e
    + 0.10 * mid;

  col += filamentColour
    * strand
    * colourLift;

  // Mids illuminate the body of the storm; treble reveals thin spectral edges.
  float peak = smoothstep(
    0.58,
    0.95,
    strand
  );

  col += filamentColour
    * peak
    * (0.10 + 0.14 * mid);

  col += haloColour
    * halo
    * (
      0.014
      + 0.050 * dichroicOpening
      + 0.058 * treble * prismOpening
    );

  // Late in the recording, selected intersections develop opalescent flashes.
  // Their locations remain anchored to the existing fields.
  float prismSeam =
    peak
    * smoothstep(0.58, 0.92, jitter)
    * prismOpening;

  col += splitSpectrum
    * prismSeam
    * (
      0.030
      + 0.075 * mid
      + 0.060 * treble
    );

  col += pearl
    * prismSeam
    * prismSeam
    * (0.012 + 0.030 * treble);

  float radius = length(p);

  float vignette =
    1.0 - smoothstep(
      0.25,
      1.35,
      radius
    );

  col *= 0.55 + 0.70 * vignette;

  // Keep global response restrained. Musical excitement should live inside
  // the filaments, not in whole-frame pumping.
  col *= 0.97 + 0.06 * e;

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

export function createFilamentStormTheme(): Theme {
  return createSinglePassTheme({
    name: "filament-storm",
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
