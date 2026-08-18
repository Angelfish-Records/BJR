// web/app/home/player/visualizer/themes/crystallineGrowth.ts
// Crystalline Growth
// A travelling dendritic front whose wake progressively encrusts into an
// interlocking, fractured mineral field across the life of the recording.
import type { Theme } from "../types";
import { createPingPongTheme } from "./themeFactory";

const SIM_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uFrame;

const vec2 TRACK = vec2(0.70710678, 0.70710678);
const vec2 TRACK_N = vec2(-0.70710678, 0.70710678);

const float CAMERA_SPEED = 0.170;
const float CAMERA_BACK = 0.340;
const float CAMERA_SCALE = 1.55;

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

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    amplitude *= 0.52;
  }

  return value;
}

float trackOffset(float s) {
  return
    0.220 * sin(s * 0.63 + 0.30) +
    0.105 * sin(s * 1.57 + 1.10) +
    0.050 * sin(s * 3.80 - 0.60);
}

vec2 trackPosition(float s) {
  return TRACK * s + TRACK_N * trackOffset(s);
}

vec2 trackTangent(float s) {
  const float epsilon = 0.002;
  return normalize(trackPosition(s + epsilon) - trackPosition(s - epsilon));
}

/*
 * The camera follows the filament's position but remains nearly upright.
 * That preserves the diagonal traversal through the frame rather than
 * rotating the filament into a static vertical conveyor belt.
 */
vec2 cameraForward(float s) {
  vec2 upright = vec2(0.0, 1.0);
  return normalize(mix(upright, trackTangent(s), 0.14));
}

vec2 screenToWorld(vec2 uv, float cameraS) {
  float minRes = min(uRes.x, uRes.y);
  vec2 screen = (uv * uRes - 0.5 * uRes) / minRes;

  // Screen-space orientation: the dendritic front should climb diagonally
  // upward through the frame. Keep world TRACK unchanged and mirror only the
  // camera-forward screen axis so simulation and display share the same view.
  screen.y = -screen.y;

  vec2 forward = cameraForward(cameraS);
  vec2 right = vec2(forward.y, -forward.x);
  vec2 center = trackPosition(cameraS - CAMERA_BACK);

  return center
    + right * screen.x * CAMERA_SCALE
    + forward * screen.y * CAMERA_SCALE;
}

vec2 worldToScreenUv(vec2 world, float cameraS) {
  float minRes = min(uRes.x, uRes.y);

  vec2 forward = cameraForward(cameraS);
  vec2 right = vec2(forward.y, -forward.x);
  vec2 center = trackPosition(cameraS - CAMERA_BACK);

  vec2 local = vec2(
    dot(world - center, right),
    -dot(world - center, forward)
  ) / CAMERA_SCALE;

  return 0.5 + local * minRes / uRes;
}

vec2 trackCoordinates(vec2 world) {
  float s = dot(world, TRACK);
  float lateral = dot(world, TRACK_N) - trackOffset(s);

  return vec2(lateral, s);
}

float lineSegment(
  vec2 point,
  vec2 origin,
  vec2 direction,
  float length,
  float width
) {
  vec2 q = point - origin;

  float along = dot(q, direction);
  float across = abs(q.x * direction.y - q.y * direction.x);

  float startCap = smoothstep(0.0, width * 2.0, along);
  float endCap = 1.0 - smoothstep(length, length + width * 3.0, along);

  float line = exp(-(across * across) / max(width * width, 0.000001));

  return line * startCap * endCap;
}

float crystalTendril(
  vec2 point,
  vec2 origin,
  vec2 direction,
  float length,
  float baseWidth,
  float tipWidth
) {
  vec2 q = point - origin;

  float along = dot(q, direction);
  float clampedAlong = clamp(along, 0.0, length);
  float across = abs(q.x * direction.y - q.y * direction.x);

  float taper = mix(
    baseWidth,
    tipWidth,
    clampedAlong / max(length, 0.0001)
  );

  float body = exp(-(across * across) / max(taper * taper, 0.000001));

  float startCap = smoothstep(0.0, baseWidth * 1.6, along);
  float endCap = 1.0 - smoothstep(
    length,
    length + tipWidth * 5.0 + 0.01,
    along
  );

  float innerRidge = exp(
    -(across * across) / max((taper * 0.34) * (taper * 0.34), 0.000001)
  ) * 0.35;

  return (body + innerRidge) * startCap * endCap;
}

