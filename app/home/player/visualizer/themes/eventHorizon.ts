// web/app/home/player/visualizer/themes/eventHorizon.ts
// Event Horizon — a fixed-perspective relativistic fall into one coherent black-hole system.
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

// Event Horizon
//
// The ray/disk architecture is an independent BJR reimplementation informed by
// the geometric ideas studied in chrismatgit/black-hole-simulation at commit
// 6b49402940697870eb0331643959282596cf8c73 (MIT, Chris Matabaro, 2025).
// No Three.js dependency or source port is used here. The observer angle is
// deliberately fixed: track progress changes camera distance only, preserving
// the authored near-edge-on perspective while the long-form verb FALL advances.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uRms;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;

// Fixed authored observer geometry. FALL changes distance only; camera elevation
// and orientation never orbit. Landscape and portrait compositions have separate
// framing ranges so both preserve the same world at useful scales.
const float BASE_CAMERA_DISTANCE = 5.0;
const float CAMERA_ELEVATION_RATIO = 0.11;
const float PROJECTION_SCALE = 0.60;

const float LANDSCAPE_FALL_START_SCALE = 0.90;
const float LANDSCAPE_FALL_END_SCALE = 0.41;
const float PORTRAIT_FALL_END_SCALE = 0.405;
const float PORTRAIT_FRAME_HALF_WIDTH = 1.44;

// One physical accretion annulus. Near/front and far/lensed images are produced
// by different paths through the same disk rather than separate screen masks.
const float DISK_INNER_RADIUS = 0.80;
const float DISK_OUTER_RADIUS = 2.00;

// Thin-lens approximation to the strong-field topology. The capture threshold
// creates the black shadow; rays just outside it are strongly deflected and can
// encounter the far side of the same disk above the hole.
const float CAPTURE_IMPACT = 0.65;
const float LENS_STRENGTH = 0.45;
const float LENS_SOFTENING = 0.10;
const float MAX_DEFLECTION = 1.05;

// Material motion is perceptually compensated during the first ~40 seconds.
// At the distant opening perspective, identical world-space phase velocity reads
// noticeably faster on screen; this ramps into the existing mature cadence
// without changing geometry, camera orientation or the FALL narrative.
const float MATERIAL_EARLY_RATE = 0.58;
const float MATERIAL_SETTLE_SECONDS = 38.0;

struct Ray {
  vec3 origin;
  vec3 direction;
};

struct TraceResult {
  float captured;
  float hasDisk;
  vec3 diskPosition;
  vec3 outgoingDirection;
  vec3 closestPoint;
  float impact;
  float deflection;
};

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

float fbm4(vec2 p) {
  float value = 0.0;
  float amplitude = 0.55;

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p = mat2(1.61, -1.19, 1.19, 1.61) * p;
    amplitude *= 0.5;
  }

  return value;
}

float ridged4(vec2 p) {
  float value = 0.0;
  float amplitude = 0.62;
  float frequency = 1.0;

  for (int i = 0; i < 4; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);
    value += amplitude * n;

    frequency *= 2.06;
    amplitude *= 0.55;
    p = mat2(0.83, -0.56, 0.56, 0.83) * p;
  }

  return value;
}

float settledMaterialTime(float time) {
  float safeTime = max(time, 0.0);

  if (safeTime >= MATERIAL_SETTLE_SECONDS) {
    float settledPhase = MATERIAL_SETTLE_SECONDS
      * (0.5 + 0.5 * MATERIAL_EARLY_RATE);

    return settledPhase
      + (safeTime - MATERIAL_SETTLE_SECONDS);
  }

  float x = safeTime / MATERIAL_SETTLE_SECONDS;
  float integratedSmoothstep =
    x * x * x
    - 0.5 * x * x * x * x;

  return
    MATERIAL_EARLY_RATE * safeTime
    + (1.0 - MATERIAL_EARLY_RATE)
      * MATERIAL_SETTLE_SECONDS
      * integratedSmoothstep;
}

