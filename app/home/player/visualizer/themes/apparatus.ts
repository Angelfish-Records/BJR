// web/app/home/player/visualizer/themes/apparatus.ts
//
// THE APPARATUS
//
// Physical world:
//   A vast black-steel institutional machine seen as an industrial cross-section:
//   pressure vessel, turbine intake, actuator bank, manifolds, service rails,
//   inspection cavities and buried pressure conduits.
//
// Long-form verb:
//   BREACH
//
// Temporal ownership:
//   uTime          -> local rotor / piston / scan / coolant machinery motion
//   audio          -> local pressure, heat, relay, edge and spark excitation
//   uTrackProgress -> deterministic whole-track commandeering / rupture
//
// Audio ownership:
//   bass      -> pressure vessel + deep conduit loading
//   rms       -> persistent heat in metal and cavities
//   mid       -> relays, actuator activity and inspection systems
//   treble    -> stressed edges, electrical detail and sparks
//   centroid  -> heat colour temperature
//   energy    -> restrained local overdrive only
//
// No momentary audio value moves the camera, coordinate frame or macro layout.
//
// APPARATUS GEOMETRY STATUS:
//   MACHINERY REBUILD CANDIDATE — NOT LOCKED YET.
//   If this composition proves successful, the geometry section below should
//   become the explicit lock boundary for later material / audio hardening.

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
uniform float uViewYSign;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

float saturate(float value) {
  return clamp(value, 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);

  vec2 u =
    f * f * (3.0 - 2.0 * f);

  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));

  return mix(
    mix(a, b, u.x),
    mix(c, d, u.x),
    u.y
  );
}

float industrialNoise(vec2 p) {
  float coarse =
    valueNoise(p);

  float fine =
    valueNoise(
      p * 2.17
      + vec2(19.7, 41.3)
    );

  return coarse * 0.68
    + fine * 0.32;
}

float inspectionWindow(float coordinate) {
  float cell = fract(coordinate);

  float enter = smoothstep(
    0.10,
    0.19,
    cell
  );

  float exit =
    1.0
    - smoothstep(
      0.72,
      0.84,
      cell
    );

  return enter * exit;
}

mat2 rot2(float angle) {
  float c = cos(angle);
  float s = sin(angle);
  return mat2(c, -s, s, c);
}

float sdBox(vec2 p, vec2 halfSize) {
  vec2 q = abs(p) - halfSize;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdRoundBox(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - halfSize + radius;

  return min(max(q.x, q.y), 0.0)
    + length(max(q, 0.0))
    - radius;
}

float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;

  float denom = max(
    dot(ba, ba),
    0.000001
  );

  float h = clamp(
    dot(pa, ba) / denom,
    0.0,
    1.0
  );

  return length(
    pa - ba * h
  );
}

float aaFill(float signedDistance) {
  float aa = max(
    fwidth(signedDistance) * 1.20,
    0.00045
  );

  return 1.0 - smoothstep(
    -aa,
    aa,
    signedDistance
  );
}

float aaLine(
  float distanceToLine,
  float halfWidth
) {
  float aa = max(
    fwidth(distanceToLine) * 1.25,
    0.00045
  );

  return 1.0 - smoothstep(
    halfWidth - aa,
    halfWidth + aa,
    distanceToLine
  );
}

float aaRing(
  float radialDistance,
  float radius,
  float halfWidth
) {
  return aaLine(
    abs(radialDistance - radius),
    halfWidth
  );
}

vec3 heatPalette(
  float spectralCentroid,
  float treble,
  float thermalLoad
) {
  vec3 deepRed = vec3(
    0.38,
    0.012,
    0.002
  );

  vec3 furnace = vec3(
    0.93,
    0.075,
    0.008
  );

  vec3 whiteHot = mix(
    vec3(
      1.00,
      0.48,
      0.15
    ),
    vec3(
      0.86,
      0.79,
      0.69
    ),
    spectralCentroid
  );

  vec3 colour = mix(
    deepRed,
    furnace,
    saturate(
      0.30
      + thermalLoad * 0.62
    )
  );

  return mix(
    colour,
    whiteHot,
    saturate(
      spectralCentroid * 0.52
      + treble * 0.20
      + thermalLoad * 0.14
    )
  );
}