/*
 * x = lateral distance from the living filament
 * y = longitudinal world-space coordinate along the path
 *
 * r: crystallisation seed
 * g: internal facet intensity
 * b: active electrical/front charge
 * a: branch presence
 */
vec4 crystallineFront(
  vec2 world,
  float headS,
  float encrust,
  float lateCrystal
) {
  vec2 local = trackCoordinates(world);

  float lateral = local.x;
  float longitudinal = local.y;
  float headOffset = longitudinal - headS;

  float wander =
    0.016 * sin(longitudinal * 13.0 + 0.80) +
    0.010 * sin(longitudinal * 27.0 - 1.40);

  // Whole-track ENCRUST controls morphological reach and mineral maturity.
  // Momentary audio no longer widens or repositions the dendritic structure.
  float spineWidth =
    0.014 +
    0.004 * encrust;

  float spineDelta = (lateral - wander) / spineWidth;
  float spine = exp(-spineDelta * spineDelta);

  float headWidth =
    0.165 +
    0.035 * encrust;

  float headDelta = headOffset / headWidth;
  float activeCore = spine * exp(-headDelta * headDelta);

  float branchMass = 0.0;
  float branchCharge = 0.0;
  float crystalMass = 0.0;
  float crystalFacet = 0.0;

  float baseCell = floor(headS * 1.35);

  for (int i = -5; i <= 3; i++) {
    float cell = baseCell + float(i);

    float nodeRandom = hash(vec2(cell, 3.91));
    float sideRandom = hash(vec2(cell, 8.73));
    float lengthRandom = hash(vec2(cell, 14.27));
    float forkRandom = hash(vec2(cell, 22.61));
    float spreadRandom = hash(vec2(cell, 31.43));
    float offshootRandom = hash(vec2(cell, 47.89));
    float attachRandom = hash(vec2(cell, 61.27));
    float turnRandom = hash(vec2(cell, 79.11));

    float nodeS = (cell + 0.16 + 0.64 * nodeRandom) / 1.35;
    float branchAge = headS - nodeS;

    float born = smoothstep(-0.060, 0.160, branchAge);

    float development = smoothstep(
      0.000,
      mix(0.440, 0.300, encrust),
      branchAge
    );

    float crystallise = smoothstep(
      0.050,
      mix(0.820, 0.560, encrust),
      branchAge
    );

    float side = sideRandom < 0.5 ? -1.0 : 1.0;

    float reach =
      0.80 +
      0.42 * encrust +
      0.16 * lateCrystal;

    float lengthA =
      (0.145 + 0.190 * lengthRandom) *
      development *
      reach;

    float lengthB =
      (0.090 + 0.165 * forkRandom) *
      development *
      reach *
      (0.90 + 0.16 * lateCrystal);

    // Real crystal growth should not look like one canonical glyph stamped
    // repeatedly along the spine. Each deterministic node receives its own
    // lateral lean, rise, fork side and attachment point.
    vec2 origin = vec2(
      (spreadRandom - 0.5) *
        0.020 *
        encrust,
      nodeS
    );

    float leanA =
      0.30 +
      0.48 * lengthRandom +
      0.18 * spreadRandom +
      0.12 * encrust;

    float riseA =
      0.68 +
      0.25 * nodeRandom -
      0.06 * lateCrystal;

    vec2 directionA = normalize(vec2(
      side * leanA,
      riseA
    ));

    float forkSide =
      forkRandom < 0.42
        ? side
        : -side;

    float leanB =
      0.24 +
      0.52 * forkRandom +
      0.16 * turnRandom +
      0.10 * lateCrystal;

    float riseB =
      0.56 +
      0.34 * spreadRandom -
      0.04 * encrust;

    vec2 directionB = normalize(vec2(
      forkSide * leanB,
      riseB
    ));

    float forkAttach =
      0.24 +
      0.50 * attachRandom;

    vec2 originB =
      origin +
      directionA *
        lengthA *
        forkAttach;

    // ENCRUST adds a genuinely new offshoot on only a subset of nodes. The
    // branch is deterministic for a given cell but irregular across the field,
    // so late growth ramifies instead of merely thickening the same silhouette.
    float offshootDevelopment =
      development *
      smoothstep(
        0.20,
        0.78,
        encrust
      ) *
      step(
        0.30,
        offshootRandom
      );

    float offshootSide =
      turnRandom < 0.5
        ? -1.0
        : 1.0;

    float lengthC =
      (
        0.070 +
        0.160 * turnRandom
      ) *
      offshootDevelopment *
      (
        0.72 +
        0.44 * lateCrystal
      );

    vec2 directionC = normalize(vec2(
      offshootSide * (
        0.38 +
        0.58 * offshootRandom
      ),
      0.38 +
        0.50 * nodeRandom
    ));

    vec2 originC =
      mix(
        origin +
          directionA *
          lengthA *
          (
            0.32 +
            0.42 * turnRandom
          ),
        originB +
          directionB *
          lengthB *
          (
            0.18 +
            0.46 * nodeRandom
          ),
        step(
          0.56,
          attachRandom
        )
      );

    float widthA =
      0.009 +
      0.004 * encrust;

    float widthB =
      0.007 +
      0.0035 * encrust;

    float widthC =
      0.0055 +
      0.0025 * lateCrystal;

    float branchA = lineSegment(
      local,
      origin,
      directionA,
      lengthA,
      widthA
    );

    float branchB = lineSegment(
      local,
      originB,
      directionB,
      lengthB,
      widthB
    );

    float branchC = lineSegment(
      local,
      originC,
      directionC,
      lengthC,
      widthC
    );

    float branch =
      max(
        branchA,
        max(
          branchB,
          branchC
        )
      ) *
      born;

    float shardLengthA =
      lengthA *
      (
        0.64 +
        0.92 * crystallise +
        0.22 * lateCrystal
      );

    float shardLengthB =
      lengthB *
      (
        0.50 +
        0.86 * crystallise +
        0.20 * lateCrystal
      );

    float tendrilA = crystalTendril(
      local,
      origin,
      directionA,
      shardLengthA,
      0.027 +
        0.014 * lengthRandom +
        0.010 * encrust,
      0.0045 +
        0.0025 * lateCrystal
    );

    float tendrilB = crystalTendril(
      local,
      originB,
      directionB,
      shardLengthB,
      0.022 +
        0.012 * forkRandom +
        0.009 * encrust,
      0.0040 +
        0.0022 * lateCrystal
    );

    float shardLengthC =
      lengthC *
      (
        0.72 +
        0.70 * crystallise +
        0.24 * lateCrystal
      );

    float tendrilC = crystalTendril(
      local,
      originC,
      directionC,
      shardLengthC,
      0.015 +
        0.010 * offshootRandom +
        0.006 * lateCrystal,
      0.0032 +
        0.0018 * turnRandom
    );

    float nodeBody = crystalTendril(
      local,
      origin - vec2(0.0, 0.012),
      normalize(vec2(side * 0.10, 1.0)),
      (
        0.070 +
        0.050 * lengthRandom
      ) * (
        0.90 +
        0.28 * encrust
      ),
      0.033 +
        0.010 * lengthRandom +
        0.008 * encrust,
      0.014 +
        0.003 * lateCrystal
    );

    float crystal =
      max(
        max(
          tendrilA,
          tendrilB
        ),
        max(
          tendrilC,
          nodeBody
        )
      ) *
      crystallise;

    float chargeAge = (branchAge - 0.105) / 0.220;
    float freshCharge = exp(-chargeAge * chargeAge);

    branchMass = max(branchMass, branch);
    branchCharge = max(branchCharge, branch * freshCharge);
    crystalMass = max(crystalMass, crystal);

    float facetNoise = noise(
      local * 12.0 + vec2(cell * 0.37, cell * -0.19)
    );

    float localFacet = crystal * smoothstep(
      0.32,
      0.86,
      facetNoise +
        0.22 * development +
        0.10 * lateCrystal
    );

    crystalFacet = max(crystalFacet, localFacet);
  }

  float mineral = fbm(
    world * 5.30 +
    vec2(1.70, -2.10)
  );

  float fracture = fbm(
    world * 11.20 +
    vec2(-3.20, 0.90)
  );

  float facetMask = smoothstep(
    0.31,
    0.86,
    mineral + 0.08 * encrust
  );

  float shardMask = smoothstep(
    0.46,
    0.90,
    fracture +
      crystalMass * 0.24 +
      lateCrystal * 0.10
  );

  float seed = max(
    activeCore,
    max(
      branchMass * 0.80,
      crystalMass * (
        0.68 +
        0.10 * encrust
      )
    )
  );

  float facets = max(
    max(activeCore, branchMass) * facetMask,
    max(
      crystalFacet,
      crystalMass * (
        0.40 +
        0.60 * shardMask
      )
    )
  );

  float charge = max(
    activeCore * 1.12,
    branchCharge
  );

  float mass = max(
    branchMass,
    crystalMass * (
      0.92 +
      0.08 * encrust
    )
  );

  return vec4(
    seed,
    facets,
    charge,
    mass
  );
}

