// web/app/home/player/visualizer/themes/orbitalScript.ts
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

const FS_INK = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 outColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;

uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 0.00001);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba*h);
}

vec2 rot(vec2 p, float a){
  float s = sin(a);
  float c = cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

float ropeNoise(float a, float seed, float t){
  return
    0.45 * sin(a*1.17 + seed*2.10 + t*0.43) +
    0.32 * sin(a*2.31 - seed*1.70 - t*0.29) +
    0.23 * sin(a*3.73 + seed*4.60 + t*0.17);
}

// Stable peripheral vascular plexus.
//
// This is not a warped tiling. Six deterministic root vessels enter from the
// outer field, divide into unequal daughter branches, and terminate at different
// depths. The same graph is evaluated in the draw pass, so rope refraction and
// transient illumination share one biological structure.
void accumulateVesselSegment(
  vec2 p,
  vec2 a,
  vec2 b,
  float family,
  inout float majorDist,
  inout float minorDist,
  inout float nearestDist,
  inout vec2 nearestDir
){
  vec2 ba = b - a;
  float denom = max(
    dot(ba, ba),
    0.00001
  );

  float segmentLength = sqrt(
    denom
  );

  vec2 baseDir =
    ba /
    max(
      segmentLength,
      0.00001
    );

  vec2 normalDir = vec2(
    -baseDir.y,
    baseDir.x
  );

  float h = clamp(
    dot(
      p - a,
      ba
    ) / denom,
    0.0,
    1.0
  );

  // Deterministic identity belongs to the vessel itself, not to time/audio.
  // The endpoint envelope reaches exactly zero at both ends, so daughter
  // branches still join their parent cleanly even though their bodies meander.
  float fibreSeed = hash12(
    a*7.13 +
    b*11.37 +
    vec2(
      2.7 + family*5.1,
      -4.3 + family*2.9
    )
  );

  float phase =
    fibreSeed *
    6.28318530718;

  float envelope =
    sin(
      3.14159265359*h
    );

  float primaryWave =
    sin(
      phase +
      h*3.14159265359
    );

  float secondaryWave =
    sin(
      phase*1.73 -
      h*9.42477796077
    );

  float fibreAmplitude =
    segmentLength *
    mix(
      0.060,
      0.115,
      fibreSeed
    );

  float centreOffset =
    envelope *
    fibreAmplitude *
    (
      0.68*primaryWave +
      0.32*secondaryWave
    );

  vec2 organicCentre =
    mix(
      a,
      b,
      h
    ) +
    normalDir*centreOffset;

  // Thickness varies along the grown fibre. Dividing the measured distance by
  // this field makes the same SDF thresholds swell and narrow organically
  // without changing the higher-level trunk/branch width hierarchy.
  float thicknessField = clamp(
    0.94 +
    0.16*sin(
      phase*0.83 +
      h*6.28318530718
    ) +
    0.07*sin(
      phase*1.41 -
      h*15.7079632679
    ),
    0.76,
    1.20
  );

  float d =
    length(
      p - organicCentre
    ) /
    thicknessField;

  // Differentiate the procedural centreline analytically so tangent-based rope
  // probing follows the curved fibre rather than its original straight chord.
  float dEnvelope =
    3.14159265359 *
    cos(
      3.14159265359*h
    );

  float dPrimary =
    3.14159265359 *
    cos(
      phase +
      h*3.14159265359
    );

  float dSecondary =
    -9.42477796077 *
    cos(
      phase*1.73 -
      h*9.42477796077
    );

  float dOffset =
    fibreAmplitude *
    (
      dEnvelope *
      (
        0.68*primaryWave +
        0.32*secondaryWave
      ) +
      envelope *
      (
        0.68*dPrimary +
        0.32*dSecondary
      )
    );

  vec2 dir = normalize(
    ba +
    normalDir*dOffset +
    vec2(
      0.00001,
      0.00001
    )
  );

  if(family > 0.5){
    majorDist = min(majorDist, d);
  } else {
    minorDist = min(minorDist, d);
  }

  if(d < nearestDist){
    nearestDist = d;
    nearestDir = dir;
  }
}

vec4 vascularField(vec2 p){
  const float TAU = 6.28318530718;

  float majorDist = 1e9;
  float minorDist = 1e9;
  float nearestDist = 1e9;
  vec2 nearestDir = vec2(1.0, 0.0);

  for(int root = 0; root < 6; root++){
    float f = float(root);

    float seedA = hash12(vec2(f + 1.7, 4.3));
    float seedB = hash12(vec2(f + 7.1, 9.2));
    float seedC = hash12(vec2(f + 3.9, 14.6));

    float baseAngle =
      TAU * (
        f / 6.0
      ) +
      0.18 * (
        seedA - 0.5
      );

    float bend =
      (
        seedB - 0.5
      ) * 0.52;

    vec2 outer = vec2(
      cos(baseAngle + 0.10*(seedC - 0.5)),
      sin(baseAngle + 0.10*(seedC - 0.5))
    ) * (
      1.38 + 0.16*seedA
    );

    vec2 shoulder = vec2(
      cos(baseAngle + bend*0.46),
      sin(baseAngle + bend*0.46)
    ) * (
      0.88 + 0.09*seedB
    );

    shoulder += 0.060 * vec2(
      sin(f*2.37 + 0.8),
      cos(f*1.91 - 1.2)
    );

    vec2 inner = vec2(
      cos(baseAngle + bend),
      sin(baseAngle + bend)
    ) * (
      0.48 + 0.07*seedC
    );

    inner += 0.045 * vec2(
      cos(f*1.73 + 2.4),
      sin(f*2.11 - 0.5)
    );

    float branchAngleA =
      baseAngle +
      0.42 +
      0.26*(seedC - 0.5);

    float branchAngleB =
      baseAngle -
      0.38 -
      0.24*(seedA - 0.5);

    vec2 branchA = vec2(
      cos(branchAngleA),
      sin(branchAngleA)
    ) * (
      0.72 + 0.12*seedB
    );

    vec2 branchB = vec2(
      cos(branchAngleB),
      sin(branchAngleB)
    ) * (
      0.68 + 0.14*seedC
    );

    vec2 tipA = vec2(
      cos(branchAngleA + 0.28 + 0.16*(seedA - 0.5)),
      sin(branchAngleA + 0.28 + 0.16*(seedA - 0.5))
    ) * (
      1.05 + 0.18*seedC
    );

    vec2 tipB = vec2(
      cos(branchAngleB - 0.30 - 0.14*(seedB - 0.5)),
      sin(branchAngleB - 0.30 - 0.14*(seedB - 0.5))
    ) * (
      1.00 + 0.20*seedA
    );

    accumulateVesselSegment(
      p,
      outer,
      shoulder,
      1.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      shoulder,
      inner,
      1.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      shoulder,
      branchA,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      branchA,
      tipA,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      shoulder,
      branchB,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      branchB,
      tipB,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );
  }

  return vec4(
    majorDist,
    minorDist,
    nearestDir
  );
}

void main(){
  vec2 uv = vUv;

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float mid = clamp(uMid, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);

  // Long-form verb: HURTLE.
  //
  // Scene time continually sends fresh warped rings from a distant birth plane
  // through the viewer. Track progress does not accelerate that conveyor; it
  // makes the tunnel progressively less escapable: perspective becomes more
  // intimate, near rings loom larger, and their trajectories grow less sober.
  float journey =
    trackProgress
    * trackProgress
    * (3.0 - 2.0 * trackProgress);

  float assault = smoothstep(
    0.08,
    0.92,
    journey
  );

  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = uv - 0.5;

  // Feedback memory is now autonomous. Audio may change how long / brightly
  // marks persist, but it no longer rotates, translates or zooms the whole
  // historical coordinate frame.
  float memoryRot =
    0.020 * sin(uTime*0.13) +
    0.014 * sin(uTime*0.041 + 1.9);

  float memoryZoom =
    1.0 +
    0.010 * sin(uTime*0.091) +
    0.007 * sin(uTime*0.033 + 2.5);

  vec2 drift = vec2(
    0.0045 * sin(uTime*0.19 + 0.7),
    0.0035 * cos(uTime*0.16 - 1.1)
  );

  vec2 advP = rot(
    p * memoryZoom,
    memoryRot * (0.70 + 0.30*assault)
  ) + drift;

  vec2 uv2 = advP + 0.5;

  vec3 prevA = texture(uPrev, uv).rgb;
  vec3 prevB = texture(uPrev, uv2).rgb;
  vec3 ink = mix(prevA, prevB, 0.34);

  // The trailing should stay bodily but not become a near-solid wash once the
  // sequence densifies. Retention therefore falls more aggressively as the
  // long-form assault chapter arrives, preserving black separation between
  // successive rope passes even later in the piece.
  float decay =
    0.974 -
    0.008*tre +
    0.001*bass -
    0.010*assault;

  ink *= clamp(decay, 0.938, 0.980);

  // The whole tunnel has an unreliable vanishing point, but this wandering is
  // autonomous rather than driven by musical peaks.
  vec2 tunnelCentre = vec2(
    0.058 * sin(uTime*0.071) +
      0.026 * sin(uTime*0.023 + 3.1),
    0.052 * cos(uTime*0.057) +
      0.023 * sin(uTime*0.031 - 1.6)
  ) * (0.70 + 0.55*assault);

  vec2 fieldP = (uv - 0.5) * aspect;
  vec2 q = fieldP;

  // A shallow, slow field roll prevents the tunnel from becoming a perfectly
  // concentric target. Later chapters tolerate more spatial disagreement.
  float rq = length(q - tunnelCentre);
  float localRot =
    0.040 * sin(uTime*0.17 - rq*6.0) +
    0.020 * sin(uTime*0.061 + rq*11.0);

  q = rot(
    q - tunnelCentre,
    localRot * (0.46 + 0.54*assault)
  ) + tunnelCentre;

  // Peripheral vascular tissue.
  //
  // The old chamber system was still recognisably a hexagonal tiling even after
  // deformation. The replacement is a fixed branching plexus: trunks divide
  // into daughter vessels and the ropes are locally refracted where they cross
  // that tissue. The graph itself never animates.
  float fieldRadius = length(fieldP);
  vec2 fieldDir = normalize(fieldP + vec2(0.0001, 0.0001));
  vec2 fieldTan = vec2(-fieldDir.y, fieldDir.x);

  float shellWrap =
    smoothstep(
      0.26,
      1.06,
      fieldRadius
    );

  float shellRad = dot(fieldP, fieldDir);
  float shellTan = dot(fieldP, fieldTan);

  vec2 tissueSampleP =
    fieldDir * (
      shellRad * (1.0 + 0.14*shellWrap)
    ) +
    fieldTan * (
      shellTan * (1.0 - 0.08*shellWrap)
    );

  tissueSampleP +=
    fieldDir *
    (
      0.032 *
      shellWrap *
      fieldRadius *
      fieldRadius
    );

  vec4 vesselSample =
    vascularField(
      tissueSampleP
    );

  float vesselDistance = min(
    vesselSample.x,
    vesselSample.y
  );

  float vesselInfluence =
    (
      1.0 -
      smoothstep(
        0.018,
        0.090,
        vesselDistance
      )
    ) *
    smoothstep(
      0.38,
      0.74,
      fieldRadius
    );

  vec2 vesselTangent = normalize(
    vesselSample.zw +
    vec2(0.0001, 0.0001)
  );

  vec2 vesselNormal = vec2(
    -vesselTangent.y,
    vesselTangent.x
  );

  float vesselSide =
    sin(
      dot(
        tissueSampleP,
        vesselTangent
      ) * 15.0 +
      dot(
        tissueSampleP,
        vesselNormal
      ) * 4.0
    );

  // The biological network bends an approaching rope locally instead of
  // snapping it from one polygonal chamber transform to another.
  vec2 ropeQuery =
    q +
    vesselNormal *
    vesselInfluence *
    vesselSide *
    (
      0.008 +
      0.014*assault
    );

  vec3 add = vec3(0.0);

  for(int s = 0; s < 9; s++){
    float fs = float(s);
    float minD = 1e9;

    float orbitSeed = fs * 1.731;

    // Nine staggered depth slices continually travel from far to near. Their
    // spacing is stable; scene time owns passage through the tunnel.
    float depthPhase = fract(
      uTime * 0.071 +
      fs / 9.0 +
      0.028 * sin(fs*2.17)
    );

    float depthCurve = pow(
      depthPhase,
      mix(1.58, 1.24, assault)
    );

    float perspectiveScale = mix(
      0.10,
      mix(6.80, 9.80, assault),
      depthCurve
    );

    float nearRush = smoothstep(
      0.54,
      0.92,
      depthPhase
    );

    float birthFade = smoothstep(
      0.015,
      0.10,
      depthPhase
    );

    float passageFade =
      1.0 -
      smoothstep(
        0.940,
        0.998,
        depthPhase
      );

    float ringVisibility =
      birthFade
      * passageFade;

    // Preserve the original orbital handwriting, but reinterpret the centres as
    // crooked trajectories around the tunnel's unstable vanishing point.
    float centreAng =
      uTime * (0.052 + 0.008*fs) +
      fs * 0.86 +
      1.7 * sin(uTime*0.027 + fs);

    vec2 orbitOffset =
      0.082 *
      vec2(cos(centreAng), sin(centreAng)) *
      (
        0.76 +
        0.24 * sin(uTime*0.049 + fs*1.3)
      );

    vec2 nearLurch = vec2(
      sin(
        fs*1.37 +
        depthPhase*5.2 +
        uTime*0.041
      ),
      cos(
        fs*1.91 -
        depthPhase*4.4 +
        uTime*0.033
      )
    ) * (
      0.012 +
      0.060 * assault * nearRush
    );

    vec2 C =
      tunnelCentre +
      orbitOffset * (0.55 + 0.45*depthCurve) +
      nearLurch;

    // Depth, rather than ring index, now owns the dominant apparent radius.
    // Small seed-to-seed differences retain the hand-made family resemblance.
    float baseR =
      0.150 +
      0.018 * sin(
        fs*2.0 +
        cen*2.2 +
        uTime*0.07
      );

    float eccentricity =
      (
        0.070 +
        0.220*assault
      ) * (
        0.28 +
        0.72*nearRush
      );

    float stretch =
      1.0 +
      eccentricity *
      sin(
        fs*1.73 +
        uTime*0.061 +
        depthPhase*4.8
      );

    float squash =
      1.0 -
      eccentricity *
      0.72 *
      cos(
        fs*1.11 -
        uTime*0.047 +
        depthPhase*3.7
      );

    float ringTilt =
      fs*0.17 +
      uTime*0.033 +
      sin(
        fs*1.4 +
        depthPhase*4.1
      ) * (
        0.12 +
        0.26*assault
      );

    float tiltSin = sin(ringTilt);
    float tiltCos = cos(ringTilt);

    float w =
      0.20 +
      0.028*sin(fs + cen*4.0);

    float phi =
      fs*0.91 +
      uTime*w;

    vec2 prevP = C;
    bool hasPrev = false;

    for(int i = 0; i <= 28; i++){
      float fi = float(i) / 28.0;
      float a = phi + fi * 6.28318530718;

      // Audio is allowed to roughen each individual rope, but it does not own
      // tunnel speed, depth, global camera or the vanishing point.
      float rope =
        ropeNoise(a, orbitSeed, uTime) *
        (
          0.027 +
          0.012*bass +
          0.010*assault*nearRush
        );

      float sag =
        sin(a*0.5 + uTime*0.11 + fs) *
        (
          0.017 +
          0.013*mid
        );

      float rLocal =
        baseR +
        rope +
        sag;

      vec2 radial = vec2(cos(a), sin(a));
      vec2 tangent = vec2(-radial.y, radial.x);

      vec2 localP = rLocal * radial;

      // Rope flex: tangential slippage preserves the material, hand-drawn
      // character that was already successful in the original theme.
      localP += tangent *
        (
          0.018 * sin(a*2.0 - uTime*0.21 + fs*1.7) +
          0.010 * sin(a*5.0 + uTime*0.13)
        ) *
        (
          0.72 +
          0.40*nearRush +
          0.36*assault
        );

      localP += 0.012 * vec2(
        sin(a*3.1 + uTime*0.19 + fs),
        cos(a*2.7 - uTime*0.15 - fs)
      ) * (
        0.45 +
        0.55*cen +
        0.28*assault
      );

      // Drunken perspective: each approaching rope becomes an eccentric,
      // precessing ellipse before perspective expansion throws it past us.
      localP *= vec2(
        max(0.58, stretch),
        max(0.58, squash)
      );

      localP = vec2(
        tiltCos*localP.x - tiltSin*localP.y,
        tiltSin*localP.x + tiltCos*localP.y
      );

      vec2 curP =
        C +
        localP * perspectiveScale;

      if(hasPrev){
        float d = sdSegment(ropeQuery, prevP, curP);
        minD = min(minD, d);
      }

      prevP = curP;
      hasPrev = true;
    }

    float strokeW =
      (
        0.0048 +
        0.0014*sin(uTime*0.17 + fs) +
        0.0018*bass
      ) * mix(
        0.62,
        1.72,
        smoothstep(0.18, 0.92, depthPhase)
      );

    float body =
      exp(-pow(minD / strokeW, 2.0))
      * ringVisibility;

    float halo =
      exp(-pow(minD / (strokeW*4.8), 1.35))
      * ringVisibility;

    vec3 driedBlood = vec3(0.145, 0.018, 0.014);
    vec3 arterialRed = vec3(0.58, 0.045, 0.028);
    vec3 oxidisedOrange = vec3(0.78, 0.22, 0.075);
    vec3 bruisedBlack = vec3(0.050, 0.010, 0.014);

    float vein =
      0.5 +
      0.5*sin(fs*1.83 + uTime*0.061);

    float glint =
      smoothstep(0.62, 1.0, cen) *
      (
        0.55 +
        0.45*sin(fs*2.4 + uTime*0.19)
      );

    vec3 strokeCol = mix(
      driedBlood,
      arterialRed,
      0.20 + 0.28*vein + 0.24*bass
    );

    strokeCol = mix(
      strokeCol,
      oxidisedOrange,
      0.08 + 0.18*glint
    );

    vec3 vesselBlood = mix(
      vec3(0.22, 0.020, 0.024),
      vec3(0.70, 0.055, 0.034),
      0.30 + 0.18*cen
    );

    float vascularBlooding =
      vesselInfluence *
      (
        0.38 +
        0.40*assault +
        0.12*e
      );

    strokeCol = mix(
      strokeCol,
      vesselBlood,
      clamp(
        vascularBlooding,
        0.0,
        1.0
      )
    );

    float vesselBrush =
      vesselInfluence *
      smoothstep(
        0.12,
        0.46,
        body
      );

    strokeCol +=
      vec3(0.10, 0.016, 0.012) *
      vesselBrush *
      (
        0.14 +
        0.10*e +
        0.10*assault
      );

    strokeCol = mix(
      strokeCol,
      bruisedBlack,
      0.18 * (1.0 - body)
    );

    // Near-plane passage should feel like impact without making audio control
    // the rate of approach. Music only intensifies the mark as it arrives.
    float impactWindow =
      smoothstep(
        0.62,
        0.86,
        depthPhase
      ) *
      (
        1.0 -
        smoothstep(
          0.94,
          0.995,
          depthPhase
        )
      );

    float pulse =
      0.060 +
      0.14*e +
      0.10*bass +
      0.070*impactWindow;

    float depthLight = mix(
      0.42,
      1.16,
      nearRush
    );

    vec3 darkBody =
      strokeCol *
      (
        0.50 +
        0.30*vein
      );

    vec3 wetHighlight =
      vec3(1.00, 0.34, 0.15) *
      (
        0.14 +
        0.36*glint
      );

    vec3 blackRedHalo =
      vec3(0.17, 0.010, 0.012);

    add +=
      darkBody *
      body *
      pulse *
      depthLight;

    add +=
      wetHighlight *
      pow(body, 2.7) *
      (
        0.05 +
        0.18*tre +
        0.08*impactWindow
      );

    add +=
      blackRedHalo *
      halo *
      (
        0.014 +
        0.026*e +
        0.018*nearRush
      );
  }

  ink += add;

  float grain =
    (
      hash12(uv*uRes + uTime*11.0) - 0.5
    ) * 0.0035;

  ink += vec3(grain);

  outColor = vec4(
    clamp(ink, 0.0, 1.0),
    1.0
  );
}
`;

const FS_DRAW = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;
uniform float uBass;
uniform float uCentroid;

vec2 rot(vec2 p, float a){
  float s = sin(a);
  float c = cos(a);
  return vec2(c*p.x - s*p.y, s*p.x + c*p.y);
}

float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float sdSegment(vec2 p, vec2 a, vec2 b){
  vec2 pa = p - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 0.00001);
  float h = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba*h);
}

void accumulateVesselSegment(
  vec2 p,
  vec2 a,
  vec2 b,
  float family,
  inout float majorDist,
  inout float minorDist,
  inout float nearestDist,
  inout vec2 nearestDir
){
  vec2 ba = b - a;
  float denom = max(
    dot(ba, ba),
    0.00001
  );

  float segmentLength = sqrt(
    denom
  );

  vec2 baseDir =
    ba /
    max(
      segmentLength,
      0.00001
    );

  vec2 normalDir = vec2(
    -baseDir.y,
    baseDir.x
  );

  float h = clamp(
    dot(
      p - a,
      ba
    ) / denom,
    0.0,
    1.0
  );

  // Deterministic identity belongs to the vessel itself, not to time/audio.
  // The endpoint envelope reaches exactly zero at both ends, so daughter
  // branches still join their parent cleanly even though their bodies meander.
  float fibreSeed = hash12(
    a*7.13 +
    b*11.37 +
    vec2(
      2.7 + family*5.1,
      -4.3 + family*2.9
    )
  );

  float phase =
    fibreSeed *
    6.28318530718;

  float envelope =
    sin(
      3.14159265359*h
    );

  float primaryWave =
    sin(
      phase +
      h*3.14159265359
    );

  float secondaryWave =
    sin(
      phase*1.73 -
      h*9.42477796077
    );

  float fibreAmplitude =
    segmentLength *
    mix(
      0.060,
      0.115,
      fibreSeed
    );

  float centreOffset =
    envelope *
    fibreAmplitude *
    (
      0.68*primaryWave +
      0.32*secondaryWave
    );

  vec2 organicCentre =
    mix(
      a,
      b,
      h
    ) +
    normalDir*centreOffset;

  // Thickness varies along the grown fibre. Dividing the measured distance by
  // this field makes the same SDF thresholds swell and narrow organically
  // without changing the higher-level trunk/branch width hierarchy.
  float thicknessField = clamp(
    0.94 +
    0.16*sin(
      phase*0.83 +
      h*6.28318530718
    ) +
    0.07*sin(
      phase*1.41 -
      h*15.7079632679
    ),
    0.76,
    1.20
  );

  float d =
    length(
      p - organicCentre
    ) /
    thicknessField;

  // Differentiate the procedural centreline analytically so tangent-based rope
  // probing follows the curved fibre rather than its original straight chord.
  float dEnvelope =
    3.14159265359 *
    cos(
      3.14159265359*h
    );

  float dPrimary =
    3.14159265359 *
    cos(
      phase +
      h*3.14159265359
    );

  float dSecondary =
    -9.42477796077 *
    cos(
      phase*1.73 -
      h*9.42477796077
    );

  float dOffset =
    fibreAmplitude *
    (
      dEnvelope *
      (
        0.68*primaryWave +
        0.32*secondaryWave
      ) +
      envelope *
      (
        0.68*dPrimary +
        0.32*dSecondary
      )
    );

  vec2 dir = normalize(
    ba +
    normalDir*dOffset +
    vec2(
      0.00001,
      0.00001
    )
  );

  if(family > 0.5){
    majorDist = min(majorDist, d);
  } else {
    minorDist = min(minorDist, d);
  }

  if(d < nearestDist){
    nearestDist = d;
    nearestDir = dir;
  }
}

vec4 vascularField(vec2 p){
  const float TAU = 6.28318530718;

  float majorDist = 1e9;
  float minorDist = 1e9;
  float nearestDist = 1e9;
  vec2 nearestDir = vec2(1.0, 0.0);

  for(int root = 0; root < 6; root++){
    float f = float(root);

    float seedA = hash12(vec2(f + 1.7, 4.3));
    float seedB = hash12(vec2(f + 7.1, 9.2));
    float seedC = hash12(vec2(f + 3.9, 14.6));

    float baseAngle =
      TAU * (
        f / 6.0
      ) +
      0.18 * (
        seedA - 0.5
      );

    float bend =
      (
        seedB - 0.5
      ) * 0.52;

    vec2 outer = vec2(
      cos(baseAngle + 0.10*(seedC - 0.5)),
      sin(baseAngle + 0.10*(seedC - 0.5))
    ) * (
      1.38 + 0.16*seedA
    );

    vec2 shoulder = vec2(
      cos(baseAngle + bend*0.46),
      sin(baseAngle + bend*0.46)
    ) * (
      0.88 + 0.09*seedB
    );

    shoulder += 0.060 * vec2(
      sin(f*2.37 + 0.8),
      cos(f*1.91 - 1.2)
    );

    vec2 inner = vec2(
      cos(baseAngle + bend),
      sin(baseAngle + bend)
    ) * (
      0.48 + 0.07*seedC
    );

    inner += 0.045 * vec2(
      cos(f*1.73 + 2.4),
      sin(f*2.11 - 0.5)
    );

    float branchAngleA =
      baseAngle +
      0.42 +
      0.26*(seedC - 0.5);

    float branchAngleB =
      baseAngle -
      0.38 -
      0.24*(seedA - 0.5);

    vec2 branchA = vec2(
      cos(branchAngleA),
      sin(branchAngleA)
    ) * (
      0.72 + 0.12*seedB
    );

    vec2 branchB = vec2(
      cos(branchAngleB),
      sin(branchAngleB)
    ) * (
      0.68 + 0.14*seedC
    );

    vec2 tipA = vec2(
      cos(branchAngleA + 0.28 + 0.16*(seedA - 0.5)),
      sin(branchAngleA + 0.28 + 0.16*(seedA - 0.5))
    ) * (
      1.05 + 0.18*seedC
    );

    vec2 tipB = vec2(
      cos(branchAngleB - 0.30 - 0.14*(seedB - 0.5)),
      sin(branchAngleB - 0.30 - 0.14*(seedB - 0.5))
    ) * (
      1.00 + 0.20*seedA
    );

    accumulateVesselSegment(
      p,
      outer,
      shoulder,
      1.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      shoulder,
      inner,
      1.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      shoulder,
      branchA,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      branchA,
      tipA,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      shoulder,
      branchB,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );

    accumulateVesselSegment(
      p,
      branchB,
      tipB,
      0.0,
      majorDist,
      minorDist,
      nearestDist,
      nearestDir
    );
  }

  return vec4(
    majorDist,
    minorDist,
    nearestDir
  );
}

float ropeIntensity(vec3 sampleColour){
  return max(
    sampleColour.r,
    max(
      sampleColour.g * 0.78,
      sampleColour.b * 0.58
    )
  );
}

void main(){
  vec2 uv = vUv;
  vec2 px =
    (uv*uRes - 0.5*uRes) /
    min(uRes.x, uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);

  float journey =
    trackProgress
    * trackProgress
    * (3.0 - 2.0 * trackProgress);

  float assault = smoothstep(
    0.08,
    0.92,
    journey
  );

  // Audio can smear the wet image locally, but the lens itself is autonomous
  // and whole-track progression owns its increasing drunkenness.
  vec2 ghostA = vec2(
    0.0048*sin(uTime*0.31),
    0.0038*cos(uTime*0.23)
  ) * (
    0.70 +
    0.90*e
  );

  vec2 ghostB = vec2(
    0.0060*cos(uTime*0.17 + 1.7),
    0.0045*sin(uTime*0.19 - 0.8)
  ) * (
    0.35 +
    0.75*bass
  );

  vec2 lens = px;

  lens = rot(
    lens,
    (
      0.018 +
      0.020*assault
    ) * sin(uTime*0.09)
  );

  float r = length(lens);

  float radialWarp =
    0.018 +
    0.024*assault;

  vec2 warpedUv =
    0.5 +
    lens *
    min(uRes.x, uRes.y) /
    uRes *
    (
      1.0 +
      0.015*sin(uTime*0.11) +
      radialWarp*r*r*sin(
        uTime*0.07 +
        assault*2.3
      )
    );

  vec3 inkA = texture(uTex, warpedUv).rgb;
  vec3 inkB = texture(uTex, warpedUv + ghostA).rgb;
  vec3 inkC = texture(uTex, warpedUv - ghostB).rgb;

  vec3 ink =
    inkA +
    inkB*0.42 +
    inkC*0.24;

  float lum = dot(
    ink,
    vec3(0.299, 0.587, 0.114)
  );

  lum = pow(
    lum,
    0.74
  );

  vec3 bg = vec3(0.014, 0.006, 0.005);
  vec3 driedWash = vec3(0.22, 0.018, 0.012);
  vec3 deepBlood = vec3(0.48, 0.028, 0.018);
  vec3 hotClot = vec3(0.95, 0.21, 0.08);

  vec3 col = bg;

  col +=
    driedWash *
    lum *
    (
      0.62 +
      0.36*e
    );

  col +=
    deepBlood *
    ink *
    (
      0.28 +
      0.28*cen
    );

  col +=
    hotClot *
    pow(
      max(ink, vec3(0.0)),
      vec3(1.55)
    ) *
    (
      0.08 +
      0.22*e
    );

  // Peripheral vascular tissue.
  //
  // The scaffold is now an open dendritic plexus rather than a cell tiling.
  // Dormant vessels are almost invisible; the user mainly learns the topology
  // when a passing rope backlights a branch and that charge runs along it.
  vec2 tissueDir = normalize(px + vec2(0.0001, 0.0001));
  vec2 tissueTan = vec2(-tissueDir.y, tissueDir.x);

  float shellWrap =
    smoothstep(
      0.26,
      1.06,
      r
    );

  float shellRad = dot(px, tissueDir);
  float shellLat = dot(px, tissueTan);

  vec2 tissueSampleP =
    tissueDir * (
      shellRad * (1.0 + 0.14*shellWrap)
    ) +
    tissueTan * (
      shellLat * (1.0 - 0.08*shellWrap)
    );

  tissueSampleP +=
    tissueDir *
    (
      0.032 *
      shellWrap *
      r *
      r
    );

  vec4 vesselSample =
    vascularField(
      tissueSampleP
    );

  float majorDistance = vesselSample.x;
  float minorDistance = vesselSample.y;
  float vesselDistance = min(
    majorDistance,
    minorDistance
  );

  float tissuePresence =
    smoothstep(
      0.42,
      0.70,
      r
    );

  float tissueOuterFade =
    1.0 -
    smoothstep(
      1.28,
      1.62,
      r
    );

  float majorAa =
    fwidth(majorDistance) *
    1.35 +
    0.0008;

  float minorAa =
    fwidth(minorDistance) *
    1.35 +
    0.0008;

  float majorLine =
    1.0 -
    smoothstep(
      0.010 + majorAa,
      0.030 + majorAa,
      majorDistance
    );

  float majorCore =
    1.0 -
    smoothstep(
      0.0035 + majorAa,
      0.014 + majorAa,
      majorDistance
    );

  float minorLine =
    1.0 -
    smoothstep(
      0.006 + minorAa,
      0.021 + minorAa,
      minorDistance
    );

  float minorCore =
    1.0 -
    smoothstep(
      0.0025 + minorAa,
      0.010 + minorAa,
      minorDistance
    );

  float vesselStructure =
    max(
      majorLine,
      minorLine * 0.88
    ) *
    tissuePresence *
    tissueOuterFade;

  float vesselCore =
    max(
      majorCore,
      minorCore * 0.90
    ) *
    tissuePresence *
    tissueOuterFade;

  float vesselHalo =
    (
      1.0 -
      smoothstep(
        0.022,
        0.085,
        vesselDistance
      )
    ) *
    tissuePresence *
    tissueOuterFade;

  float vignette =
    1.0 -
    smoothstep(
      0.32,
      1.34,
      r
    );

  float blackout =
    0.92 +
    0.08 *
    sin(
      uTime*0.37 +
      r*7.0
    ) *
    smoothstep(
      0.55,
      1.25,
      r
    );

  col *=
    vignette *
    blackout;

  vec2 vesselTangent = normalize(
    vesselSample.zw +
    vec2(0.0001, 0.0001)
  );

  vec2 pxToUv =
    min(uRes.x, uRes.y) /
    uRes;

  float probeDistance =
    0.060 +
    0.020*assault;

  vec2 probeNear =
    vesselTangent *
    probeDistance *
    pxToUv;

  vec2 probeFar =
    vesselTangent *
    probeDistance *
    1.85 *
    pxToUv;

  float currentRope =
    ropeIntensity(
      inkA
    );

  float nearbyRope = max(
    max(
      ropeIntensity(
        texture(
          uTex,
          clamp(
            warpedUv + probeNear,
            vec2(0.001),
            vec2(0.999)
          )
        ).rgb
      ),
      ropeIntensity(
        texture(
          uTex,
          clamp(
            warpedUv - probeNear,
            vec2(0.001),
            vec2(0.999)
          )
        ).rgb
      )
    ),
    max(
      ropeIntensity(
        texture(
          uTex,
          clamp(
            warpedUv + probeFar,
            vec2(0.001),
            vec2(0.999)
          )
        ).rgb
      ),
      ropeIntensity(
        texture(
          uTex,
          clamp(
            warpedUv - probeFar,
            vec2(0.001),
            vec2(0.999)
          )
        ).rgb
      )
    )
  );

  // uTex already contains a short rope afterimage. Keep that causal conduction,
  // but weight the residue less heavily so branches do not settle into permanent
  // near-maximum luminosity once many ropes are circulating at once.
  float vesselCharge =
    smoothstep(
      0.060,
      0.255,
      max(
        currentRope,
        nearbyRope * 0.62
      )
    ) *
    tissuePresence *
    tissueOuterFade;

  float ropeCore =
    smoothstep(
      0.080,
      0.30,
      currentRope
    );

  float directIntersection =
    ropeCore *
    vesselCore;

  float junction =
    majorLine *
    minorLine *
    tissuePresence *
    tissueOuterFade;

  // Fine longitudinal variation breaks the remaining neon-tube uniformity.
  // It is fixed in tissue space, so the fibres look textured rather than as if
  // an animated noise layer were sliding over them.
  float fibrilTexture =
    0.82 +
    0.12*sin(
      dot(
        tissueSampleP,
        vesselTangent
      )*31.0 +
      dot(
        tissueSampleP,
        vec2(
          0.73,
          -0.41
        )
      )*7.0
    ) +
    0.06*sin(
      dot(
        tissueSampleP,
        vesselTangent
      )*67.0 +
      1.9
    );

  float branchGlow =
    vesselStructure *
    vesselCharge *
    clamp(
      fibrilTexture,
      0.64,
      1.08
    );

  float backlightGlow =
    vesselHalo *
    vesselCharge *
    (
      0.88 +
      0.12*fibrilTexture
    );

  float impactFlash =
    directIntersection *
    (
      0.80 +
      0.20*e
    );

  vec3 vesselShadow = vec3(
    0.016,
    0.003,
    0.005
  );

  vec3 vesselBlood = mix(
    vec3(0.44, 0.030, 0.024),
    vec3(0.92, 0.095, 0.050),
    0.18 + 0.30*cen
  );

  vec3 vesselHot = mix(
    vec3(0.92, 0.18, 0.070),
    vec3(1.00, 0.54, 0.16),
    0.20 + 0.22*cen
  );

  // Dormant tissue is deliberately almost absent. Its dark halo gives the
  // faintest suggestion of depth, but geometry is discovered primarily by
  // transient illumination.
  col = mix(
    col,
    vesselShadow,
    vesselHalo * 0.004
  );

  col +=
    vesselBlood *
    vesselStructure *
    (
      0.0008 +
      0.0014*assault +
      0.0008*e
    );

  // Torch-through-tissue response: illumination spreads a short distance along
  // the local branch and softly reveals the surrounding vessel wall.
  col +=
    vesselBlood *
    backlightGlow *
    (
      0.070 +
      0.070*assault
    );

  col +=
    vesselHot *
    branchGlow *
    (
      0.24 +
      0.18*assault +
      0.10*e
    );

  // Bifurcations hold a little more charge, like thicker vascular junctions.
  col +=
    vesselHot *
    junction *
    vesselCharge *
    (
      0.10 +
      0.12*assault
    );

  // Direct rope/vessel contact is the hottest local event.
  col +=
    mix(
      vec3(1.00, 0.30, 0.10),
      vec3(1.00, 0.72, 0.24),
      0.24 + 0.30*cen
    ) *
    impactFlash *
    (
      0.34 +
      0.30*e
    );

  fragColor = vec4(
    clamp(col, 0.0, 1.0),
    1.0
  );
}
`;

function createTex(gl: WebGL2RenderingContext, w: number, h: number) {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    w,
    h,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);

  return tex;
}