float distantViewRelaxation(
  float cameraScale,
  float fallStartScale,
  float fallEndScale
) {
  float framing01 = clamp(
    (cameraScale - fallEndScale)
      / max(fallStartScale - fallEndScale, 0.0001),
    0.0,
    1.0
  );

  return smoothstep(0.14, 0.96, framing01);
}

float openingCalmedMaterialTime(
  float materialTime,
  float viewRelaxation
) {
  return materialTime * mix(1.0, 0.64, viewRelaxation);
}

Ray makeCameraRay(vec2 screenPoint, float cameraScale) {
  float cameraDistance = BASE_CAMERA_DISTANCE * cameraScale;

  vec3 origin = vec3(
    0.0,
    cameraDistance * CAMERA_ELEVATION_RATIO,
    cameraDistance
  );

  vec3 forward = normalize(-origin);
  vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
  vec3 up = normalize(cross(right, forward));

  vec3 direction = normalize(
    forward
      + right * screenPoint.x * PROJECTION_SCALE
      + up * screenPoint.y * PROJECTION_SCALE
  );

  Ray ray;
  ray.origin = origin;
  ray.direction = direction;
  return ray;
}

bool segmentDiskCrossing(
  vec3 segmentStart,
  vec3 segmentEnd,
  out vec3 hitPosition
) {
  hitPosition = vec3(0.0);

  float denominator = segmentStart.y - segmentEnd.y;
  if (abs(denominator) < 0.000001) {
    return false;
  }

  float crossing = segmentStart.y / denominator;
  if (crossing <= 0.00001 || crossing > 1.0) {
    return false;
  }

  vec3 candidate = mix(
    segmentStart,
    segmentEnd,
    crossing
  );

  float diskRadius = length(candidate.xz);
  if (
    diskRadius < DISK_INNER_RADIUS
    || diskRadius > DISK_OUTER_RADIUS
  ) {
    return false;
  }

  hitPosition = candidate;
  return true;
}

vec3 cubicRayPoint(
  vec3 startPoint,
  vec3 closestPoint,
  vec3 endPoint,
  float t
) {
  float oneMinusT = 1.0 - t;
  float oneMinusT2 = oneMinusT * oneMinusT;
  float t2 = t * t;

  return
    startPoint * oneMinusT2 * oneMinusT
    + closestPoint * 3.0 * oneMinusT2 * t
    + closestPoint * 3.0 * oneMinusT * t2
    + endPoint * t2 * t;
}