float insideUv(vec2 uv) {
  return
    step(0.0, uv.x) *
    step(0.0, uv.y) *
    step(uv.x, 1.0) *
    step(uv.y, 1.0);
}

vec4 stateAt(vec2 uv) {
  float valid = insideUv(uv);
  return texture(uPrev, clamp(uv, 0.001, 0.999)) * valid;
}

void main() {
  vec2 texel = 1.0 / max(uRes, vec2(1.0));

  float energy = clamp(uEnergy, 0.0, 1.0);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);

  // Long-form verb: ENCRUST.
  //
  // The travelling front and camera remain autonomous scene motion. Playback
  // position owns how far the same dendritic organism has mineralised outward:
  // narrow living branches -> interlocking shards -> fractured crystalline wake.
  float journey =
    trackProgress *
    trackProgress *
    (3.0 - 2.0 * trackProgress);

  float encrust = smoothstep(
    0.06,
    0.90,
    journey
  );

  float lateCrystal = smoothstep(
    0.52,
    0.98,
    journey
  );

  float cameraS = uTime * CAMERA_SPEED;
  float previousCameraS =
    max(0.0, uTime - 0.016667) *
    CAMERA_SPEED;

  vec2 world = screenToWorld(vUv, cameraS);
  vec2 previousUv = worldToScreenUv(
    world,
    previousCameraS
  );

  vec4 previous = stateAt(previousUv);

  float neighbour = 0.0;
  neighbour += stateAt(previousUv + vec2( texel.x, 0.0)).r;
  neighbour += stateAt(previousUv + vec2(-texel.x, 0.0)).r;
  neighbour += stateAt(previousUv + vec2(0.0,  texel.y)).r;
  neighbour += stateAt(previousUv + vec2(0.0, -texel.y)).r;
  neighbour += stateAt(previousUv + vec2( texel.x,  texel.y)).r;
  neighbour += stateAt(previousUv + vec2(-texel.x,  texel.y)).r;
  neighbour += stateAt(previousUv + vec2( texel.x, -texel.y)).r;
  neighbour += stateAt(previousUv + vec2(-texel.x, -texel.y)).r;
  neighbour *= 0.125;

  vec4 source = crystallineFront(
    world,
    cameraS,
    encrust,
    lateCrystal
  );

  float mineral = fbm(
    world * 4.00 +
    vec2(-1.80, 2.40)
  );

  float mineralGate = smoothstep(
    0.30,
    0.84,
    mineral +
      source.a * 0.34 +
      encrust * 0.08
  );

  float propagation =
    smoothstep(
      0.12,
      0.72,
      neighbour
    ) *
    mineralGate *
    (
      0.74 +
      0.34 * encrust
    );

  float growth = max(
    previous.r * 0.9976,
    source.r * 0.92
  );

  growth = max(
    growth,
    source.a * (
      0.18 +
      0.28 * encrust
    )
  );

  growth = max(
    growth,
    propagation * (
      0.14 +
      0.30 * source.a +
      0.20 * source.r +
      0.18 * encrust
    )
  );

  float facet = max(
    previous.g * 0.9982,
    growth * (
      0.16 +
      0.48 * source.g +
      0.30 * source.a +
      0.20 * lateCrystal
    )
  );

  // Audio excites the living front charge only; it no longer determines branch
  // width, reach, topology or the rate of mineral takeover.
  float charge = max(
    previous.b * 0.910,
    source.b * (
      0.88 +
      0.12 * energy
    )
  );

  float age = max(
    previous.a * 0.9986,
    max(
      growth * (
        0.92 +
        0.05 * encrust
      ),
      source.a
    )
  );

  // A reset caused by stage creation / track seek must immediately reveal the
  // correct chapter instead of requiring the simulation to replay prior history.
  if (uFrame < 2.0) {
    growth = max(
      source.r * (
        0.82 +
        0.10 * encrust
      ),
      source.a * (
        0.40 +
        0.16 * encrust
      )
    );

    facet = max(
      source.g * (
        0.70 +
        0.12 * lateCrystal
      ),
      source.a * (
        0.34 +
        0.18 * encrust
      )
    );

    charge = source.b * (
      0.88 +
      0.12 * energy
    );

    age = max(
      source.r * 0.52,
      source.a * (
        0.34 +
        0.10 * encrust
      )
    );
  }

  fragColor = vec4(
    clamp(growth, 0.0, 1.0),
    clamp(facet, 0.0, 1.0),
    clamp(charge, 0.0, 1.0),
    clamp(age, 0.0, 1.0)
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
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

const vec2 TRACK = vec2(0.70710678, 0.70710678);
const vec2 TRACK_N = vec2(-0.70710678, 0.70710678);

const float CAMERA_SPEED = 0.170;
const float CAMERA_BACK = 0.340;
const float CAMERA_SCALE = 1.55;

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

  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = mat2(1.62, -1.18, 1.18, 1.62) * p;
    amplitude *= 0.52;
  }

  return value;
}