function createFbo(gl: WebGL2RenderingContext, tex: WebGLTexture) {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Failed to create framebuffer");

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return fbo;
}

function clearTex(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
  w: number,
  h: number,
) {
  // Deterministic blank history. The shader already supplies grain, so random
  // CPU-side bootstrap speckles only make stage recreation/offline starts vary.
  const data = new Uint8Array(w * h * 4);

  for (let i = 0; i < w * h; i++) {
    data[i * 4 + 3] = 255;
  }

  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texSubImage2D(
    gl.TEXTURE_2D,
    0,
    0,
    0,
    w,
    h,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    data,
  );
  gl.bindTexture(gl.TEXTURE_2D, null);
}

export function createOrbitalScriptTheme(): Theme {
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;

  let progInk: WebGLProgram | null = null;
  let progDraw: WebGLProgram | null = null;

  let texA: WebGLTexture | null = null;
  let texB: WebGLTexture | null = null;
  let fboA: WebGLFramebuffer | null = null;
  let fboB: WebGLFramebuffer | null = null;
  let ping = true;
  let lastTrackProgress01: number | null = null;
  let lastTimeSec: number | null = null;
  let simTimeSec: number | null = null;
  let simAccumulatorSec = 0;

  const simStepSec = 1 / 60;
  const maxSimStepsPerRender = 5;

  let simW = 0;
  let simH = 0;

  let uPrevI: WebGLUniformLocation | null = null;
  let uResI: WebGLUniformLocation | null = null;
  let uTimeI: WebGLUniformLocation | null = null;
  let uTrackProgressI: WebGLUniformLocation | null = null;
  let uEnergyI: WebGLUniformLocation | null = null;
  let uBassI: WebGLUniformLocation | null = null;
  let uMidI: WebGLUniformLocation | null = null;
  let uTrebleI: WebGLUniformLocation | null = null;
  let uCentroidI: WebGLUniformLocation | null = null;

  let uTexD: WebGLUniformLocation | null = null;
  let uResD: WebGLUniformLocation | null = null;
  let uTimeD: WebGLUniformLocation | null = null;
  let uTrackProgressD: WebGLUniformLocation | null = null;
  let uEnergyD: WebGLUniformLocation | null = null;
  let uBassD: WebGLUniformLocation | null = null;
  let uCentroidD: WebGLUniformLocation | null = null;

  function ensureSim(gl: WebGL2RenderingContext, w: number, h: number) {
    const targetW = Math.min(900, Math.max(380, Math.floor(w * 0.72)));
    const targetH = Math.min(900, Math.max(380, Math.floor(h * 0.72)));

    if (targetW === simW && targetH === simH && texA && texB && fboA && fboB) {
      return;
    }

    const previousTexA = texA;
    const previousTexB = texB;
    const previousFboA = fboA;
    const previousFboB = fboB;
    const previousW = simW;
    const previousH = simH;
    const previousSourceFbo = ping ? previousFboA : previousFboB;
    const previousReadFramebuffer = gl.getParameter(
      gl.READ_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const previousDrawFramebuffer = gl.getParameter(
      gl.DRAW_FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    const nextTexA = createTex(gl, targetW, targetH);
    const nextTexB = createTex(gl, targetW, targetH);
    const nextFboA = createFbo(gl, nextTexA);
    const nextFboB = createFbo(gl, nextTexB);

    if (previousSourceFbo && previousW > 0 && previousH > 0) {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousSourceFbo);

      for (const targetFbo of [nextFboA, nextFboB]) {
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, targetFbo);
        gl.blitFramebuffer(
          0,
          0,
          previousW,
          previousH,
          0,
          0,
          targetW,
          targetH,
          gl.COLOR_BUFFER_BIT,
          gl.NEAREST,
        );
      }

    } else {
      clearTex(gl, nextTexA, targetW, targetH);
      clearTex(gl, nextTexB, targetW, targetH);
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, previousReadFramebuffer);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, previousDrawFramebuffer);
    gl.viewport(
      previousViewport[0],
      previousViewport[1],
      previousViewport[2],
      previousViewport[3],
    );

    if (previousFboA) gl.deleteFramebuffer(previousFboA);
    if (previousFboB) gl.deleteFramebuffer(previousFboB);
    if (previousTexA) gl.deleteTexture(previousTexA);
    if (previousTexB) gl.deleteTexture(previousTexB);

    simW = targetW;
    simH = targetH;
    texA = nextTexA;
    texB = nextTexB;
    fboA = nextFboA;
    fboB = nextFboB;
    ping = true;
  }

  return {
    name: "orbital-script",

    init(gl) {
      tri = makeFullscreenTriangle(gl);
      progInk = createProgram(gl, VS, FS_INK);
      progDraw = createProgram(gl, VS, FS_DRAW);

      uPrevI = gl.getUniformLocation(progInk, "uPrev");
      uResI = gl.getUniformLocation(progInk, "uRes");
      uTimeI = gl.getUniformLocation(progInk, "uTime");
      uTrackProgressI = gl.getUniformLocation(progInk, "uTrackProgress");
      uEnergyI = gl.getUniformLocation(progInk, "uEnergy");
      uBassI = gl.getUniformLocation(progInk, "uBass");
      uMidI = gl.getUniformLocation(progInk, "uMid");
      uTrebleI = gl.getUniformLocation(progInk, "uTreble");
      uCentroidI = gl.getUniformLocation(progInk, "uCentroid");

      uTexD = gl.getUniformLocation(progDraw, "uTex");
      uResD = gl.getUniformLocation(progDraw, "uRes");
      uTimeD = gl.getUniformLocation(progDraw, "uTime");
      uTrackProgressD = gl.getUniformLocation(progDraw, "uTrackProgress");
      uEnergyD = gl.getUniformLocation(progDraw, "uEnergy");
      uBassD = gl.getUniformLocation(progDraw, "uBass");
      uCentroidD = gl.getUniformLocation(progDraw, "uCentroid");
    },

    render(gl, opts) {
      if (!tri || !progInk || !progDraw) return;

      ensureSim(gl, opts.width, opts.height);
      if (!texA || !texB || !fboA || !fboB) return;

      const audio = opts.audio;
      const energy = audio.energy ?? 0;
      const bass = audio.bass ?? 0;
      const mid = audio.mid ?? 0;
      const treble = audio.treble ?? 0;
      const centroid = audio.centroid ?? 0;
      const trackProgress01 = Math.max(
        0,
        Math.min(1, opts.trackProgress01 ?? 0),
      );

      // Feedback is intentionally short-term memory, not recording narrative.
      // A meaningful seek must discard residue from the previous chapter so the
      // deterministic HURTLE state can recompose immediately.
      const progressDelta =
        lastTrackProgress01 == null
          ? 0
          : trackProgress01 - lastTrackProgress01;

      const didSeek =
        lastTrackProgress01 != null &&
        (progressDelta < -0.005 || Math.abs(progressDelta) > 0.035);

      let elapsedSec =
        lastTimeSec == null ? simStepSec : opts.time - lastTimeSec;

      if (!Number.isFinite(elapsedSec) || elapsedSec < 0) {
        elapsedSec = simStepSec;
      }

      elapsedSec = Math.min(simStepSec * maxSimStepsPerRender, elapsedSec);
      lastTimeSec = opts.time;

      if (didSeek) {
        clearTex(gl, texA, simW, simH);
        clearTex(gl, texB, simW, simH);
        ping = true;
        simAccumulatorSec = simStepSec;
        simTimeSec = opts.time - simStepSec;
      } else {
        if (simTimeSec == null) {
          simTimeSec = opts.time - simStepSec;
        }
        simAccumulatorSec = Math.min(
          simAccumulatorSec + elapsedSec,
          simStepSec * maxSimStepsPerRender,
        );
      }

      lastTrackProgress01 = trackProgress01;

      const previousFbo = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;

      const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

      gl.useProgram(progInk);
      gl.bindVertexArray(tri.vao);

      gl.uniform1i(uPrevI, 0);
      gl.uniform2f(uResI, simW, simH);
      gl.uniform1f(uTrackProgressI, trackProgress01);
      gl.uniform1f(uEnergyI, energy);
      gl.uniform1f(uBassI, bass);
      gl.uniform1f(uMidI, mid);
      gl.uniform1f(uTrebleI, treble);
      gl.uniform1f(uCentroidI, centroid);

      let simSteps = Math.min(
        maxSimStepsPerRender,
        Math.floor((simAccumulatorSec + 1e-9) / simStepSec),
      );

      while (simSteps > 0) {
        simTimeSec += simStepSec;

        const src = ping ? texA : texB;
        const dstFbo = ping ? fboB : fboA;

        gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
        gl.viewport(0, 0, simW, simH);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src);
        gl.uniform1f(uTimeI, simTimeSec);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        ping = !ping;
        simAccumulatorSec = Math.max(0, simAccumulatorSec - simStepSec);
        simSteps -= 1;
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFbo);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3],
      );

      gl.useProgram(progDraw);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping ? texA : texB);

      gl.uniform1i(uTexD, 0);
      gl.uniform2f(uResD, opts.width, opts.height);
      gl.uniform1f(uTimeD, opts.time);
      gl.uniform1f(uTrackProgressD, trackProgress01);
      gl.uniform1f(uEnergyD, energy);
      gl.uniform1f(uBassD, bass);
      gl.uniform1f(uCentroidD, centroid);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);
    },

    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf);
      if (tri?.vao) gl.deleteVertexArray(tri.vao);
      tri = null;

      if (fboA) gl.deleteFramebuffer(fboA);
      if (fboB) gl.deleteFramebuffer(fboB);
      if (texA) gl.deleteTexture(texA);
      if (texB) gl.deleteTexture(texB);

      fboA = null;
      fboB = null;
      texA = null;
      texB = null;
      simW = 0;
      simH = 0;
      lastTrackProgress01 = null;
      lastTimeSec = null;
      simTimeSec = null;
      simAccumulatorSec = 0;

      if (progInk) gl.deleteProgram(progInk);
      if (progDraw) gl.deleteProgram(progDraw);

      progInk = null;
      progDraw = null;
    },
  };
}
