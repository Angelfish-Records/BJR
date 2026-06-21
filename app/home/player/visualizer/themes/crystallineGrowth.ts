// web/app/home/player/visualizer/themes/crystallineGrowth.ts
// Dendritic crystalline growth: branching ice/lightning front, faceted mineral wake.
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
    dot(world - center, forward)
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
vec4 crystallineFront(vec2 world, float headS, float energy) {
  vec2 local = trackCoordinates(world);

  float lateral = local.x;
  float longitudinal = local.y;
  float headOffset = longitudinal - headS;

  float wander =
    0.016 * sin(longitudinal * 13.0 + 0.80) +
    0.010 * sin(longitudinal * 27.0 - 1.40);

  float spineWidth = 0.015 + 0.006 * energy;
  float spineDelta = (lateral - wander) / spineWidth;
  float spine = exp(-spineDelta * spineDelta);

  float headDelta = headOffset / 0.180;
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

    float nodeS = (cell + 0.16 + 0.64 * nodeRandom) / 1.35;
    float branchAge = headS - nodeS;

    float born = smoothstep(-0.060, 0.160, branchAge);
    float development = smoothstep(0.000, 0.420, branchAge);
    float crystallise = smoothstep(0.050, 0.800, branchAge);

    float side = sideRandom < 0.5 ? -1.0 : 1.0;

    float lengthA = (0.145 + 0.190 * lengthRandom) * development;
    float lengthB = (0.090 + 0.165 * forkRandom) * development;

    vec2 origin = vec2(0.0, nodeS);

    vec2 directionA = normalize(vec2(
      side * (0.44 + 0.18 * lengthRandom),
      0.90
    ));

    vec2 directionB = normalize(vec2(
      -side * (0.34 + 0.22 * forkRandom),
      0.94
    ));

    float widthA = 0.010 + 0.004 * energy;
    float widthB = 0.008 + 0.003 * energy;

    float branchA = lineSegment(
      local,
      origin,
      directionA,
      lengthA,
      widthA
    );

    float branchB = lineSegment(
      local,
      origin + directionA * lengthA * 0.42,
      directionB,
      lengthB,
      widthB
    );

    float branch = max(branchA, branchB) * born;

    float shardLengthA = lengthA * (0.65 + 0.95 * crystallise);
    float shardLengthB = lengthB * (0.50 + 0.90 * crystallise);

    float tendrilA = crystalTendril(
      local,
      origin,
      directionA,
      shardLengthA,
      0.030 + 0.014 * lengthRandom + 0.005 * energy,
      0.005 + 0.002 * energy
    );

    float tendrilB = crystalTendril(
      local,
      origin + directionA * lengthA * 0.26,
      directionB,
      shardLengthB,
      0.024 + 0.012 * forkRandom + 0.004 * energy,
      0.004 + 0.002 * energy
    );

    float nodeBody = crystalTendril(
      local,
      origin - vec2(0.0, 0.012),
      normalize(vec2(side * 0.10, 1.0)),
      0.070 + 0.050 * lengthRandom,
      0.036 + 0.010 * lengthRandom,
      0.016
    );

    float crystal = max(max(tendrilA, tendrilB), nodeBody) * crystallise;

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
      facetNoise + 0.22 * development
    );
    crystalFacet = max(crystalFacet, localFacet);
  }

  float mineral = fbm(world * 5.30 + vec2(1.70, -2.10));
  float fracture = fbm(world * 11.20 + vec2(-3.20, 0.90));

  float facetMask = smoothstep(0.31, 0.86, mineral);
  float shardMask = smoothstep(0.46, 0.90, fracture + crystalMass * 0.24);

  float seed = max(activeCore, max(branchMass * 0.80, crystalMass * 0.72));
  float facets = max(
    max(activeCore, branchMass) * facetMask,
    max(crystalFacet, crystalMass * (0.40 + 0.60 * shardMask))
  );
  float charge = max(activeCore * 1.12, branchCharge);
  float mass = max(branchMass, crystalMass);

  return vec4(seed, facets, charge, mass);
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
  float cameraS = uTime * CAMERA_SPEED;
  float previousCameraS = max(0.0, uTime - 0.016667) * CAMERA_SPEED;

  vec2 world = screenToWorld(vUv, cameraS);
  vec2 previousUv = worldToScreenUv(world, previousCameraS);

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

    vec4 source = crystallineFront(world, cameraS, energy);

  float mineral = fbm(world * 4.00 + vec2(-1.80, 2.40));
  float mineralGate = smoothstep(0.30, 0.84, mineral + source.a * 0.34);

  float propagation =
    smoothstep(0.12, 0.72, neighbour) *
    mineralGate;

  float growth = max(previous.r * 0.9980, source.r * 0.90);
  growth = max(growth, source.a * (0.20 + 0.24 * energy));
  growth = max(
    growth,
    propagation * (0.16 + 0.34 * source.a + 0.22 * source.r)
  );

  float facet = max(
    previous.g * 0.9984,
    growth * (0.18 + 0.52 * source.g + 0.34 * source.a)
  );

  float charge = max(
    previous.b * (0.900 - 0.050 * energy),
    source.b
  );

  float age = max(
    previous.a * 0.9988,
    max(growth * 0.96, source.a)
  );

  if (uFrame < 2.0) {
    growth = max(source.r * 0.84, source.a * 0.46);
    facet = max(source.g * 0.74, source.a * 0.42);
    charge = source.b;
    age = max(source.r * 0.52, source.a * 0.38);
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
uniform float uEnergy;

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

  vec2 forward = cameraForward(cameraS);
  vec2 right = vec2(forward.y, -forward.x);
  vec2 center = trackPosition(cameraS - CAMERA_BACK);

  return center
    + right * screen.x * CAMERA_SCALE
    + forward * screen.y * CAMERA_SCALE;
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

vec4 crystallineFront(vec2 world, float headS, float energy) {
  vec2 local = trackCoordinates(world);

  float lateral = local.x;
  float longitudinal = local.y;
  float headOffset = longitudinal - headS;

  float wander =
    0.016 * sin(longitudinal * 13.0 + 0.80) +
    0.010 * sin(longitudinal * 27.0 - 1.40);

  float spineWidth = 0.015 + 0.006 * energy;
  float spineDelta = (lateral - wander) / spineWidth;
  float spine = exp(-spineDelta * spineDelta);

  float headDelta = headOffset / 0.180;
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

    float nodeS = (cell + 0.16 + 0.64 * nodeRandom) / 1.35;
    float branchAge = headS - nodeS;

    float born = smoothstep(-0.060, 0.160, branchAge);
    float development = smoothstep(0.000, 0.420, branchAge);
    float crystallise = smoothstep(0.050, 0.800, branchAge);

    float side = sideRandom < 0.5 ? -1.0 : 1.0;

    float lengthA = (0.145 + 0.190 * lengthRandom) * development;
    float lengthB = (0.090 + 0.165 * forkRandom) * development;

    vec2 origin = vec2(0.0, nodeS);

    vec2 directionA = normalize(vec2(
      side * (0.44 + 0.18 * lengthRandom),
      0.90
    ));

    vec2 directionB = normalize(vec2(
      -side * (0.34 + 0.22 * forkRandom),
      0.94
    ));

    float widthA = 0.010 + 0.004 * energy;
    float widthB = 0.008 + 0.003 * energy;

    float branchA = lineSegment(
      local,
      origin,
      directionA,
      lengthA,
      widthA
    );

    float branchB = lineSegment(
      local,
      origin + directionA * lengthA * 0.42,
      directionB,
      lengthB,
      widthB
    );

    float branch = max(branchA, branchB) * born;

    float shardLengthA = lengthA * (0.65 + 0.95 * crystallise);
    float shardLengthB = lengthB * (0.50 + 0.90 * crystallise);

    float tendrilA = crystalTendril(
      local,
      origin,
      directionA,
      shardLengthA,
      0.030 + 0.014 * lengthRandom + 0.005 * energy,
      0.005 + 0.002 * energy
    );

    float tendrilB = crystalTendril(
      local,
      origin + directionA * lengthA * 0.26,
      directionB,
      shardLengthB,
      0.024 + 0.012 * forkRandom + 0.004 * energy,
      0.004 + 0.002 * energy
    );

    float nodeBody = crystalTendril(
      local,
      origin - vec2(0.0, 0.012),
      normalize(vec2(side * 0.10, 1.0)),
      0.070 + 0.050 * lengthRandom,
      0.036 + 0.010 * lengthRandom,
      0.016
    );

    float crystal = max(max(tendrilA, tendrilB), nodeBody) * crystallise;

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
      facetNoise + 0.22 * development
    );
    crystalFacet = max(crystalFacet, localFacet);
  }

  float mineral = fbm(world * 5.30 + vec2(1.70, -2.10));
  float fracture = fbm(world * 11.20 + vec2(-3.20, 0.90));

  float facetMask = smoothstep(0.31, 0.86, mineral);
  float shardMask = smoothstep(0.46, 0.90, fracture + crystalMass * 0.24);

  float seed = max(activeCore, max(branchMass * 0.80, crystalMass * 0.72));
  float facets = max(
    max(activeCore, branchMass) * facetMask,
    max(crystalFacet, crystalMass * (0.40 + 0.60 * shardMask))
  );
  float charge = max(activeCore * 1.12, branchCharge);
  float mass = max(branchMass, crystalMass);

  return vec4(seed, facets, charge, mass);
}