float trackOffset(float s) {
  return
    0.220 * sin(s * 0.63 + 0.30) +
    0.105 * sin(s * 1.57 + 1.10) +
    0.050 * sin(s * 3.80 - 0.60);
}

vec2 trackPosition(float s) {
  return TRACK * s + TRACK_N * trackOffset(s);
}

vec2 trackTangent(float s) {
  const float epsilon = 0.002;
  return normalize(trackPosition(s + epsilon) - trackPosition(s - epsilon));
}

vec2 cameraForward(float s) {
  vec2 upright = vec2(0.0, 1.0);
  return normalize(mix(upright, trackTangent(s), 0.14));
}

vec2 screenToWorld(vec2 uv, float cameraS) {
  float minRes = min(uRes.x, uRes.y);
  vec2 screen = (uv * uRes - 0.5 * uRes) / minRes;

  // Screen-space orientation: the dendritic front should climb diagonally
  // upward through the frame. Keep world TRACK unchanged and mirror only the
  // camera-forward screen axis so simulation and display share the same view.
  screen.y = -screen.y;

  vec2 forward = cameraForward(cameraS);
  vec2 right = vec2(forward.y, -forward.x);
  vec2 center = trackPosition(cameraS - CAMERA_BACK);

  return center
    + right * screen.x * CAMERA_SCALE
    + forward * screen.y * CAMERA_SCALE;
}

