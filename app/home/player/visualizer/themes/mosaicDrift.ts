// web/app/home/player/visualizer/themes/mosaicDrift.ts
// Graphic Mosaic / CHARGE: stable recursive tessellation rendered as a kinetic
// cel-shaded graphic novel — heavy ink, halftone, action strokes, and panel cuts.
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

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

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(
    n,
    hash12(p + n + 17.7)
  );
}

vec3 hash33(vec2 p) {
  return vec3(
    hash12(p + 3.17),
    hash12(p + 37.11),
    hash12(p + 91.73)
  );
}

mat2 rotate2(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

// Locked structural idea from RESOLVE: deterministic macro and child Voronoi
// topology. Audio and track progress never move, scale, or rewire these sites.
float voronoiCell(
  vec2 x,
  out vec2 cellId,
  out vec2 cellCenter,
  out float edgeDistance
) {
  vec2 n = floor(x);
  vec2 f = fract(x);

  float nearest = 1e9;
  float secondNearest = 1e9;
  vec2 bestId = vec2(0.0);
  vec2 bestPoint = vec2(0.0);

  for (int y = -1; y <= 1; y++) {
    for (int xOffset = -1; xOffset <= 1; xOffset++) {
      vec2 offset = vec2(float(xOffset), float(y));
      vec2 id = n + offset;
      vec2 randomPoint = hash22(id);

      vec2 site = offset + mix(
        vec2(0.5),
        randomPoint,
        0.78
      );

      vec2 delta = f - site;
      float distanceSq = dot(delta, delta);

      if (distanceSq < nearest) {
        secondNearest = nearest;
        nearest = distanceSq;
        bestId = id;
        bestPoint = site;
      } else if (distanceSq < secondNearest) {
        secondNearest = distanceSq;
      }
    }
  }

  cellId = bestId;
  cellCenter = n + bestPoint;
  edgeDistance = sqrt(secondNearest) - sqrt(nearest);
  return sqrt(nearest);
}

vec3 comicPalette(float value, float spectralCentroid) {
  vec3 cobalt = vec3(0.025, 0.18, 0.62);
  vec3 electricCyan = vec3(0.015, 0.67, 0.88);
  vec3 violet = vec3(0.38, 0.07, 0.73);
  vec3 magenta = vec3(0.88, 0.035, 0.43);
  vec3 hotOrange = vec3(1.00, 0.25, 0.025);
  vec3 acidGreen = vec3(0.04, 0.58, 0.25);

  float t = fract(
    value
    + (spectralCentroid - 0.5) * 0.045
  );

  vec3 colour;
  if (t < 0.18) {
    colour = cobalt;
  } else if (t < 0.34) {
    colour = electricCyan;
  } else if (t < 0.52) {
    colour = violet;
  } else if (t < 0.70) {
    colour = magenta;
  } else if (t < 0.86) {
    colour = hotOrange;
  } else {
    colour = acidGreen;
  }

  vec3 warmBias = vec3(1.06, 0.94, 0.84);
  vec3 coolBias = vec3(0.88, 1.00, 1.08);
  return colour * mix(
    warmBias,
    coolBias,
    spectralCentroid
  );
}

float seamMask(float edgeDistance, float width) {
  float aa = max(
    fwidth(edgeDistance),
    0.00045
  );

  return 1.0 - smoothstep(
    width - aa * 1.25,
    width + aa * 1.65,
    edgeDistance
  );
}

float rimMask(
  float edgeDistance,
  float innerWidth,
  float outerWidth
) {
  float aa = max(
    fwidth(edgeDistance),
    0.00045
  );

  float outerBand = 1.0 - smoothstep(
    outerWidth - aa,
    outerWidth + aa * 1.5,
    edgeDistance
  );

  float innerBand = 1.0 - smoothstep(
    innerWidth - aa,
    innerWidth + aa * 1.5,
    edgeDistance
  );

  return clamp(
    outerBand - innerBand,
    0.0,
    1.0
  );
}

float halftone(
  vec2 p,
  float angle,
  float frequency,
  float radius
) {
  vec2 q = rotate2(angle) * p * frequency;
  vec2 cell = fract(q) - 0.5;
  float d = length(cell);
  float aa = max(
    fwidth(d),
    0.001
  );

  return 1.0 - smoothstep(
    radius - aa,
    radius + aa * 1.5,
    d
  );
}

float swoopStroke(
  vec2 p,
  float angle,
  float bend,
  float offset,
  float phase,
  float width
) {
  vec2 q = rotate2(angle) * p;
  q.x += 0.11 * sin(phase * 0.37);

  float curve =
    q.y
    - bend * q.x * q.x
    - 0.055 * sin(q.x * 5.4 + phase)
    - offset;

  float envelope =
    1.0
    - smoothstep(
      0.38,
      1.18,
      abs(q.x)
    );

  float d = abs(curve);
  float aa = max(
    fwidth(d),
    0.00055
  );

  return (
    1.0
    - smoothstep(
      width - aa,
      width + aa * 1.5,
      d
    )
  ) * envelope;
}

float diagonalSpeedLines(
  vec2 p,
  vec2 direction,
  float phase,
  float frequency
) {
  vec2 tangent = vec2(
    -direction.y,
    direction.x
  );

  float coordinate =
    dot(p, tangent) * frequency
    + dot(p, direction) * 4.0
    + phase;

  float wave = abs(
    sin(coordinate)
  );

  float aa = max(
    fwidth(wave),
    0.001
  );

  return 1.0 - smoothstep(
    0.055 - aa,
    0.055 + aa * 1.4,
    wave
  );
}

float radialBurst(
  vec2 p,
  vec2 origin,
  float phase
) {
  vec2 q = p - origin;
  float radius = length(q);
  float angle = atan(q.y, q.x);

  float spokes = pow(
    max(
      0.0,
      cos(angle * 17.0 + phase)
    ),
    18.0
  );

  float annulus =
    smoothstep(
      0.20,
      0.36,
      radius
    )
    * (
      1.0
      - smoothstep(
        0.88,
        1.18,
        radius
      )
    );

  return spokes * annulus;
}

void main() {
  float minRes = max(
    1.0,
    min(uRes.x, uRes.y)
  );

  vec2 screen =
    (vUv * uRes - 0.5 * uRes)
    / minRes;

  float energy = smoothstep(
    0.02,
    0.96,
    clamp(uEnergy, 0.0, 1.0)
  );

  float rms = smoothstep(
    0.02,
    0.94,
    clamp(uRms, 0.0, 1.0)
  );

  float bass = smoothstep(
    0.03,
    0.95,
    clamp(uBass, 0.0, 1.0)
  );

  float mid = smoothstep(
    0.03,
    0.95,
    clamp(uMid, 0.0, 1.0)
  );

  float treble = smoothstep(
    0.04,
    0.96,
    clamp(uTreble, 0.0, 1.0)
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

  // Long-form verb: CHARGE.
  // The graphic-novel language exists from frame one. Progress increases
  // kinetic pressure, nested ink detail, and action-language density.
  float childPresence =
    0.74
    + 0.26
    * smoothstep(
      0.06,
      0.42,
      progress
    );

  float microPresence =
    0.18
    + 0.82
    * smoothstep(
      0.30,
      0.86,
      progress
    );

  float actionCharge =
    0.10
    + 0.90
    * smoothstep(
      0.12,
      0.92,
      progress
    );

  float climaxCharge = smoothstep(
    0.70,
    0.96,
    progress
  );

  // Autonomous scene time: slow traversal of the tessellated world plus faster
  // graphic action phases. Neither scale nor camera position is audio-driven.
  float materialTime = uTime * 0.035;
  float actionTime = uTime;

  vec2 drift = vec2(
    materialTime * 0.115,
    -materialTime * 0.078
  );

  drift += 0.030 * vec2(
    sin(materialTime * 0.61),
    cos(materialTime * 0.47)
  );

  vec2 world =
    screen * 3.18
    + drift;

  // ------------------------------------------------------------------
  // MACRO PANEL CELLS
  // ------------------------------------------------------------------
  vec2 parentId;
  vec2 parentCenter;
  float parentEdgeDistance;

  float parentRadius = voronoiCell(
    world,
    parentId,
    parentCenter,
    parentEdgeDistance
  );

  vec3 parentHash = hash33(
    parentId + vec2(13.7, -8.2)
  );

  float parentKey = fract(
    parentHash.x * 0.71
    + parentHash.y * 0.21
    + parentHash.z * 0.08
  );

  vec3 parentColour = comicPalette(
    parentKey,
    spectralCentroid
  );

  vec2 parentLocal =
    world
    - parentCenter;

  // Hard cel-shading: broad directional bands, not smooth glass depth.
  float lightField =
    0.56
    + 0.31
    * dot(
      normalize(
        vec2(-0.72, 0.69)
      ),
      normalize(
        parentLocal
        + vec2(0.001)
      )
    )
    + 0.18
    * sin(
      dot(
        world,
        vec2(1.86, -1.28)
      )
      + parentHash.y * TAU
      + materialTime * 0.38
    );

  float celBand;
  if (lightField < 0.38) {
    celBand = 0.44;
  } else if (lightField < 0.63) {
    celBand = 0.72;
  } else {
    celBand = 1.04;
  }

  float parentMass =
    1.0
    - smoothstep(
      0.10,
      0.78,
      parentRadius
    );

  vec3 ink = vec3(
    0.0015,
    0.0012,
    0.0020
  );

  vec3 col =
    parentColour
    * celBand
    * (
      0.48
      + 0.15 * rms
      + 0.08 * bass
    );

  // Shadow halftone is always present: this is print language, not a late reveal.
  float shadowMask = 1.0 - smoothstep(
    0.43,
    0.69,
    lightField
  );

  float parentDots = halftone(
    world + parentHash.xy * 0.41,
    0.34,
    12.0,
    0.19 + 0.025 * mid
  );

  col = mix(
    col,
    col * 0.34,
    parentDots
      * shadowMask
      * 0.68
  );

  // Fine stable print grain makes the surface less digitally pristine.
  float printGrain = hash12(
    floor(
      world * 82.0
    )
    + parentId * 0.37
  );

  col *=
    0.92
    + 0.11 * printGrain;

  // ------------------------------------------------------------------
  // NESTED COMIC CELLS
  // ------------------------------------------------------------------
  float parentAngle =
    (parentHash.x - 0.5)
    * 1.05;

  vec2 childDomain =
    rotate2(parentAngle)
    * parentLocal
    * 4.05;

  childDomain +=
    parentHash.yz * 7.3
    + parentId * 0.173;

  vec2 childId;
  vec2 childCenter;
  float childEdgeDistance;

  float childRadius = voronoiCell(
    childDomain,
    childId,
    childCenter,
    childEdgeDistance
  );

  vec3 childHash = hash33(
    childId
    + parentId * 7.31
    + vec2(19.4, -31.7)
  );

  float childKey =
    parentKey
    + (childHash.x - 0.5) * 0.13;

  vec3 childColour = comicPalette(
    childKey,
    spectralCentroid
  );

  float accentShard = smoothstep(
    0.91,
    0.985,
    childHash.z
  );

  vec3 accentColour = comicPalette(
    parentKey + 0.46,
    spectralCentroid
  );

  childColour = mix(
    childColour,
    accentColour,
    accentShard * 0.78
  );

  float childLight =
    0.5
    + 0.5
    * sin(
      dot(
        childDomain,
        vec2(1.84, 2.71)
      )
      + childHash.y * TAU
    );

  float childCel;
  if (childLight < 0.34) {
    childCel = 0.48;
  } else if (childLight < 0.66) {
    childCel = 0.78;
  } else {
    childCel = 1.05;
  }

  float childMass =
    1.0
    - smoothstep(
      0.12,
      0.76,
      childRadius
    );

  col = mix(
    col,
    childColour
      * childCel
      * (
        0.56
        + 0.10 * rms
        + 0.08 * mid
      ),
    childPresence
      * (
        0.20
        + 0.31 * childMass
      )
  );

  float childDots = halftone(
    childDomain + childHash.xy * 0.73,
    -0.42,
    8.0,
    0.17
  );

  col = mix(
    col,
    col * 0.48,
    childDots
      * childPresence
      * (
        0.10
        + 0.28 * (1.0 - childLight)
      )
  );

  // ------------------------------------------------------------------
  // MICRO INK / CROSSHATCH
  // ------------------------------------------------------------------
  vec2 microCell =
    fract(
      childDomain * 2.32
      + childHash.xy * 2.7
    )
    - 0.5;

  float diagonalA = abs(
    abs(microCell.x + microCell.y)
    - 0.315
  );

  float diagonalB = abs(
    abs(microCell.x - microCell.y)
    - 0.315
  );

  float microDistance = min(
    diagonalA,
    diagonalB
  );

  float microAa = max(
    fwidth(microDistance),
    0.00045
  );

  float microLine =
    1.0
    - smoothstep(
      0.014 - microAa,
      0.014 + microAa * 1.4,
      microDistance
    );

  float crossHatch =
    microLine
    * microPresence;

  // ------------------------------------------------------------------
  // HEAVY INK CONTOURS
  // ------------------------------------------------------------------
  float inkWobble =
    0.0045
    * sin(
      world.x * 17.0
      + 0.55
      * sin(
        world.y * 11.0
      )
    );

  float parentSeam = seamMask(
    parentEdgeDistance,
    0.041 + inkWobble
  );

  float parentRim = rimMask(
    parentEdgeDistance,
    0.041 + inkWobble,
    0.074 + inkWobble
  );

  float childSeam =
    seamMask(
      childEdgeDistance,
      0.027
    )
    * childPresence
    * (1.0 - parentSeam);

  float childRim =
    rimMask(
      childEdgeDistance,
      0.027,
      0.052
    )
    * childPresence
    * (1.0 - parentSeam);

  float microMask =
    crossHatch
    * (1.0 - parentSeam)
    * (1.0 - childSeam);

  col = mix(
    col,
    ink,
    childSeam * 0.88
  );

  col = mix(
    col,
    ink,
    microMask * 0.36
  );

  col = mix(
    col,
    ink,
    parentSeam * 0.995
  );

  vec3 coolInkLight = vec3(
    0.18,
    0.72,
    1.00
  );

  vec3 hotInkLight = vec3(
    1.00,
    0.30,
    0.055
  );

  vec3 edgeAccent = mix(
    hotInkLight,
    coolInkLight,
    spectralCentroid
  );

  col += edgeAccent
    * parentRim
    * (
      0.018
      + 0.055 * treble
    );

  col += mix(
    childColour,
    edgeAccent,
    0.42
  )
    * childRim
    * (
      0.012
      + 0.072 * treble
      + 0.018 * mid
    );

  // ------------------------------------------------------------------
  // ACTION LANGUAGE — SPEED LINES, SWOOPS, BURSTS
  // ------------------------------------------------------------------
  vec2 speedDirA = normalize(
    vec2(0.88, -0.47)
  );

  vec2 speedDirB = normalize(
    vec2(-0.72, -0.69)
  );

  float speedA = diagonalSpeedLines(
    screen,
    speedDirA,
    actionTime * 7.4,
    74.0
  );

  float speedB = diagonalSpeedLines(
    screen,
    speedDirB,
    -actionTime * 5.8 + 2.3,
    61.0
  );

  float edgeZone = smoothstep(
    0.30,
    0.98,
    length(screen)
  );

  float speedMask =
    max(
      speedA,
      speedB * 0.74
    )
    * edgeZone
    * actionCharge;

  col = mix(
    col,
    ink,
    speedMask
      * (
        0.20
        + 0.26 * actionCharge
      )
  );

  col += mix(
    coolInkLight,
    hotInkLight,
    0.30 + 0.42 * energy
  )
    * speedMask
    * (
      0.015
      + 0.052 * treble
      + 0.020 * energy
    );

  float swoopPhase =
    actionTime * 1.65;

  float swoopA = swoopStroke(
    screen,
    -0.52,
    0.34,
    0.04,
    swoopPhase,
    0.018
  );

  float swoopB = swoopStroke(
    screen,
    0.68,
    -0.28,
    -0.14,
    -swoopPhase * 0.83 + 1.9,
    0.014
  );

  float swoopC = swoopStroke(
    screen,
    -0.16,
    0.18,
    0.27,
    swoopPhase * 0.61 + 4.2,
    0.011
  );

  float swoopInk =
    max(
      swoopA,
      max(
        swoopB * 0.86,
        swoopC * climaxCharge
      )
    )
    * actionCharge;

  col = mix(
    col,
    ink,
    swoopInk * 0.92
  );

  float swoopHighlight =
    max(
      swoopStroke(
        screen,
        -0.52,
        0.34,
        0.04,
        swoopPhase,
        0.007
      ),
      swoopStroke(
        screen,
        0.68,
        -0.28,
        -0.14,
        -swoopPhase * 0.83 + 1.9,
        0.005
      )
    )
    * actionCharge;

  col += edgeAccent
    * swoopHighlight
    * (
      0.045
      + 0.10 * treble
      + 0.055 * energy
    );

  vec2 burstOrigin = vec2(
    0.18 * sin(actionTime * 0.23),
    0.12 * cos(actionTime * 0.19)
  );

  float burst = radialBurst(
    screen,
    burstOrigin,
    actionTime * 0.72
  )
    * climaxCharge;

  col = mix(
    col,
    ink,
    burst * 0.54
  );

  col += hotInkLight
    * burst
    * (
      0.018
      + 0.075 * treble
      + 0.050 * energy
    );

  // ------------------------------------------------------------------
  // FAST GRAPHIC PANEL CUTS
  // ------------------------------------------------------------------
  float cutCycle = actionTime * 0.16;
  float cutEpoch = floor(cutCycle);
  float cutPhase = fract(cutCycle);

  float cutEnvelope =
    smoothstep(
      0.00,
      0.055,
      cutPhase
    )
    * (
      1.0
      - smoothstep(
        0.19,
        0.32,
        cutPhase
      )
    );

  float cutSeed = hash12(
    vec2(
      cutEpoch,
      17.3
    )
  );

  float cutAngle =
    -0.82
    + cutSeed * 1.64;

  vec2 cutNormal = vec2(
    cos(cutAngle),
    sin(cutAngle)
  );

  float cutOffset =
    (hash12(
      vec2(
        cutEpoch,
        51.8
      )
    ) - 0.5)
    * 0.66;

  float cutDistance = abs(
    dot(
      screen,
      cutNormal
    )
    - cutOffset
  );

  float cutAa = max(
    fwidth(cutDistance),
    0.0006
  );

  float cutBand =
    1.0
    - smoothstep(
      0.026 - cutAa,
      0.026 + cutAa * 1.5,
      cutDistance
    );

  float cutRim =
    (
      1.0
      - smoothstep(
        0.058 - cutAa,
        0.058 + cutAa * 1.5,
        cutDistance
      )
    )
    - cutBand;

  cutBand *=
    cutEnvelope
    * (
      0.34
      + 0.66 * actionCharge
    );

  cutRim *=
    cutEnvelope
    * actionCharge;

  col = mix(
    col,
    ink,
    cutBand * 0.98
  );

  col += mix(
    hotInkLight,
    coolInkLight,
    cutSeed
  )
    * cutRim
    * (
      0.040
      + 0.080 * energy
      + 0.070 * treble
    );

  // Bass and RMS remain local material illumination.
  float parentInterior =
    1.0
    - parentSeam;

  col += parentColour
    * parentInterior
    * parentMass
    * (
      0.020 * bass
      + 0.017 * rms
    );

  // Keep a readable centre for typography without turning the frame into a
  // conventional vignette: the corners carry more action ink.
  float centreQuiet = 1.0 - smoothstep(
    0.16,
    0.74,
    length(screen)
  );

  col *=
    0.86
    + 0.10 * centreQuiet;

  // Posterized finishing curve: retain hard graphic colour steps.
  col = clamp(
    col,
    0.0,
    1.4
  );

  vec3 levels = floor(
    col * 5.0 + 0.5
  ) / 5.0;

  col = mix(
    col,
    levels,
    0.42 + 0.18 * actionCharge
  );

  // Restrained filmic guardrail keeps action highlights coloured instead of
  // clipping to white.
  col = vec3(1.0) - exp(
    -col * 1.22
  );

  col = pow(
    max(
      col,
      vec3(0.0)
    ),
    vec3(0.92)
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

export function createMosaicDriftTheme(): Theme {
  return createSinglePassTheme({
    name: "mosaic-drift",
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