TraceResult traceSystem(Ray ray) {
  TraceResult result;
  result.captured = 0.0;
  result.hasDisk = 0.0;
  result.diskPosition = vec3(0.0);
  result.outgoingDirection = ray.direction;
  result.closestPoint = ray.origin;
  result.impact = 1000.0;
  result.deflection = 0.0;

  // Keep the accepted thin-lens impact/deflection relationship because it owns
  // the silhouette we have already tuned successfully. The change here is that
  // near and lensed-rear accretion are no longer traced as separate branches:
  // one bounded continuous trajectory decides the first physical disk crossing.
  float closestTravel = max(
    0.0,
    -dot(ray.origin, ray.direction)
  );

  vec3 closestPoint =
    ray.origin + ray.direction * closestTravel;

  float impact = length(closestPoint);

  float lensWindow =
    1.0 - smoothstep(2.20, 4.20, impact);

  float deflection = lensWindow * min(
    MAX_DEFLECTION,
    LENS_STRENGTH / (impact + LENS_SOFTENING)
  );

  vec3 inward = normalize(-closestPoint);
  vec3 deflectedDirection = normalize(
    ray.direction * cos(deflection)
      + inward * sin(deflection)
  );

  result.closestPoint = closestPoint;
  result.impact = impact;
  result.deflection = deflection;
  result.outgoingDirection = deflectedDirection;

  // Bend smoothly around closest approach instead of switching from an incoming
  // "near" ray to a separate outgoing "far" ray. The cubic uses closestPoint as
  // both inner control points, so its tangents remain aligned with the incoming
  // and deflected directions while the path itself stays continuous.
  float bendSpan = mix(
    0.46,
    0.72,
    smoothstep(0.08, 0.82, deflection)
  );

  float bendStartTravel = max(
    0.0,
    closestTravel - bendSpan
  );

  vec3 bendStart =
    ray.origin + ray.direction * bendStartTravel;

  vec3 bendEnd =
    closestPoint + deflectedDirection * bendSpan;

  vec3 diskHit;

  // First segment: unchanged incoming observer ray. Most of the broad foreground
  // disk is therefore identical to the successful analytic version.
  if (segmentDiskCrossing(
    ray.origin,
    bendStart,
    diskHit
  )) {
    result.hasDisk = 1.0;
    result.diskPosition = diskHit;
    return result;
  }

  vec3 previousPoint = bendStart;

  // Eight bounded curve segments are enough to make the topology continuous.
  // There is no force integration and no mobile-scale iteration regime here.
  for (int i = 1; i <= 8; i++) {
    float curveT = float(i) / 8.0;

    vec3 curvePoint = cubicRayPoint(
      bendStart,
      closestPoint,
      bendEnd,
      curveT
    );

    if (segmentDiskCrossing(
      previousPoint,
      curvePoint,
      diskHit
    )) {
      result.hasDisk = 1.0;
      result.diskPosition = diskHit;
      return result;
    }

    // Preserve the accepted capture silhouette from the original impact test.
    // A captured ray may show foreground material only if it encountered the
    // annulus before reaching closest approach; otherwise it terminates black.
    if (
      impact < CAPTURE_IMPACT
      && i == 4
    ) {
      result.captured = 1.0;
      return result;
    }

    previousPoint = curvePoint;
  }

  // After the bounded bend, continue along the same outgoing direction. This
  // line is collinear with the previous far-ray solution away from the join, so
  // the successful upper/lensed silhouette is preserved while its connection to
  // the foreground disk is now decided by the continuous curve above.
  vec3 outgoingEnd =
    bendEnd + deflectedDirection * 8.0;

  if (segmentDiskCrossing(
    previousPoint,
    outgoingEnd,
    diskHit
  )) {
    result.hasDisk = 1.0;
    result.diskPosition = diskHit;
  }

  return result;
}

vec2 skyUv(vec3 direction) {
  vec3 d = normalize(direction);

  return vec2(
    atan(d.x, d.z) / TWO_PI + 0.5,
    atan(d.y, length(d.xz)) / PI + 0.5
  );
}

vec3 backgroundField(
  vec3 outgoingDirection,
  float energy,
  float rms,
  float treble
) {
  vec2 uv = skyUv(outgoingDirection);

  vec2 broadP = uv * vec2(8.0, 4.0) + vec2(2.7, -1.9);
  float broad = fbm4(broadP);

  // Stable procedural stars live on the outgoing celestial direction, so they
  // are naturally displaced by lensing while captured rays remain absolute
  // black. Audio modulates brightness only; it never regenerates star positions.
  vec2 starP = uv * vec2(360.0, 180.0);
  vec2 starCell = floor(starP);
  vec2 starLocal = fract(starP) - 0.5;
  float starSeed = hash(starCell);

  float star = step(0.9895, starSeed);
  star *= 1.0 - smoothstep(
    0.018,
    0.145,
    length(starLocal)
  );

  float brightSeed = hash(
    starCell + vec2(47.17, 11.83)
  );

  float brightStar = step(0.9982, brightSeed);
  brightStar *= 1.0 - smoothstep(
    0.012,
    0.205,
    length(starLocal)
  );

  vec3 deep = vec3(0.004, 0.005, 0.014);
  vec3 violet = vec3(0.050, 0.035, 0.100);
  vec3 cold = vec3(0.56, 0.72, 1.00);
  vec3 white = vec3(0.96, 0.98, 1.00);

  float atmosphericFloor = smoothstep(0.43, 0.88, broad);

  vec3 col = mix(
    deep,
    violet,
    atmosphericFloor * (0.20 + 0.12 * rms)
  );

  // Positions remain completely stable. RMS opens the faint celestial field;
  // treble lets the high synth wash scintillate through already-existing stars.
  col += cold
    * star
    * (0.27 + 0.08 * rms + 0.24 * treble + 0.03 * energy);

  col += white
    * brightStar
    * (0.42 + 0.08 * rms + 0.24 * treble + 0.03 * energy);

  return col;
}