vec3 prismPalette(float phase) {
  float p = fract(phase);

  vec3 cold = vec3(0.34, 0.66, 1.00);
  vec3 violet = vec3(0.62, 0.34, 1.00);
  vec3 rose = vec3(1.00, 0.42, 0.70);
  vec3 gold = vec3(1.00, 0.80, 0.34);

  vec3 colour = cold;
  colour = mix(colour, violet, smoothstep(0.08, 0.30, p));
  colour = mix(colour, rose, smoothstep(0.28, 0.52, p));
  colour = mix(colour, gold, smoothstep(0.50, 0.72, p));
  colour = mix(colour, cold, smoothstep(0.70, 0.98, p));

  return colour;
}

float parallaxParticleLayer(
  vec2 uv,
  float scale,
  float speed,
  float radius,
  float threshold,
  vec2 flow,
  vec2 seedOffset
) {
  vec2 p =
    uv * scale +
    flow * uTime * speed +
    seedOffset;

  vec2 cell = floor(p);
  vec2 local = fract(p) - 0.5;

  float seed = hash(
    cell +
    seedOffset * 1.73
  );

  float present = step(
    threshold,
    seed
  );

  // One small circular mote per occupied cell. Keep the random position well
  // inside the cell so a particle can never be clipped into a rectangular slab.
  vec2 centreOffset = vec2(
    hash(
      cell +
      seedOffset +
      vec2(1.20, 3.70)
    ) - 0.5,
    hash(
      cell +
      seedOffset +
      vec2(5.10, 0.90)
    ) - 0.5
  ) * 0.56;

  float radiusJitter = mix(
    0.72,
    1.20,
    hash(
      cell +
      seedOffset +
      vec2(8.30, 6.40)
    )
  );

  float particleRadius =
    radius *
    radiusJitter;

  float distanceToParticle = length(
    local -
    centreOffset
  );

  float aa =
    fwidth(
      distanceToParticle
    ) * 1.35 +
    0.0015;

  float mote =
    1.0 -
    smoothstep(
      particleRadius,
      particleRadius + aa,
      distanceToParticle
    );

  // Very shallow autonomous scintillation. The particle stays a dot; only its
  // intensity breathes slightly.
  float shimmer =
    0.90 +
    0.10 * sin(
      uTime * (
        0.32 +
        0.18 * seed
      ) +
      seed * 6.28318530718
    );

  return mote *
    present *
    shimmer;
}