void main() {
  float energy = saturate(uEnergy);
  float rms = saturate(uRms);
  float bass = saturate(uBass);
  float mid = saturate(uMid);
  float treble = saturate(uTreble);
  float spectralCentroid = saturate(uCentroid);
  float progress = saturate(uTrackProgress);

  float aspect = max(
    uRes.x / max(uRes.y, 1.0),
    0.001
  );

  vec2 p =
    (vUv - 0.5)
    * vec2(aspect, 1.0);

  // Realtime presentation and raw offline readback use opposite vertical row
  // conventions. This changes presentation only, not authored composition.
  p.y *= uViewYSign;

  float takeoverA = smoothstep(
    0.14,
    0.38,
    progress
  );

  float takeoverB = smoothstep(
    0.38,
    0.63,
    progress
  );

  float takeoverC = smoothstep(
    0.58,
    0.82,
    progress
  );

  float rupture = smoothstep(
    0.72,
    0.96,
    progress
  );

  float thermalLoad = saturate(
    0.18 * progress
    + 0.42 * rms
    + 0.22 * bass
  );

  vec3 heatColour = heatPalette(
    spectralCentroid,
    treble,
    thermalLoad
  );

  // -------------------------------------------------------------------
  // APPARATUS GEOMETRY ZONE — MACHINERY REBUILD / NOT LOCKED YET
  //
  // Macro layout, subsystem topology and engineered pressure routes live here.
  // Audio may illuminate them but must never move the macro architecture.
  // -------------------------------------------------------------------

  // Deep machine-room foundation: broad steel masses, not a tiled wall.
  float foundationGrain = hash12(
    floor(
      (p + vec2(12.7, 5.1))
      * 160.0
    )
  );

  vec3 col = vec3(
    0.007,
    0.009,
    0.012
  );

  col +=
    vec3(
      0.010,
      0.012,
      0.015
    )
    * foundationGrain;

  float broadWash =
    0.5
    + 0.5
      * sin(
        p.x * 2.1
        - p.y * 1.4
        + 0.6
      );

  col +=
    vec3(
      0.009,
      0.011,
      0.014
    )
    * broadWash;

  // Sparse enclosure seams establish scale without becoming the subject.
  float seamA = aaLine(
    sdSegment(
      p,
      vec2(
        -aspect * 0.94,
        0.405
      ),
      vec2(
        aspect * 0.23,
        0.405
      )
    ),
    0.0024
  );

  float seamB = aaLine(
    sdSegment(
      p,
      vec2(
        -aspect * 0.76,
        -0.185
      ),
      vec2(
        aspect * 0.84,
        -0.185
      )
    ),
    0.0022
  );

  float seamC = aaLine(
    sdSegment(
      p,
      vec2(
        -aspect * 0.18,
        -0.465
      ),
      vec2(
        aspect * 0.82,
        -0.465
      )
    ),
    0.0020
  );

  float seamD = aaLine(
    sdSegment(
      p,
      vec2(
        -aspect * 0.72,
        -0.50
      ),
      vec2(
        -aspect * 0.72,
        0.46
      )
    ),
    0.0022
  );

  float seamE = aaLine(
    sdSegment(
      p,
      vec2(
        aspect * 0.76,
        -0.42
      ),
      vec2(
        aspect * 0.76,
        0.50
      )
    ),
    0.0022
  );

  float enclosureSeams = max(
    max(seamA, seamB),
    max(
      seamC,
      max(seamD, seamE)
    )
  );

  col +=
    vec3(
      0.075,
      0.086,
      0.100
    )
    * enclosureSeams
    * 0.34;

  // Irregular load-bearing service gantry.
  float gantryTopDist = sdSegment(
    p,
    vec2(
      -aspect * 0.82,
      0.455
    ),
    vec2(
      aspect * 0.68,
      0.455
    )
  );

  float gantryMidDist = sdSegment(
    p,
    vec2(
      -aspect * 0.06,
      0.455
    ),
    vec2(
      -aspect * 0.06,
      -0.46
    )
  );

  float gantryDiagDist = sdSegment(
    p,
    vec2(
      aspect * 0.10,
      0.455
    ),
    vec2(
      aspect * 0.30,
      0.18
    )
  );

  float gantryTop = aaLine(
    gantryTopDist,
    0.030
  );

  float gantryMid = aaLine(
    gantryMidDist,
    0.026
  );

  float gantryDiag = aaLine(
    gantryDiagDist,
    0.020
  );

  float gantry = max(
    gantryTop,
    max(
      gantryMid,
      gantryDiag
    )
  );

  col = mix(
    col,
    vec3(
      0.024,
      0.029,
      0.035
    ),
    gantry * 0.95
  );

  float gantryRim = max(
    aaLine(
      abs(
        gantryTopDist - 0.030
      ),
      0.0035
    ),
    max(
      aaLine(
        abs(
          gantryMidDist - 0.026
        ),
        0.0032
      ),
      aaLine(
        abs(
          gantryDiagDist - 0.020
        ),
        0.0028
      )
    )
  );

  col +=
    vec3(
      0.105,
      0.119,
      0.135
    )
    * gantryRim
    * (
      0.22
      + 0.10 * treble
    );

  // -------------------------------------------------------------------
  // PRIMARY PRESSURE VESSEL — left-hand macro mass.
  // -------------------------------------------------------------------

  vec2 vesselCentre = vec2(
    -aspect * 0.315,
    0.105
  );

  vec2 vesselQ =
    p - vesselCentre;

  float vesselRadius = 0.245;

  float vesselRadial =
    length(vesselQ);

  float vesselOuterDistance =
    vesselRadial
    - vesselRadius;

  float vesselShadow = aaFill(
    vesselOuterDistance
    - 0.018
  );

  col *=
    1.0
    - vesselShadow * 0.20;

  float vesselBody = aaFill(
    vesselOuterDistance
  );

  float vesselSideLight = saturate(
    0.54
    + vesselQ.x * 1.55
    - vesselQ.y * 0.58
  );

  float vesselRoughness =
    industrialNoise(
      vesselQ * 8.5
      + vec2(7.2, 13.9)
    );

  vec3 vesselMetal = mix(
    vec3(
      0.021,
      0.024,
      0.026
    ),
    vec3(
      0.067,
      0.071,
      0.073
    ),
    vesselSideLight
  );

  vesselMetal *=
    0.84
    + vesselRoughness * 0.24;

  col = mix(
    col,
    vesselMetal,
    vesselBody * 0.96
  );

  float vesselOuterRim = aaRing(
    vesselRadial,
    vesselRadius,
    0.0062
  );

  float vesselBand = aaRing(
    vesselRadial,
    0.202,
    0.010
  );

  float vesselInnerDistance =
    vesselRadial
    - 0.145;

  float vesselInner = aaFill(
    vesselInnerDistance
  );

  col = mix(
    col,
    vec3(
      0.0045,
      0.0060,
      0.0085
    ),
    vesselInner * 0.98
  );

  col +=
    vec3(
      0.075,
      0.077,
      0.076
    )
    * vesselOuterRim
    * (
      0.23
      + vesselRoughness * 0.13
    );

  col +=
    vec3(
      0.046,
      0.047,
      0.045
    )
    * vesselBand
    * (
      0.26
      + vesselRoughness * 0.14
    );

  // Mechanical flange bolts.
  float vesselBolts = 0.0;

  for (int i = 0; i < 10; i++) {
    float fi = float(i);

    float angle =
      fi / 10.0 * TWO_PI
      + 0.18;

    vec2 boltCentre =
      vec2(
        cos(angle),
        sin(angle)
      )
      * 0.220;

    float boltDistance =
      length(
        vesselQ
        - boltCentre
      );

    vesselBolts = max(
      vesselBolts,
      aaLine(
        boltDistance,
        0.010
      )
    );
  }

  col = mix(
    col,
    vec3(
      0.015,
      0.019,
      0.023
    ),
    vesselBolts * 0.82
  );

  col +=
    vec3(
      0.15,
      0.16,
      0.17
    )
    * vesselBolts
    * 0.10;

  // Slow internal impeller: autonomous machinery, never track narrative.
  vec2 rotorQ =
    rot2(
      uTime * 0.105
    )
    * vesselQ;

  float rotorBlades = 0.0;

  for (int i = 0; i < 6; i++) {
    float fi = float(i);

    float angle =
      fi / 6.0 * TWO_PI;

    vec2 direction = vec2(
      cos(angle),
      sin(angle)
    );

    float bladeDistance = sdSegment(
      rotorQ,
      direction * 0.038,
      direction * 0.119
    );

    rotorBlades = max(
      rotorBlades,
      aaLine(
        bladeDistance,
        0.012
      )
    );
  }

  float rotorClip = aaFill(
    vesselRadial
    - 0.132
  );

  rotorBlades *= rotorClip;

  col +=
    vec3(
      0.080,
      0.094,
      0.109
    )
    * rotorBlades
    * (
      0.35
      + 0.18 * mid
    );

  float rotorHub = aaFill(
    vesselRadial
    - 0.038
  );

  col = mix(
    col,
    vec3(
      0.020,
      0.025,
      0.031
    ),
    rotorHub * 0.92
  );

  col +=
    vec3(
      0.130,
      0.146,
      0.163
    )
    * aaRing(
      vesselRadial,
      0.038,
      0.004
    )
    * 0.42;

  // -------------------------------------------------------------------
  // TURBINE / VENTILATION INTAKE — upper-right subsystem.
  // -------------------------------------------------------------------

  vec2 fanCentre = vec2(
    aspect * 0.300,
    0.285
  );

  vec2 fanQ =
    p - fanCentre;

  float fanHousingDistance = sdRoundBox(
    fanQ,
    vec2(
      0.177,
      0.162
    ),
    0.032
  );

  float fanHousing = aaFill(
    fanHousingDistance
  );

  col *=
    1.0
    - aaFill(
      fanHousingDistance
      - 0.018
    )
    * 0.16;

  col = mix(
    col,
    vec3(
      0.040,
      0.048,
      0.057
    ),
    fanHousing * 0.95
  );

  float fanHousingRim = aaLine(
    abs(fanHousingDistance),
    0.0045
  );

  col +=
    vec3(
      0.118,
      0.132,
      0.148
    )
    * fanHousingRim
    * 0.38;

  float fanRadial =
    length(fanQ);

  float fanAperture = aaFill(
    fanRadial
    - 0.118
  );

  col = mix(
    col,
    vec3(
      0.0035,
      0.0050,
      0.0070
    ),
    fanAperture * 0.98
  );

  float fanRing = aaRing(
    fanRadial,
    0.122,
    0.0060
  );

  col +=
    vec3(
      0.091,
      0.107,
      0.124
    )
    * fanRing
    * 0.56;

  vec2 fanRotorQ =
    rot2(
      -uTime * 0.155
    )
    * fanQ;

  float fanBlades = 0.0;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);

    float angle =
      fi / 5.0 * TWO_PI
      + 0.38;

    vec2 direction = vec2(
      cos(angle),
      sin(angle)
    );

    vec2 tangent = vec2(
      -direction.y,
      direction.x
    );

    vec2 bladeA =
      direction * 0.026
      + tangent * 0.010;

    vec2 bladeB =
      direction * 0.096
      + tangent * 0.030;

    float bladeDistance = sdSegment(
      fanRotorQ,
      bladeA,
      bladeB
    );

    fanBlades = max(
      fanBlades,
      aaLine(
        bladeDistance,
        0.014
      )
    );
  }

  fanBlades *= fanAperture;

  col +=
    vec3(
      0.095,
      0.112,
      0.130
    )
    * fanBlades
    * (
      0.34
      + mid * 0.18
      + treble * 0.10
    );

  float fanHub = aaFill(
    fanRadial
    - 0.024
  );

  col = mix(
    col,
    vec3(
      0.018,
      0.023,
      0.029
    ),
    fanHub * 0.96
  );

  // Fixed dirty protection grille in front of the rotor.
  float fanGrille = 0.0;

  for (int i = 0; i < 5; i++) {
    float fi = float(i);

    float grilleY =
      -0.080
      + fi * 0.040;

    float grilleDistance = sdSegment(
      fanQ,
      vec2(-0.105, grilleY),
      vec2(0.105, grilleY)
    );

    fanGrille = max(
      fanGrille,
      aaLine(
        grilleDistance,
        0.0032
      )
    );
  }

  fanGrille *= fanAperture;

  col = mix(
    col,
    vec3(
      0.014,
      0.016,
      0.017
    ),
    fanGrille * 0.88
  );

  col +=
    vec3(
      0.055,
      0.057,
      0.056
    )
    * fanGrille
    * 0.12;

  // -------------------------------------------------------------------
  // ACTUATOR BANK — lower-right piston machinery.
  // -------------------------------------------------------------------

  vec2 actuatorCentre = vec2(
    aspect * 0.315,
    -0.085
  );

  vec2 actuatorQ =
    p - actuatorCentre;

  float actuatorHousingDistance = sdRoundBox(
    actuatorQ,
    vec2(
      0.245,
      0.175
    ),
    0.028
  );

  float actuatorHousing = aaFill(
    actuatorHousingDistance
  );

  col *=
    1.0
    - aaFill(
      actuatorHousingDistance
      - 0.018
    )
    * 0.18;

  col = mix(
    col,
    vec3(
      0.034,
      0.041,
      0.049
    ),
    actuatorHousing * 0.96
  );

  float actuatorRim = aaLine(
    abs(actuatorHousingDistance),
    0.0045
  );

  col +=
    vec3(
      0.112,
      0.127,
      0.143
    )
    * actuatorRim
    * 0.42;

  float actuatorCavityDistance = sdRoundBox(
    actuatorQ,
    vec2(
      0.206,
      0.134
    ),
    0.018
  );

  float actuatorCavity = aaFill(
    actuatorCavityDistance
  );

  col = mix(
    col,
    vec3(
      0.0042,
      0.0055,
      0.0075
    ),
    actuatorCavity * 0.92
  );

  float actuatorMetal = 0.0;
  float actuatorRod = 0.0;
  float actuatorPressure = 0.0;
  float actuatorIndicator = 0.0;

  for (int i = 0; i < 3; i++) {
    float fi = float(i);

    float localX =
      -0.132
      + fi * 0.132;

    float pistonTravel =
      sin(
        uTime
        * (
          0.52
          + 0.08 * fi
        )
        + fi * 1.73
      )
      * 0.022;

    vec2 boreCentre = vec2(
      localX,
      0.015
    );

    float boreDistance = sdRoundBox(
      actuatorQ - boreCentre,
      vec2(
        0.046,
        0.100
      ),
      0.022
    );

    float bore = aaFill(
      boreDistance
    );

    actuatorMetal = max(
      actuatorMetal,
      aaLine(
        abs(boreDistance),
        0.0042
      )
    );

    float rodDistance = sdSegment(
      actuatorQ,
      vec2(
        localX,
        -0.102
      ),
      vec2(
        localX,
        0.070
        + pistonTravel
      )
    );

    actuatorRod = max(
      actuatorRod,
      aaLine(
        rodDistance,
        0.0105
      )
      * bore
    );

    float pistonHeadDistance = sdRoundBox(
      actuatorQ
      - vec2(
        localX,
        0.071
        + pistonTravel
      ),
      vec2(
        0.038,
        0.020
      ),
      0.007
    );

    actuatorMetal = max(
      actuatorMetal,
      aaFill(
        pistonHeadDistance
      )
    );

    float pressureDistance = sdSegment(
      actuatorQ,
      vec2(
        localX,
        -0.088
      ),
      vec2(
        localX,
        0.045
        + pistonTravel
      )
    );

    float pistonActivation = saturate(
      takeoverB
      - fi * 0.14
      + mid * 0.07
    );

    actuatorPressure = max(
      actuatorPressure,
      aaLine(
        pressureDistance,
        0.0055
      )
      * bore
      * pistonActivation
    );

    vec2 indicatorCentre = vec2(
      localX,
      -0.125
    );

    float indicatorDistance =
      length(
        actuatorQ
        - indicatorCentre
      );

    actuatorIndicator = max(
      actuatorIndicator,
      aaLine(
        indicatorDistance,
        0.0075
      )
      * (
        0.35
        + 0.65
          * pow(
            0.5
            + 0.5
              * sin(
                uTime
                * (
                  1.2
                  + fi * 0.17
                )
                + fi * 2.4
              ),
            6.0
          )
      )
    );
  }

  col +=
    vec3(
      0.096,
      0.111,
      0.128
    )
    * actuatorMetal
    * 0.54;

  col +=
    vec3(
      0.130,
      0.145,
      0.160
    )
    * actuatorRod
    * (
      0.40
      + mid * 0.16
    );

  // -------------------------------------------------------------------
  // LOWER MANIFOLD — engineered distribution plumbing with valve bodies.
  // -------------------------------------------------------------------

  float manifoldY = -0.355;

  float manifoldMainDistance = sdSegment(
    p,
    vec2(
      -aspect * 0.72,
      manifoldY
    ),
    vec2(
      aspect * 0.66,
      manifoldY
    )
  );

  float manifoldOuter = aaLine(
    manifoldMainDistance,
    0.032
  );

  col = mix(
    col,
    vec3(
      0.025,
      0.031,
      0.038
    ),
    manifoldOuter * 0.94
  );

  float manifoldRim = aaLine(
    abs(
      manifoldMainDistance
      - 0.032
    ),
    0.0035
  );

  col +=
    vec3(
      0.105,
      0.121,
      0.138
    )
    * manifoldRim
    * 0.42;

  vec2 valveACentre = vec2(
    -aspect * 0.38,
    manifoldY
  );

  vec2 valveBCentre = vec2(
    aspect * 0.02,
    manifoldY
  );

  vec2 valveCCentre = vec2(
    aspect * 0.42,
    manifoldY
  );

  float valveA = aaFill(
    length(
      p - valveACentre
    )
    - 0.049
  );

  float valveB = aaFill(
    length(
      p - valveBCentre
    )
    - 0.049
  );

  float valveC = aaFill(
    length(
      p - valveCCentre
    )
    - 0.049
  );

  float valves = max(
    valveA,
    max(
      valveB,
      valveC
    )
  );

  col = mix(
    col,
    vec3(
      0.020,
      0.025,
      0.031
    ),
    valves * 0.96
  );

  float valveRings = max(
    aaRing(
      length(
        p - valveACentre
      ),
      0.049,
      0.0045
    ),
    max(
      aaRing(
        length(
          p - valveBCentre
        ),
        0.049,
        0.0045
      ),
      aaRing(
        length(
          p - valveCCentre
        ),
        0.049,
        0.0045
      )
    )
  );

  col +=
    vec3(
      0.125,
      0.141,
      0.158
    )
    * valveRings
    * 0.46;

  // Valve handles move autonomously and locally.
  vec2 handleAQ =
    rot2(
      uTime * 0.065
    )
    * (
      p - valveACentre
    );

  vec2 handleBQ =
    rot2(
      -uTime * 0.052
      + 0.8
    )
    * (
      p - valveBCentre
    );

  vec2 handleCQ =
    rot2(
      uTime * 0.044
      + 1.6
    )
    * (
      p - valveCCentre
    );

  float valveHandles = max(
    aaLine(
      sdSegment(
        handleAQ,
        vec2(-0.030, 0.0),
        vec2(0.030, 0.0)
      ),
      0.0045
    ),
    max(
      aaLine(
        sdSegment(
          handleBQ,
          vec2(-0.030, 0.0),
          vec2(0.030, 0.0)
        ),
        0.0045
      ),
      aaLine(
        sdSegment(
          handleCQ,
          vec2(-0.030, 0.0),
          vec2(0.030, 0.0)
        ),
        0.0045
      )
    )
  );

  col +=
    vec3(
      0.142,
      0.156,
      0.171
    )
    * valveHandles
    * 0.52;

  // -------------------------------------------------------------------
  // ENGINEERED PRESSURE NETWORK
  //
  // Dark housings always exist. BREACH progressively commandeers the system.
  // -------------------------------------------------------------------

  vec2 spineA = vec2(
    aspect * 0.005,
    0.535
  );

  vec2 spineB = vec2(
    aspect * 0.005,
    0.130
  );

  vec2 spineC = vec2(
    aspect * 0.072,
    0.080
  );

  vec2 spineD = vec2(
    aspect * 0.072,
    manifoldY
  );

  float spineDistance = min(
    sdSegment(
      p,
      spineA,
      spineB
    ),
    min(
      sdSegment(
        p,
        spineB,
        spineC
      ),
      sdSegment(
        p,
        spineC,
        spineD
      )
    )
  );

  vec2 vesselFeedEnd =
    vesselCentre
    + vec2(
      vesselRadius - 0.012,
      0.0
    );

  float vesselFeedDistance = sdSegment(
    p,
    vec2(
      spineB.x,
      vesselCentre.y
    ),
    vesselFeedEnd
  );

  vec2 fanFeedStart = vec2(
    spineA.x,
    fanCentre.y
  );

  vec2 fanFeedEnd =
    fanCentre
    + vec2(
      -0.177,
      0.0
    );

  float fanFeedDistance = sdSegment(
    p,
    fanFeedStart,
    fanFeedEnd
  );

  vec2 actuatorFeedStart = vec2(
    spineC.x,
    actuatorCentre.y
  );

  vec2 actuatorFeedEnd =
    actuatorCentre
    + vec2(
      -0.245,
      0.0
    );

  float actuatorFeedDistance = sdSegment(
    p,
    actuatorFeedStart,
    actuatorFeedEnd
  );

  float spineHousing = aaLine(
    spineDistance,
    0.038
  );

  float vesselFeedHousing = aaLine(
    vesselFeedDistance,
    0.028
  );

  float fanFeedHousing = aaLine(
    fanFeedDistance,
    0.026
  );

  float actuatorFeedHousing = aaLine(
    actuatorFeedDistance,
    0.026
  );

  float pressureHousing = max(
    spineHousing,
    max(
      vesselFeedHousing,
      max(
        fanFeedHousing,
        actuatorFeedHousing
      )
    )
  );

  col = mix(
    col,
    vec3(
      0.016,
      0.021,
      0.027
    ),
    pressureHousing * 0.96
  );

  float pressureHousingRim = max(
    aaLine(
      abs(
        spineDistance
        - 0.038
      ),
      0.0033
    ),
    max(
      aaLine(
        abs(
          vesselFeedDistance
          - 0.028
        ),
        0.0030
      ),
      max(
        aaLine(
          abs(
            fanFeedDistance
            - 0.026
          ),
          0.0028
        ),
        aaLine(
          abs(
            actuatorFeedDistance
            - 0.026
          ),
          0.0028
        )
      )
    )
  );

  col +=
    vec3(
      0.095,
      0.111,
      0.128
    )
    * pressureHousingRim
    * 0.48;

  // Fixed junction housings explain every route change.
  float junctionMain = aaFill(
    length(
      p - spineB
    )
    - 0.047
  );

  float junctionLower = aaFill(
    length(
      p - spineC
    )
    - 0.043
  );

  float junctionFan = aaFill(
    length(
      p - fanFeedStart
    )
    - 0.039
  );

  float junctionActuator = aaFill(
    length(
      p - actuatorFeedStart
    )
    - 0.039
  );

  float networkJunctions = max(
    junctionMain,
    max(
      junctionLower,
      max(
        junctionFan,
        junctionActuator
      )
    )
  );

  col = mix(
    col,
    vec3(
      0.011,
      0.015,
      0.020
    ),
    networkJunctions * 0.95
  );

  float networkJunctionRims = max(
    aaRing(
      length(
        p - spineB
      ),
      0.047,
      0.0045
    ),
    max(
      aaRing(
        length(
          p - spineC
        ),
        0.043,
        0.0042
      ),
      max(
        aaRing(
          length(
            p - fanFeedStart
          ),
          0.039,
          0.0040
        ),
        aaRing(
          length(
            p - actuatorFeedStart
          ),
          0.039,
          0.0040
        )
      )
    )
  );

  col +=
    vec3(
      0.125,
      0.142,
      0.160
    )
    * networkJunctionRims
    * 0.46;

  // Late physical fracture in the pressure-vessel casing.
  vec2 vesselFractureA0 =
    vesselCentre
    + vec2(
      -0.090,
      0.194
    );

  vec2 vesselFractureA1 =
    vesselCentre
    + vec2(
      -0.132,
      0.229
    );

  vec2 vesselFractureA2 =
    vesselCentre
    + vec2(
      -0.174,
      0.211
    );

  float vesselFractureDistance = min(
    sdSegment(
      p,
      vesselFractureA0,
      vesselFractureA1
    ),
    sdSegment(
      p,
      vesselFractureA1,
      vesselFractureA2
    )
  );

  float vesselFracture = aaLine(
    vesselFractureDistance,
    0.0055
  ) * rupture;

  // -------------------------------------------------------------------
  // END APPARATUS GEOMETRY ZONE
  // -------------------------------------------------------------------

  // -------------------------------------------------------------------
  // AUTONOMOUS MATERIAL / MACHINERY ACTIVITY
  // -------------------------------------------------------------------

  // Cool inspection flow gives dormant conduits life before BREACH reaches them.
  float coolantPhase = fract(
    uTime * 0.050
  );

  float coolantBand =
    1.0
    - smoothstep(
      0.020,
      0.095,
      abs(
        fract(
          p.y * 1.55
          - coolantPhase
        )
        - 0.5
      )
    );

  col +=
    vec3(
      0.025,
      0.050,
      0.066
    )
    * spineHousing
    * coolantBand
    * (
      0.10
      + 0.12 * mid
    );

  // Actuator relays belong to the mid band.
  col +=
    vec3(
      0.090,
      0.020,
      0.006
    )
    * actuatorIndicator
    * (
      0.11
      + 0.34 * mid
    );

  // -------------------------------------------------------------------
  // BREACH — deterministic whole-track commandeering.
  // -------------------------------------------------------------------

  float frontY = mix(
    0.535,
    -0.405,
    pow(
      smoothstep(
        0.02,
        0.96,
        progress
      ),
      0.86
    )
  );

  float spineReveal = smoothstep(
    frontY - 0.050,
    frontY + 0.055,
    p.y
  );

  float spineCore = aaLine(
    spineDistance,
    0.0095
    + 0.0040 * bass
  ) * spineReveal;

  float spineHalo = aaLine(
    spineDistance,
    0.032
    + 0.012 * rms
  ) * spineReveal;

  float vesselFeedCore = aaLine(
    vesselFeedDistance,
    0.0078
    + 0.0030 * bass
  ) * takeoverA;

  float vesselFeedHalo = aaLine(
    vesselFeedDistance,
    0.023
    + 0.008 * rms
  ) * takeoverA;

  float fanFeedCore = aaLine(
    fanFeedDistance,
    0.0068
    + 0.0025 * bass
  ) * takeoverB;

  float fanFeedHalo = aaLine(
    fanFeedDistance,
    0.020
    + 0.007 * rms
  ) * takeoverB;

  float actuatorFeedCore = aaLine(
    actuatorFeedDistance,
    0.0068
    + 0.0025 * bass
  ) * takeoverB;

  float actuatorFeedHalo = aaLine(
    actuatorFeedDistance,
    0.020
    + 0.007 * rms
  ) * takeoverB;

  float manifoldCore = aaLine(
    manifoldMainDistance,
    0.0075
    + 0.0032 * bass
  ) * takeoverC;

  float manifoldHalo = aaLine(
    manifoldMainDistance,
    0.023
    + 0.009 * rms
  ) * takeoverC;

  float spineWindow =
    0.10
    + 0.90
      * inspectionWindow(
        p.y * 8.3
        + 0.18
      );

  float vesselWindow =
    0.10
    + 0.90
      * inspectionWindow(
        p.x * 7.1
        + 0.43
      );

  float fanWindow =
    0.10
    + 0.90
      * inspectionWindow(
        p.x * 8.0
        + 0.71
      );

  float actuatorWindow =
    0.10
    + 0.90
      * inspectionWindow(
        p.x * 8.7
        + 0.29
      );

  float manifoldWindow =
    0.10
    + 0.90
      * inspectionWindow(
        p.x * 9.3
        + 0.57
      );

  float networkHalo =
    spineHalo
      * (
        0.14
        + 0.20 * spineWindow
      )
    + vesselFeedHalo
      * (
        0.10
        + 0.18 * vesselWindow
      )
    + fanFeedHalo
      * (
        0.08
        + 0.16 * fanWindow
      )
    + actuatorFeedHalo
      * (
        0.08
        + 0.16 * actuatorWindow
      )
    + manifoldHalo
      * (
        0.10
        + 0.18 * manifoldWindow
      );

  float networkCore =
    spineCore
      * (
        0.12
        + 0.88 * spineWindow
      )
    + vesselFeedCore
      * (
        0.10
        + 0.74 * vesselWindow
      )
    + fanFeedCore
      * (
        0.08
        + 0.66 * fanWindow
      )
    + actuatorFeedCore
      * (
        0.08
        + 0.69 * actuatorWindow
      )
    + manifoldCore
      * (
        0.08
        + 0.72 * manifoldWindow
      );

  col +=
    heatColour
    * networkHalo
    * (
      0.014
      + 0.085 * rms
      + 0.075 * bass
      + 0.025 * progress
    );

  col +=
    heatColour
    * networkCore
    * (
      0.15
      + 0.31 * rms
      + 0.38 * bass
      + 0.07 * progress
    );

  // Pressure accumulates inside the existing vessel chamber.
  float vesselPressureRing = aaRing(
    vesselRadial,
    0.137,
    0.010
  );

  float vesselPressureCore = aaFill(
    vesselRadial
    - 0.115
  );

  float vesselFeedBias =
    pow(
      saturate(
        0.5
        + 0.5
          * vesselQ.x
          / max(vesselRadial, 0.0001)
      ),
      2.4
    );

  float vesselHotRing =
    vesselPressureRing
    * (
      0.12
      + 0.88 * vesselFeedBias
    );

  float vesselActivation =
    takeoverA
    * (
      0.18
      + 0.58 * bass
      + 0.28 * rms
    );

  col +=
    heatColour
    * vesselHotRing
    * vesselActivation
    * 0.34;

  col +=
    heatColour
    * vesselPressureCore
    * vesselActivation
    * (
      0.045
      + 0.055 * bass
    );

  // Pressure turns the existing impeller locally luminous.
  col +=
    heatColour
    * rotorBlades
    * takeoverA
    * (
      0.030
      + 0.12 * bass
      + 0.06 * mid
    );

  // Fan housing is commandeered later than the pressure vessel.
  float fanHeatRing = aaRing(
    fanRadial,
    0.108,
    0.008
  );

  float fanFeedBias =
    pow(
      saturate(
        0.5
        - 0.5
          * fanQ.x
          / max(fanRadial, 0.0001)
      ),
      2.2
    );

  col +=
    heatColour
    * fanHeatRing
    * (
      0.12
      + 0.88 * fanFeedBias
    )
    * takeoverB
    * (
      0.025
      + 0.10 * rms
      + 0.065 * mid
    );

  col +=
    heatColour
    * fanBlades
    * takeoverB
    * (
      0.024
      + 0.08 * mid
      + 0.06 * treble
    );

  // Actuator pressure remains inside piston bores.
  col +=
    heatColour
    * actuatorPressure
    * (
      0.13
      + 0.24 * bass
      + 0.20 * mid
      + 0.10 * rms
    );

  // Manifold is the late-track distribution system.
  float valveHeat = max(
    valveA * takeoverC,
    max(
      valveB
      * smoothstep(
        0.66,
        0.84,
        progress
      ),
      valveC
      * smoothstep(
        0.74,
        0.92,
        progress
      )
    )
  );

  col +=
    heatColour
    * valveHeat
    * (
      0.025
      + 0.10 * bass
      + 0.07 * rms
    );

  // The vessel casing finally breaks physically in the terminal chapter.
  col = mix(
    col,
    vec3(
      0.0005,
      0.0002,
      0.0001
    ),
    vesselFracture * 0.92
  );

  col +=
    heatColour
    * vesselFracture
    * (
      0.34
      + 0.45 * rms
      + 0.38 * bass
      + 0.28 * treble
    );

  // -------------------------------------------------------------------
  // LOCALISED ELECTRICAL DETAIL — treble only.
  // -------------------------------------------------------------------

  vec2 sparkGridPoint =
    p * 58.0;

  vec2 sparkCellId =
    floor(sparkGridPoint);

  vec2 sparkLocal =
    fract(sparkGridPoint)
    - 0.5;

  float sparkSeed = hash12(
    sparkCellId
    + vec2(
      91.3,
      411.7
    )
  );

  vec2 sparkOffset = vec2(
    hash12(
      sparkCellId
      + vec2(
        17.0,
        43.0
      )
    ),
    hash12(
      sparkCellId
      + vec2(
        83.0,
        29.0
      )
    )
  ) - 0.5;

  sparkOffset *= 0.44;

  float sparkPoint = aaLine(
    length(
      sparkLocal
      - sparkOffset
    ),
    0.030
  );

  float sparkClock = fract(
    sparkSeed * 7.31
    + uTime
      * (
        0.85
        + 2.8 * sparkSeed
      )
  );

  float sparkGate = step(
    mix(
      0.965,
      0.74,
      treble
    ),
    sparkClock
  );

  float activeMachineryProximity = saturate(
    networkHalo * 1.4
    + vesselFracture * 1.8
    + actuatorPressure * 1.2
  );

  float sparks =
    sparkPoint
    * step(
      0.76,
      sparkSeed
    )
    * sparkGate
    * activeMachineryProximity
    * smoothstep(
      0.22,
      0.72,
      progress
    );

  col +=
    mix(
      vec3(
        1.00,
        0.30,
        0.045
      ),
      vec3(
        0.78,
        0.90,
        1.00
      ),
      spectralCentroid
    )
    * sparks
    * (
      0.12
      + 0.90 * treble
    );

  // -------------------------------------------------------------------
  // INDUSTRIAL MATERIAL BREAKUP
  //
  // All major topology stays unchanged. These fields make the analytical
  // geometry read as old, handled, heat-stressed machinery rather than clean
  // vector artwork.
  // -------------------------------------------------------------------

  float machineryMask = saturate(
    gantry * 0.72
    + vesselBody
    + fanHousing
    + actuatorHousing
    + manifoldOuter
    + pressureHousing
    + valves
  );

  float coarseGrime =
    industrialNoise(
      p * 7.2
      + vec2(31.7, 8.4)
    );

  float fineGrime =
    industrialNoise(
      p * 23.0
      + vec2(5.1, 77.2)
    );

  float verticalOil =
    industrialNoise(
      vec2(
        p.x * 5.5,
        p.y * 18.0
      )
      + vec2(14.3, 51.8)
    );

  verticalOil =
    smoothstep(
      0.56,
      0.84,
      verticalOil
    );

  float oxidation =
    industrialNoise(
      p * 11.5
      + vec2(91.0, 17.0)
    );

  oxidation =
    smoothstep(
      0.64,
      0.89,
      oxidation
    );

  float pitSeed = hash12(
    floor(
      p * 92.0
      + vec2(18.0, 63.0)
    )
  );

  float pitting =
    step(
      0.915,
      pitSeed
    )
    * machineryMask;

  float grimeAmount =
    machineryMask
    * (
      0.055
      + coarseGrime * 0.070
      + fineGrime * 0.030
      + verticalOil * 0.050
    );

  col *=
    1.0
    - grimeAmount;

  col *=
    1.0
    - pitting * 0.16;

  col +=
    vec3(
      0.070,
      0.024,
      0.006
    )
    * oxidation
    * machineryMask
    * (
      0.035
      + 0.055 * coarseGrime
    );

  float weldedEdges = saturate(
    gantryRim
    + vesselOuterRim
    + fanHousingRim
    + actuatorRim
    + manifoldRim
    + pressureHousingRim
  );

  float weldBurn =
    industrialNoise(
      p * 18.0
      + vec2(3.8, 27.4)
    );

  col +=
    vec3(
      0.080,
      0.026,
      0.006
    )
    * weldedEdges
    * (
      0.015
      + weldBurn * 0.035
    );

  // Late soot rises from the terminal vessel fracture. It is material fallout,
  // not a new topology or global particle system.
  vec2 sootQ =
    p
    - (
      vesselCentre
      + vec2(-0.135, 0.245)
    );

  float sootEnvelope =
    exp(
      -(
        sootQ.x * sootQ.x * 34.0
        + sootQ.y * sootQ.y * 8.0
      )
    );

  float sootTexture =
    industrialNoise(
      sootQ * 7.0
      + vec2(
        2.4,
        -uTime * 0.055
      )
    );

  float soot =
    sootEnvelope
    * smoothstep(
      0.48,
      0.78,
      sootTexture
    )
    * rupture;

  col = mix(
    col,
    vec3(
      0.006,
      0.005,
      0.004
    ),
    soot * 0.34
  );

  // Preserve real negative space around the assemblies.
  vec2 vignettePoint = vec2(
    p.x / max(aspect, 0.001),
    p.y
  );

  float vignette =
    1.0
    - smoothstep(
      0.43,
      0.82,
      length(vignettePoint)
    );

  col *=
    0.77
    + 0.23 * vignette;

  // Overall energy remains a very small final overdrive.
  col *=
    0.994
    + 0.026 * energy;

  // Compact photographic shoulder without another full-screen pass.
  col =
    1.0
    - exp(
      -col * 1.10
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

export function createApparatusTheme(): Theme {
  return createSinglePassTheme({
    name: "apparatus",
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
      {
        name: "uViewYSign",
        getValue: (opts) => opts.mode === "offline" ? -1 : 1,
      },
    ],
  });
}