void main() {
  vec2 texel = 1.0 / max(uRes, vec2(1.0));

  float energy = clamp(uEnergy, 0.0, 1.0);
  float cameraS = uTime * CAMERA_SPEED;

  vec2 world = screenToWorld(vUv, cameraS);
    vec4 procedural = crystallineFront(world, cameraS, energy);
  vec4 state = texture(uState, vUv);

  float growth = max(
    smoothstep(0.045, 0.780, state.r),
    procedural.r * 0.80
  );

  float facet = max(state.g, procedural.g * 0.76);
  float charge = max(state.b, procedural.b);
  float mineralMass = max(
    smoothstep(0.06, 0.88, state.a),
    procedural.a * 0.82
  );

  float gx1 = texture(uState, vUv + vec2(texel.x, 0.0)).r;
  float gx2 = texture(uState, vUv - vec2(texel.x, 0.0)).r;
  float gy1 = texture(uState, vUv + vec2(0.0, texel.y)).r;
  float gy2 = texture(uState, vUv - vec2(0.0, texel.y)).r;

  vec2 gradient = vec2(gx1 - gx2, gy1 - gy2);
  float growthEdge = smoothstep(0.018, 0.220, length(gradient));

  vec2 local = trackCoordinates(world);

  float broadMineral = fbm(world * 1.55 + vec2(-0.30, 1.20));
  float internalMineral = fbm(world * 7.00 + vec2(2.10, -1.40));
  float fineCrystal = fbm(world * 15.00 + vec2(-4.20, 1.70));

    float interiorPlane = smoothstep(
    0.40,
    0.88,
    internalMineral + facet * 0.24 + mineralMass * 0.10
  );

  float shardPlane = smoothstep(
    0.56,
    0.91,
    fineCrystal + facet * 0.18 + mineralMass * 0.12
  );

  float sideLight = dot(
    normalize(gradient + vec2(0.0001)),
    normalize(vec2(0.38, 0.92))
  );

  float sheen = smoothstep(0.10, 0.98, sideLight * 0.5 + 0.5);

  vec3 abyss = vec3(0.018, 0.022, 0.041);
  vec3 midnight = vec3(0.038, 0.061, 0.105);
  vec3 deepIce = vec3(0.082, 0.145, 0.225);
  vec3 mineral = vec3(0.150, 0.245, 0.365);
  vec3 violet = vec3(0.290, 0.220, 0.500);
  vec3 cyan = vec3(0.390, 0.760, 1.000);
  vec3 white = vec3(0.970, 0.990, 1.000);

    vec3 col = mix(abyss, midnight, 0.36 + broadMineral * 0.28);

  col = mix(col, deepIce, growth * 0.48 + mineralMass * 0.14);
  col = mix(col, mineral, growth * (0.26 + facet * 0.24) + mineralMass * 0.22);
  col = mix(col, violet, growth * facet * 0.18 + mineralMass * 0.08);
  col = mix(col, cyan, growth * sheen * (0.16 + 0.14 * energy));

  col += deepIce * mineralMass * 0.18;
  col += cyan * interiorPlane * mineralMass * 0.16;
  col += violet * shardPlane * mineralMass * facet * 0.12;

  float solidEdge = growthEdge * smoothstep(0.18, 0.86, mineralMass);

  col += white * solidEdge * (0.10 + 0.18 * energy);
  col += cyan * solidEdge * 0.12;
  col += white * growthEdge * growth * (0.05 + 0.10 * energy);

  col += cyan * charge * (0.42 + 0.54 * energy);
  col += white * charge * (0.50 + 0.62 * energy);

  float nearHead = exp(
    -(
      (local.y - cameraS) *
      (local.y - cameraS)
    ) / 0.150
  );

  col += cyan * nearHead * procedural.r * (0.14 + 0.16 * energy);

  float vignette = smoothstep(1.25, 0.18, length(
    (vUv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y)
  ));

  col *= 0.72 + 0.52 * vignette;
  col *= 0.90 + 0.22 * energy;

  fragColor = vec4(col, 1.0);
}
`;

export function createCrystallineGrowthTheme(): Theme {
  return createPingPongTheme({
    name: "crystalline-growth",
    simFragmentShader: SIM_FS,
    displayFragmentShader: DISPLAY_FS,
  });
}