vec3 parallaxParticles(
  vec2 uv,
  float energy
) {
  // Four simple depth planes. All move down-left, but the particles are now
  // much smaller and denser. Depth comes from velocity hierarchy first, then a
  // modest change in size/brightness, so the front feels like it is swimming
  // quickly through murky suspended matter rather than drifting past large
  // luminous dots.
  float farLayer = parallaxParticleLayer(
    uv,
    54.0,
    0.018,
    0.0060,
    0.860,
    vec2(0.82, -1.00),
    vec2(2.80, 4.10)
  );

  float midLayer = parallaxParticleLayer(
    uv,
    44.0,
    0.040,
    0.0072,
    0.845,
    vec2(0.80, -1.00),
    vec2(7.30, 1.60)
  );

  float nearLayer = parallaxParticleLayer(
    uv,
    34.0,
    0.085,
    0.0088,
    0.832,
    vec2(0.77, -1.00),
    vec2(11.40, 8.50)
  );

  float fastLayer = parallaxParticleLayer(
    uv,
    28.0,
    0.195,
    0.0105,
    0.852,
    vec2(0.74, -1.00),
    vec2(15.80, 12.20)
  );

  vec3 farColour = vec3(
    0.080,
    0.110,
    0.160
  );

  vec3 midColour = vec3(
    0.100,
    0.145,
    0.210
  );

  vec3 nearColour = vec3(
    0.130,
    0.185,
    0.270
  );

  vec3 fastColour = vec3(
    0.165,
    0.220,
    0.315
  );

  vec3 coldGlint = vec3(
    0.66,
    0.82,
    1.00
  );

  vec3 col =
    farColour *
      farLayer *
      0.28 +
    midColour *
      midLayer *
      0.38 +
    nearColour *
      nearLayer *
      0.52 +
    fastColour *
      fastLayer *
      0.74;

  col += coldGlint *
    farLayer *
    0.006;

  col += coldGlint *
    midLayer *
    (
      0.010 +
      0.003 * energy
    );

  col += coldGlint *
    nearLayer *
    (
      0.016 +
      0.004 * energy
    );

  col += coldGlint *
    fastLayer *
    (
      0.024 +
      0.006 * energy
    );

  return col;
}