float diskRadialEnvelope(float radius01) {
  return
    smoothstep(0.0, 0.11, radius01)
    * (1.0 - smoothstep(0.90, 1.0, radius01));
}

float angularSeamWeight(float angle) {
  return smoothstep(PI * 0.78, PI, abs(angle));
}

float seamlessRidgedAngular(
  float angle,
  float angularScale,
  float angularOffset,
  float radialCoordinate
) {
  float primary = ridged4(
    vec2(
      angle * angularScale + angularOffset,
      radialCoordinate
    )
  );

  float seam = angularSeamWeight(angle);
  if (seam <= 0.0) {
    return primary;
  }

  float wrappedAngle = angle < 0.0
    ? angle + TWO_PI
    : angle - TWO_PI;

  float wrapped = ridged4(
    vec2(
      wrappedAngle * angularScale + angularOffset,
      radialCoordinate
    )
  );

  // At the +/-PI wrap the two samples exchange roles, so their average is
  // identical on both sides. Blend toward that shared value only near the seam.
  return mix(
    primary,
    0.5 * (primary + wrapped),
    seam
  );
}

float seamlessFbmAngular(
  float angle,
  float angularScale,
  float angularOffset,
  float radialCoordinate
) {
  float primary = fbm4(
    vec2(
      angle * angularScale + angularOffset,
      radialCoordinate
    )
  );

  float seam = angularSeamWeight(angle);
  if (seam <= 0.0) {
    return primary;
  }

  float wrappedAngle = angle < 0.0
    ? angle + TWO_PI
    : angle - TWO_PI;

  float wrapped = fbm4(
    vec2(
      wrappedAngle * angularScale + angularOffset,
      radialCoordinate
    )
  );

  return mix(
    primary,
    0.5 * (primary + wrapped),
    seam
  );
}

float seamlessNoiseAngular(
  float angle,
  float angularScale,
  float angularOffset,
  float radialCoordinate
) {
  float primary = noise(
    vec2(
      angle * angularScale + angularOffset,
      radialCoordinate
    )
  );

  float seam = angularSeamWeight(angle);
  if (seam <= 0.0) {
    return primary;
  }

  float wrappedAngle = angle < 0.0
    ? angle + TWO_PI
    : angle - TWO_PI;

  float wrapped = noise(
    vec2(
      wrappedAngle * angularScale + angularOffset,
      radialCoordinate
    )
  );

  return mix(
    primary,
    0.5 * (primary + wrapped),
    seam
  );
}

vec2 criticalFlowProfile(
  vec3 closestPoint,
  float time,
  float mid,
  float treble,
  float viewRelaxation
) {
  float impact = max(length(closestPoint), CAPTURE_IMPACT + 0.001);
  float angle = atan(closestPoint.y, closestPoint.x);
  float flowAngle = angle - time * (0.20 + 0.22 / sqrt(max(impact, 0.18)));

  float ridges = seamlessRidgedAngular(
    flowAngle,
    6.4,
    0.0,
    impact * 8.4 - time * 0.10
  );

  float clouds = seamlessFbmAngular(
    flowAngle,
    3.0,
    impact * 0.8,
    impact * 5.6 + time * 0.05
  );

  float filaments = smoothstep(
    0.56 - 0.08 * treble,
    0.98,
    ridges
  );

  float mist = smoothstep(
    0.26 - 0.04 * mid,
    0.92,
    clouds
  );

  return vec2(
    mix(mist, filaments, 0.70 + 0.18 * viewRelaxation),
    filaments
  );
}