void main() {
  vec2 texel = 1.0 / max(uRes, vec2(1.0));

  float energy = smoothstep(
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

  float journey =
    trackProgress *
    trackProgress *
    (3.0 - 2.0 * trackProgress);

  float encrust = smoothstep(
    0.06,
    0.90,
    journey
  );

  float prismReveal = smoothstep(
    0.36,
    0.92,
    journey
  );

  float fractureReveal = smoothstep(
    0.58,
    0.98,
    journey
  );

  // Autonomous scene motion: the camera continues to accompany the travelling
  // dendritic front. The degree of mineral takeover comes only from progress.
  float cameraS = uTime * CAMERA_SPEED;

  vec2 world = screenToWorld(
    vUv,
    cameraS
  );

  vec4 state = texture(
    uState,
    vUv
  );

  float growth = smoothstep(
    0.045,
    0.780,
    state.r
  );

  float facet = clamp(
    state.g,
    0.0,
    1.0
  );

  float charge = clamp(
    state.b,
    0.0,
    1.0
  );

  float mineralMass = smoothstep(
    0.06,
    0.88,
    state.a
  );

  float gx1 = texture(
    uState,
    vUv + vec2(texel.x, 0.0)
  ).r;

  float gx2 = texture(
    uState,
    vUv - vec2(texel.x, 0.0)
  ).r;

  float gy1 = texture(
    uState,
    vUv + vec2(0.0, texel.y)
  ).r;

  float gy2 = texture(
    uState,
    vUv - vec2(0.0, texel.y)
  ).r;

  vec2 gradient = vec2(
    gx1 - gx2,
    gy1 - gy2
  );

  float gradientMagnitude = length(
    gradient
  );

  float growthEdge = smoothstep(
    0.018,
    0.220,
    gradientMagnitude
  );

  // The display pass no longer recomputes the entire nine-node crystalline
  // front. These three paid-for mineral fields now supply all optical detail.
  float broadMineral = fbm(
    world * 1.55 +
    vec2(-0.30, 1.20)
  );

  float internalMineral = fbm(
    world * 7.00 +
    vec2(2.10, -1.40)
  );

  float fineCrystal = fbm(
    world * 15.00 +
    vec2(-4.20, 1.70)
  );

  float interiorPlane = smoothstep(
    mix(0.46, 0.38, encrust),
    0.88,
    internalMineral +
      facet * 0.24 +
      mineralMass * 0.10
  );

  float shardPlane = smoothstep(
    mix(0.62, 0.52, encrust),
    0.91,
    fineCrystal +
      facet * 0.18 +
      mineralMass * 0.12
  );

  float sideLight = dot(
    normalize(
      gradient +
      vec2(0.0001)
    ),
    normalize(
      vec2(0.38, 0.92)
    )
  );

  float sheen = smoothstep(
    0.10,
    0.98,
    sideLight * 0.5 + 0.5
  );

  float facetPhase = fract(
    broadMineral * 0.17 +
      internalMineral * 0.31 +
      fineCrystal * 0.27 +
      facet * 0.13 +
      growthEdge * 0.07 +
      (spectralCentroid - 0.5) * 0.16
  );

  vec3 prism = prismPalette(
    facetPhase
  );

  vec3 shiftedPrism = prismPalette(
    facetPhase +
      0.14 +
      internalMineral * 0.08
  );

  float spectralSplit =
    prismReveal *
    interiorPlane *
    (
      0.44 +
      0.56 * shardPlane
    );

  float fractureSeam =
    (
      1.0 -
      smoothstep(
        0.020,
        0.120,
        abs(
          internalMineral -
          fineCrystal
        )
      )
    ) *
    mineralMass *
    fractureReveal;

  vec3 abyss = vec3(0.010, 0.014, 0.030);
  vec3 midnight = vec3(0.026, 0.044, 0.082);
  vec3 deepIce = vec3(0.070, 0.130, 0.215);
  vec3 mineral = vec3(0.140, 0.235, 0.355);
  vec3 violet = vec3(0.285, 0.215, 0.500);
  vec3 cyan = vec3(0.360, 0.760, 1.000);
  vec3 white = vec3(0.970, 0.990, 1.000);

  vec3 parallaxDust = parallaxParticles(
    vUv,
    energy
  );

  float foregroundOcclusion =
    smoothstep(
      0.08,
      0.52,
      growth +
        mineralMass * 0.72 +
        charge * 0.38
    );

  vec3 col = mix(
    abyss,
    midnight,
    0.24 +
      broadMineral * 0.24
  );

  col += parallaxDust *
    (
      0.86 -
      0.62 * foregroundOcclusion
    );

  // Early crystal remains narrow and cold. Progress increases the mineral wake
  // rather than simply turning up the whole frame.
  col = mix(
    col,
    deepIce,
    growth * (
      0.34 +
      0.12 * encrust
    ) +
      mineralMass * (
        0.08 +
        0.12 * encrust
      )
  );

  col = mix(
    col,
    mineral,
    growth * (
      0.18 +
      facet * 0.20
    ) +
      mineralMass * (
        0.12 +
        0.16 * encrust
      )
  );

  col = mix(
    col,
    violet,
    growth *
      facet *
      (
        0.07 +
        0.11 * prismReveal
      )
  );

  // Bass illuminates bulk mineral mass without changing the geometry.
  col += deepIce *
    mineralMass *
    (
      0.08 +
      0.15 * bass
    );

  // Mids reveal planar interiors; spectral centroid biases their prism phase.
  col += mix(
    cyan,
    prism,
    0.18 +
      0.62 * prismReveal
  ) *
    interiorPlane *
    mineralMass *
    (
      0.055 +
      0.13 * mid +
      0.055 * prismReveal +
      0.035 * sheen
    );

  col += shiftedPrism *
    shardPlane *
    facet *
    spectralSplit *
    (
      0.030 +
      0.085 * mid
    );

  float solidEdge =
    growthEdge *
    smoothstep(
      0.18,
      0.86,
      mineralMass
    );

  // Treble catches stable crystal edges instead of creating or moving them.
  col += white *
    solidEdge *
    (
      0.055 +
      0.16 * treble
    );

  col += mix(
    cyan,
    prism,
    0.36 +
      0.42 * prismReveal
  ) *
    solidEdge *
    (
      0.045 +
      0.075 * treble
    );

  col += white *
    growthEdge *
    growth *
    (
      0.030 +
      0.070 * treble
    );

  // The living growth front stays electrically distinct from the mineral wake.
  // Energy excites this local charge; it does not accelerate the camera or
  // determine branch geometry.
  col += cyan *
    charge *
    (
      0.28 +
      0.42 * energy
    );

  col += white *
    charge *
    charge *
    (
      0.22 +
      0.48 * energy +
      0.08 * treble
    );

  // Late-track mineral pressure exposes fracture seams through already-grown
  // material. They are deterministic chapter structure, with mids/treble only
  // deciding how strongly those seams catch light.
  col += mix(
    violet,
    shiftedPrism,
    0.60
  ) *
    fractureSeam *
    (
      0.024 +
      0.090 * mid +
      0.050 * treble
    );

  col += white *
    fractureSeam *
    fractureSeam *
    (
      0.010 +
      0.040 * treble
    );

  // A restrained late dichroic wash makes overlapping growth read as competing
  // mineral planes rather than a single cyan texture.
  col += prism *
    spectralSplit *
    mineralMass *
    (
      0.012 +
      0.036 * prismReveal +
      0.038 * mid
    );

  float vignette = smoothstep(
    1.25,
    0.18,
    length(
      (vUv * uRes - 0.5 * uRes) /
      min(uRes.x, uRes.y)
    )
  );

  col *=
    0.68 +
    0.52 * vignette;

  // Whole-frame pumping is deliberately restrained.
  col *=
    0.98 +
    0.045 * energy;

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

export function createCrystallineGrowthTheme(): Theme {
  return createPingPongTheme({
    name: "crystalline-growth",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
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
    resetOnTrackProgressSeek: true,
  });
}