vec3 shadeDisk(
  vec3 hitPosition,
  vec3 cameraPosition,
  float time,
  float energy,
  float rms,
  float bass,
  float mid,
  float treble,
  float spectralCentroid,
  float viewRelaxation
) {
  float radius = length(hitPosition.xz);
  float radius01 = clamp(
    (radius - DISK_INNER_RADIUS)
      / (DISK_OUTER_RADIUS - DISK_INNER_RADIUS),
    0.0,
    1.0
  );

  float angle = atan(hitPosition.z, hitPosition.x);

  // Scene time owns autonomous orbital/accretion flow. The geometry itself is
  // static in world space; only its emissive material moves.
  float orbitalRate = 0.30 + 0.34 / sqrt(max(radius, 0.18));
  float flowAngle = angle - time * orbitalRate;

  float broadMatter = seamlessRidgedAngular(
    flowAngle,
    1.85,
    0.0,
    radius * 3.70 - time * 0.085
  );

  float fineMatter = seamlessNoiseAngular(
    flowAngle,
    7.8,
    radius * 2.4,
    radius * 11.0 + time * 0.18
  );

  float radialEnvelope = diskRadialEnvelope(radius01);

  float matter = smoothstep(
    0.34 - 0.055 * mid,
    0.98,
    broadMatter
  );

  float filaments = smoothstep(
    0.62 - 0.10 * treble,
    0.98,
    fineMatter
  );

  float innerHeat = 1.0 - smoothstep(0.04, 0.56, radius01);

  // z > 0 is the camera-facing half of the annulus. This is an emissive and
  // optical-depth distinction only; both images are still the same disk.
  float frontness = smoothstep(
    -0.26,
    0.38,
    hitPosition.z / DISK_OUTER_RADIUS
  );

  // The far-side image is intentionally dominated by the hotter inner annulus,
  // so it reads as a thinner lensed arch while the near side remains broad.
  float farInnerBias = mix(
    0.34 + 0.66 * innerHeat,
    1.0,
    frontness
  );

  vec3 orbitalTangent = normalize(
    vec3(-hitPosition.z, 0.0, hitPosition.x)
  );

  vec3 towardCamera = normalize(cameraPosition - hitPosition);
  float lineOfSight = dot(orbitalTangent, towardCamera);
  float approaching = 0.5 + 0.5 * lineOfSight;

  float dopplerBrightness = mix(0.72, 1.34, approaching);
  float gravitationalWarmth = 1.0 - smoothstep(0.0, 0.72, radius01);

  vec3 ember = vec3(0.95, 0.34, 0.14);
  vec3 amber = vec3(1.00, 0.64, 0.27);
  vec3 ivory = vec3(1.00, 0.93, 0.78);
  vec3 blue = vec3(0.28, 0.62, 1.00);
  vec3 white = vec3(0.98, 0.99, 1.00);

  float bassHeat = bass * bass;

  float temperatureBias = clamp(
    0.18
      + 0.52 * approaching
      + 0.28 * spectralCentroid
      - 0.16 * gravitationalWarmth,
    0.0,
    1.0
  );

  vec3 warmColour = mix(
    ember,
    amber,
    0.54 + 0.30 * spectralCentroid
  );

  vec3 hotColour = mix(ivory, blue, temperatureBias);
  vec3 diskColour = mix(warmColour, hotColour, 0.34 + 0.52 * approaching);

  // RMS owns the illumination floor; bass is concentrated into the hot inner
  // annulus rather than making the entire physical disk pump.
  float bulkEmission = radialEnvelope
    * farInnerBias
    * (0.24 + 0.42 * matter)
    * (0.66 + 0.22 * rms + 0.20 * bass + 0.08 * energy)
    * dopplerBrightness
    * mix(1.0, 0.88, viewRelaxation);

  float filamentEmission = radialEnvelope
    * farInnerBias
    * filaments
    * (0.040 + 0.040 * rms + 0.15 * mid + 0.13 * treble)
    * dopplerBrightness
    * mix(1.0, 1.22, viewRelaxation);

  float hotInnerEmission = radialEnvelope
    * farInnerBias
    * innerHeat
    * (
      0.024
      + 0.045 * rms
      + 0.15 * bass
      + 0.18 * bassHeat
      + 0.025 * energy
    );

  vec3 hotInnerColour = mix(
    mix(amber, ivory, 0.58),
    white,
    0.26 + 0.48 * bassHeat
  );

  vec3 col = diskColour * bulkEmission;
  col += mix(diskColour, white, 0.72) * filamentEmission;
  col += hotInnerColour * hotInnerEmission;

  return col;
}

float diskLayerOpacity(vec3 hitPosition) {
  float radius = length(hitPosition.xz);
  float radius01 = clamp(
    (radius - DISK_INNER_RADIUS)
      / (DISK_OUTER_RADIUS - DISK_INNER_RADIUS),
    0.0,
    1.0
  );

  float foreground = smoothstep(
    -0.24,
    0.34,
    hitPosition.z / DISK_OUTER_RADIUS
  );

  float diskCoverage = diskRadialEnvelope(radius01);

  return mix(
    0.54 + 0.20 * (1.0 - radius01),
    0.82,
    foreground
  ) * diskCoverage;
}

void main() {
  float time = max(uTime, 0.0);
  float materialTime = settledMaterialTime(time);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);
  float journey = trackProgress * trackProgress * (3.0 - 2.0 * trackProgress);

  float energy = smoothstep(0.02, 0.98, clamp(uEnergy, 0.0, 1.0));
  float rms = smoothstep(0.03, 0.94, clamp(uRms, 0.0, 1.0));
  float bass = smoothstep(0.04, 0.96, clamp(uBass, 0.0, 1.0));
  float mid = smoothstep(0.04, 0.96, clamp(uMid, 0.0, 1.0));
  float treble = smoothstep(0.06, 0.94, clamp(uTreble, 0.0, 1.0));
  float spectralCentroid = clamp(uCentroid, 0.0, 1.0);

  // FALL remains one deterministic approach with a fixed observer angle. Wide
  // compositions begin closer and finish deeper than before. Portrait framing
  // begins far enough out to reveal the complete annulus, then traverses a much
  // larger distance so it still finishes skimming the accretion disk.
  float aspectRatio = uRes.x / max(uRes.y, 1.0);
  float portraitWeight = 1.0 - smoothstep(0.90, 1.0, aspectRatio);

  float portraitStartScale = clamp(
    PORTRAIT_FRAME_HALF_WIDTH / max(aspectRatio, 0.45),
    1.55,
    3.20
  );

  float fallStartScale = mix(
    LANDSCAPE_FALL_START_SCALE,
    portraitStartScale,
    portraitWeight
  );

  float fallEndScale = mix(
    LANDSCAPE_FALL_END_SCALE,
    PORTRAIT_FALL_END_SCALE,
    portraitWeight
  );

  float cameraScale = mix(
    fallStartScale,
    fallEndScale,
    journey
  );

  float viewRelaxation = distantViewRelaxation(
    cameraScale,
    fallStartScale,
    fallEndScale
  );

  float calmMaterialTime = openingCalmedMaterialTime(
    materialTime,
    viewRelaxation
  );

  vec2 screenPoint = (vUv - 0.5) * vec2(aspectRatio, 1.0);

  // WebGL UV orientation mirrored the authored camera view in the first ray
  // topology pass. Flip the screen-space vertical axis once, before ray
  // construction, so the observer-facing disk sits below the shadow and the
  // lensed far side rises above it. Camera elevation itself remains fixed.
  screenPoint.y =
    -screenPoint.y
    - mix(0.012, 0.002, journey);

  Ray observerRay = makeCameraRay(screenPoint, cameraScale);
  TraceResult trace = traceSystem(observerRay);

  // The capture silhouette is analytically continuous, but the old binary
  // captured/not-captured branch quantised its circumference to whole pixels.
  // Derivative-aware coverage gives the shadow a resolution-scaled subpixel
  // edge without moving the capture threshold or changing ray geometry.
  float captureAa = max(
    fwidth(trace.impact) * 0.85,
    0.000001
  );

  float captureExterior = smoothstep(
    CAPTURE_IMPACT - captureAa,
    CAPTURE_IMPACT + captureAa,
    trace.impact
  );

  float hasDiskCoverage = step(0.5, trace.hasDisk);
  float captureVisibility = mix(
    captureExterior,
    1.0,
    hasDiskCoverage
  );

  vec3 col = backgroundField(
    trace.outgoingDirection,
    energy,
    rms,
    treble
  );

  // One continuous trajectory owns both foreground and lensed accretion. There
  // is no near/far material branch left to blend at the lateral extremity.
  // Foreground disk hits remain fully visible even when the underlying ray would
  // otherwise enter the capture shadow.
  if (trace.hasDisk > 0.5) {
    vec3 diskEmission = shadeDisk(
      trace.diskPosition,
      observerRay.origin,
      calmMaterialTime,
      energy,
      rms,
      bass,
      mid,
      treble,
      spectralCentroid,
      viewRelaxation
    );

    float diskOpacity =
      diskLayerOpacity(trace.diskPosition);

    col *= 1.0 - diskOpacity * 0.82;
    col += diskEmission;
  }

  // The photon/lensing edge is derived from the same impact parameter that
  // decides capture. It is therefore locked to the ray topology rather than a
  // separately drawn radial ring.
  float criticalDistance = max(trace.impact - CAPTURE_IMPACT, 0.0);
  float criticality = exp(
    -(
      criticalDistance * criticalDistance
      / (0.090 * 0.090)
    )
  );

  // Non-disk rays are antialiased once by captureVisibility below. Disk-hit
  // rays keep their matter fully visible, so only their critical-light overlay
  // needs the same soft capture gate here.
  criticality *= mix(
    1.0,
    captureExterior,
    hasDiskCoverage
  );
  criticality *= 0.42 + 0.58 * smoothstep(0.035, 0.42, trace.deflection);

  float closestAngle = atan(trace.closestPoint.y, trace.closestPoint.x);
  vec2 closestDirection = normalize(
    trace.closestPoint.xy + vec2(0.0001, 0.0)
  );

  vec3 photonWarm = vec3(1.00, 0.56, 0.24);
  vec3 photonCool = vec3(0.30, 0.66, 1.00);

  float photonHue = clamp(
    0.5
      + 0.22 * closestDirection.x
      + 0.14 * closestDirection.y * cos(
        calmMaterialTime * 0.11 - spectralCentroid * 1.2
      )
      + 0.10 * sin(
        calmMaterialTime * 0.16 + spectralCentroid * 0.9
      ),
    0.0,
    1.0
  );

  vec3 photonColour = mix(photonWarm, photonCool, photonHue);

  vec2 criticalProfile = criticalFlowProfile(
    trace.closestPoint,
    calmMaterialTime,
    mid,
    treble,
    viewRelaxation
  );

  float criticalTexture = criticalProfile.x;
  float criticalFilaments = criticalProfile.y;
  float criticalFlow = criticality * (0.34 + 0.66 * criticalTexture);

  // Treble does not alter the ray path. It increases the spectral separation of
  // light already travelling near the critical curve, giving high synth pulses
  // a refractive shimmer rather than a geometric twitch.
  float trebleShimmer =
    treble * treble
    * (0.42 + 0.58 * criticalFilaments);

  float refractionAxis = clamp(
    0.28
      + 0.42 * (0.5 + 0.5 * closestDirection.x)
      + 0.30 * spectralCentroid,
    0.0,
    1.0
  );

  vec3 refractedWarm = mix(
    photonWarm,
    vec3(1.00, 0.88, 0.66),
    0.34
  );

  vec3 refractedCool = mix(
    photonCool,
    vec3(0.68, 0.86, 1.00),
    0.38
  );

  vec3 refractedColour = mix(
    refractedWarm,
    refractedCool,
    refractionAxis
  );

  vec3 responsivePhotonColour = mix(
    photonColour,
    refractedColour,
    0.20 * trebleShimmer
  );

  col += responsivePhotonColour
    * criticalFlow
    * (0.17 + 0.06 * rms + 0.10 * energy + 0.16 * treble);

  col += mix(responsivePhotonColour, vec3(1.0), 0.66)
    * criticalFlow
    * criticalFilaments
    * (0.016 + 0.11 * trebleShimmer);

  col += mix(
    vec3(0.18, 0.32, 0.70),
    responsivePhotonColour,
    0.20
  )
    * criticalFlow
    * (0.020 + 0.018 * rms + 0.072 * mid);

  // A restrained bend halo makes otherwise dark outgoing rays reveal the
  // gravitational field without inventing a second geometric structure.
  float bendHalo = smoothstep(0.04, 0.50, trace.deflection)
    * (1.0 - smoothstep(0.50, 1.15, trace.deflection));

  bendHalo *= 0.45 + 0.55 * criticalTexture;

  bendHalo *= mix(
    1.0,
    captureExterior,
    hasDiskCoverage
  );

  vec3 bendColour = mix(
    vec3(0.12, 0.08, 0.24),
    vec3(0.12, 0.22, 0.44),
    0.34 * spectralCentroid
  );

  col += bendColour
    * bendHalo
    * (0.012 + 0.026 * rms + 0.024 * treble + 0.018 * energy);

  // Apply the capture coverage exactly once to empty/lensed space. Deep inside
  // the shadow this remains mathematically black; only the circumference gets
  // fractional pixel coverage. Foreground disk matter is intentionally exempt.
  col *= captureVisibility;

  float edgeVignette = 1.0 - smoothstep(
    0.78,
    1.45,
    length(screenPoint)
  );

  col *= 0.50 + 0.82 * edgeVignette;

  // Keep global pumping tiny. Music should illuminate matter and critical rays,
  // not move or breathe the black-hole coordinate system.
  col *= 0.985 + 0.035 * energy;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function createEventHorizonTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uTrackProgress: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let uRms: WebGLUniformLocation | null = null;
  let uBass: WebGLUniformLocation | null = null;
  let uMid: WebGLUniformLocation | null = null;
  let uTreble: WebGLUniformLocation | null = null;
  let uCentroid: WebGLUniformLocation | null = null;

  return {
    name: "event-horizon",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uTrackProgress = gl.getUniformLocation(program, "uTrackProgress");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
      uRms = gl.getUniformLocation(program, "uRms");
      uBass = gl.getUniformLocation(program, "uBass");
      uMid = gl.getUniformLocation(program, "uMid");
      uTreble = gl.getUniformLocation(program, "uTreble");
      uCentroid = gl.getUniformLocation(program, "uCentroid");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uTrackProgress, opts.trackProgress01 ?? 0);
      gl.uniform1f(uEnergy, opts.audio.energy);
      gl.uniform1f(uRms, opts.audio.rms ?? opts.audio.energy);
      gl.uniform1f(uBass, opts.audio.bass ?? opts.audio.energy);
      gl.uniform1f(uMid, opts.audio.mid ?? opts.audio.energy);
      gl.uniform1f(uTreble, opts.audio.treble ?? opts.audio.energy);
      gl.uniform1f(uCentroid, opts.audio.centroid ?? 0.5);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindVertexArray(null);
      gl.useProgram(null);
    },

    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf);
      if (tri?.vao) gl.deleteVertexArray(tri.vao);
      tri = null;

      if (program) gl.deleteProgram(program);
      program = null;
    },
  };
}
