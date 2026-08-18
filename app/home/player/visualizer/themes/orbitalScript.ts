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

// Nearest-cell coordinates for a regular staggered hexagonal lattice.
// The same screen-space lattice is used later in the draw pass so the visible
// chamber walls and the rope refraction remain spatially coherent.
vec2 hexCellLocal(vec2 p, out vec2 centre){
  const vec2 spacing = vec2(1.0, 1.73205080757);
  vec2 halfSpacing = spacing * 0.5;

  vec2 a = mod(p, spacing) - halfSpacing;
  vec2 b = mod(p - halfSpacing, spacing) - halfSpacing;

  if(dot(a, a) < dot(b, b)){
    centre = p - a;
    return a;
  }

  centre = p - b;
  return b;
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
  vec3 ink = mix(prevA, prevB, 0.46);

  // Keep a short bodily afterimage, but make the freshly generated geometry
  // dominate quickly enough that seeks and stage recreation recompose cleanly.
  float decay =
    0.984 -
    0.006*tre +
    0.002*bass -
    0.003*assault;

  ink *= clamp(decay, 0.958, 0.990);

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

  // Peripheral honeycomb membrane.
  //
  // Compute the chamber only once per fragment, outside the expensive rope
  // loops. The visible lattice stays screen/world-stable while the rope-distance
  // query is locally refracted within each chamber. As a ring grows outward it
  // therefore acquires small discontinuous kinks from cell to cell rather than
  // carrying a decorative hex pattern around with it.
  const float honeyScale = 5.20;

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

  vec2 honeySampleP =
    fieldDir * (
      shellRad * (1.0 + 0.18*shellWrap)
    ) +
    fieldTan * (
      shellTan * (1.0 - 0.12*shellWrap)
    );

  honeySampleP +=
    fieldDir *
    (
      0.050 *
      shellWrap *
      fieldRadius *
      fieldRadius
    );

  vec2 honeyCentre;
  vec2 honeyLocal = hexCellLocal(
    honeySampleP * honeyScale,
    honeyCentre
  );

  vec2 honeyAbs = abs(honeyLocal);

  float honeyMetric = max(
    honeyAbs.x,
    0.5*honeyAbs.x +
      0.86602540378*honeyAbs.y
  );

  float honeyPresence =
    0.025 +
    0.975 * smoothstep(
      0.34,
      1.02,
      fieldRadius
    );

  float chamberSeed = hash12(
    honeyCentre * 0.73 +
    vec2(11.7, -4.9)
  );

  float chamberSeedB = hash12(
    honeyCentre.yx * 1.11 +
    vec2(-7.3, 5.2)
  );

  float chamberResponse =
    honeyPresence *
    (
      0.30 +
      0.70 * smoothstep(
        0.10,
        0.48,
        honeyMetric
      )
    );

  float chamberOccupancy =
    honeyPresence *
    smoothstep(
      0.08,
      0.44,
      honeyMetric
    );

  float chamberAngle =
    (
      chamberSeed - 0.5
    ) *
    (
      0.11 +
      0.12*assault
    ) *
    chamberResponse;

  vec2 warpedHoneyLocal = rot(
    honeyLocal,
    chamberAngle
  );

  float chamberStretch =
    1.0 +
    (
      chamberSeedB - 0.5
    ) *
    (
      0.075 +
      0.055*assault
    ) *
    chamberResponse;

  warpedHoneyLocal.x *= chamberStretch;
  warpedHoneyLocal.y /= max(
    chamberStretch,
    0.86
  );

  float chamberWall =
    smoothstep(
      0.18,
      0.48,
      honeyMetric
    );

  vec2 boundaryNudge =
    normalize(warpedHoneyLocal + vec2(0.0001, 0.0001)) *
    (
      0.028 +
      0.032*assault
    ) *
    chamberWall *
    chamberOccupancy;

  warpedHoneyLocal += boundaryNudge;

  vec2 warpedFieldP =
    (
      honeyCentre +
      warpedHoneyLocal
    ) /
    honeyScale;

  vec2 ropeQuery =
    q +
    (
      warpedFieldP -
      fieldP
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

    vec3 bloodChamber = mix(
      vec3(0.22, 0.020, 0.024),
      vec3(0.70, 0.055, 0.034),
      0.30 + 0.18*cen
    );

    float blooding =
      chamberOccupancy *
      (
        0.38 +
        0.40*assault +
        0.12*e
      );

    strokeCol = mix(
      strokeCol,
      bloodChamber,
      clamp(blooding, 0.0, 1.0)
    );

    float latticeBrush =
      chamberOccupancy *
      smoothstep(
        0.12,
        0.46,
        body
      );

    strokeCol +=
      vec3(0.10, 0.016, 0.012) *
      latticeBrush *
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

vec2 hexCellLocal(vec2 p, out vec2 centre){
  const vec2 spacing = vec2(1.0, 1.73205080757);
  vec2 halfSpacing = spacing * 0.5;

  vec2 a = mod(p, spacing) - halfSpacing;
  vec2 b = mod(p - halfSpacing, spacing) - halfSpacing;

  if(dot(a, a) < dot(b, b)){
    centre = p - a;
    return a;
  }

  centre = p - b;
  return b;
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

  // The same hexagonal membrane becomes materially visible toward the edges.
  // Keep the centre nearly clear so the hurtling tunnel remains the focal event.
  const float honeyScale = 5.20;

  vec2 shellDir = normalize(px + vec2(0.0001, 0.0001));
  vec2 shellTan = vec2(-shellDir.y, shellDir.x);

  float shellWrap =
    smoothstep(
      0.26,
      1.06,
      r
    );

  float shellRad = dot(px, shellDir);
  float shellLat = dot(px, shellTan);

  vec2 honeySampleP =
    shellDir * (
      shellRad * (1.0 + 0.18*shellWrap)
    ) +
    shellTan * (
      shellLat * (1.0 - 0.12*shellWrap)
    );

  honeySampleP +=
    shellDir *
    (
      0.050 *
      shellWrap *
      r *
      r
    );

  vec2 honeyCentre;
  vec2 honeyLocal = hexCellLocal(
    honeySampleP * honeyScale,
    honeyCentre
  );

  vec2 honeyAbs = abs(honeyLocal);

  float honeyMetric = max(
    honeyAbs.x,
    0.5*honeyAbs.x +
      0.86602540378*honeyAbs.y
  );

  float honeyEdgeDistance =
    0.5 -
    honeyMetric;

  float honeyAa =
    fwidth(honeyMetric) *
    1.20;

  float honeyLine =
    1.0 -
    smoothstep(
      0.018 + honeyAa,
      0.090 + honeyAa,
      honeyEdgeDistance
    );

  float honeyCore =
    1.0 -
    smoothstep(
      0.050 + honeyAa,
      0.118 + honeyAa,
      honeyEdgeDistance
    );

  float honeyPresence =
    0.004 +
    0.996 * smoothstep(
      0.40,
      1.06,
      r
    );

  float honeyOuterFade =
    1.0 -
    smoothstep(
      1.28,
      1.62,
      r
    );

  float honeyStructure =
    honeyLine *
    honeyPresence *
    honeyOuterFade;

  float honeyOcclusion =
    honeyCore *
    honeyPresence *
    honeyOuterFade;

  float vignette = smoothstep(
    1.34,
    0.32,
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

  vec3 honeyShadow = vec3(
    0.014,
    0.004,
    0.006
  );

  vec3 honeyEdge = mix(
    vec3(0.18, 0.030, 0.036),
    vec3(0.58, 0.105, 0.095),
    0.28 + 0.34*assault
  );

  vec3 honeyGlint = mix(
    vec3(0.32, 0.060, 0.050),
    vec3(0.82, 0.21, 0.16),
    0.18 + 0.30*cen
  );

  float cavityShade =
    honeyPresence *
    honeyOuterFade *
    shellWrap;

  float cavityRim =
    honeyCore *
    honeyPresence *
    honeyOuterFade *
    (
      0.42 +
      0.58 * shellWrap
    );

  float wallMetricA = abs(
    0.5 - abs(honeyLocal.x)
  );

  float wallMetricB = abs(
    0.5 - abs(
      0.5*honeyLocal.x +
      0.86602540378*honeyLocal.y
    )
  );

  float wallMetricC = abs(
    0.5 - abs(
      -0.5*honeyLocal.x +
      0.86602540378*honeyLocal.y
    )
  );

  float wallMaskA =
    1.0 -
    smoothstep(
      0.008 + honeyAa,
      0.034 + honeyAa,
      wallMetricA
    );

  float wallMaskB =
    1.0 -
    smoothstep(
      0.008 + honeyAa,
      0.034 + honeyAa,
      wallMetricB
    );

  float wallMaskC =
    1.0 -
    smoothstep(
      0.008 + honeyAa,
      0.034 + honeyAa,
      wallMetricC
    );

  float ropeCore = smoothstep(
    0.075,
    0.30,
    ropeIntensity(inkA)
  );

  float directIntersection =
    ropeCore *
    max(
      wallMaskA,
      max(
        wallMaskB,
        wallMaskC
      )
    ) *
    honeyPresence *
    honeyOuterFade;

  // Probe a short distance in both directions along each wall family. If a
  // rope has just intersected that conductor nearby, the travelling pulse on
  // this pixel is allowed to ignite. This makes the charge visibly causal:
  // rope strike -> hot node -> current travelling away along the scaffold.
  vec2 pxToUv =
    min(uRes.x, uRes.y) /
    uRes;

  float probeDistance =
    0.090 +
    0.018*assault;

  vec2 wallDirA = vec2(0.0, 1.0);
  vec2 wallDirB = vec2(0.86602540378, -0.5);
  vec2 wallDirC = vec2(0.86602540378, 0.5);

  vec2 probeA = wallDirA * probeDistance * pxToUv;
  vec2 probeB = wallDirB * probeDistance * pxToUv;
  vec2 probeC = wallDirC * probeDistance * pxToUv;

  float nearbyRopeA = max(
    ropeIntensity(
      texture(
        uTex,
        clamp(
          warpedUv + probeA,
          vec2(0.001),
          vec2(0.999)
        )
      ).rgb
    ),
    ropeIntensity(
      texture(
        uTex,
        clamp(
          warpedUv - probeA,
          vec2(0.001),
          vec2(0.999)
        )
      ).rgb
    )
  );

  float nearbyRopeB = max(
    ropeIntensity(
      texture(
        uTex,
        clamp(
          warpedUv + probeB,
          vec2(0.001),
          vec2(0.999)
        )
      ).rgb
    ),
    ropeIntensity(
      texture(
        uTex,
        clamp(
          warpedUv - probeB,
          vec2(0.001),
          vec2(0.999)
        )
      ).rgb
    )
  );

  float nearbyRopeC = max(
    ropeIntensity(
      texture(
        uTex,
        clamp(
          warpedUv + probeC,
          vec2(0.001),
          vec2(0.999)
        )
      ).rgb
    ),
    ropeIntensity(
      texture(
        uTex,
        clamp(
          warpedUv - probeC,
          vec2(0.001),
          vec2(0.999)
        )
      ).rgb
    )
  );

  float sourceA =
    wallMaskA *
    max(
      directIntersection,
      smoothstep(
        0.070,
        0.28,
        nearbyRopeA
      ) * 0.86
    ) *
    honeyPresence *
    honeyOuterFade;

  float sourceB =
    wallMaskB *
    max(
      directIntersection,
      smoothstep(
        0.070,
        0.28,
        nearbyRopeB
      ) * 0.86
    ) *
    honeyPresence *
    honeyOuterFade;

  float sourceC =
    wallMaskC *
    max(
      directIntersection,
      smoothstep(
        0.070,
        0.28,
        nearbyRopeC
      ) * 0.86
    ) *
    honeyPresence *
    honeyOuterFade;

  float wallPulseA =
    wallMaskA *
    pow(
      max(
        0.0,
        sin(
          uTime * 10.4 +
          honeyCentre.y * 3.1 +
          honeyLocal.y * 8.8
        )
      ),
      7.0
    );

  float wallPulseB =
    wallMaskB *
    pow(
      max(
        0.0,
        sin(
          uTime * 9.7 -
          honeyCentre.x * 2.9 +
          (
            0.5*honeyLocal.x -
            0.86602540378*honeyLocal.y
          ) * 9.4
        )
      ),
      7.0
    );

  float wallPulseC =
    wallMaskC *
    pow(
      max(
        0.0,
        sin(
          uTime * 10.9 +
          honeyCentre.x * 2.4 +
          (
            0.5*honeyLocal.x +
            0.86602540378*honeyLocal.y
          ) * 8.6
        )
      ),
      7.0
    );

  float synapticCharge =
    max(
      wallPulseA * sourceA,
      max(
        wallPulseB * sourceB,
        wallPulseC * sourceC
      )
    ) *
    (
      0.78 +
      0.22 * assault
    );

  float impactFlash =
    directIntersection *
    (
      0.70 +
      0.30*e
    );

  float conduitGlow =
    honeyStructure *
    max(
      directIntersection * 0.28,
      synapticCharge * 0.42
    );

  vec3 chargeGlow = mix(
    vec3(0.54, 0.070, 0.052),
    vec3(1.00, 0.34, 0.16),
    0.14 + 0.28*cen
  );

  vec3 sparkCore = mix(
    vec3(0.95, 0.22, 0.10),
    vec3(1.00, 0.58, 0.18),
    0.22 + 0.18*cen
  );

  // Keep the shell physically static. The motion should read as electrical
  // activity travelling through the fixed superstructure rather than the
  // hexagonal walls themselves wobbling.
  col = mix(
    col,
    honeyShadow,
    cavityShade *
      (
        0.018 +
        0.030*shellWrap
      )
  );

  col = mix(
    col,
    honeyShadow,
    honeyOcclusion *
      (
        0.080 +
        0.090*assault +
        0.050*shellWrap
      )
  );

  col +=
    honeyEdge *
    honeyStructure *
    (
      0.034 +
      0.050*assault +
      0.014*e +
      0.012*shellWrap
    );

  col +=
    honeyGlint *
    honeyCore *
    honeyPresence *
    honeyOuterFade *
    (
      0.010 +
      0.022*e +
      0.014*shellWrap
    );

  col +=
    chargeGlow *
    conduitGlow *
    (
      0.045 +
      0.070*e
    );

  col +=
    chargeGlow *
    honeyStructure *
    synapticCharge *
    (
      0.12 +
      0.16*assault
    );

  // The actual contact point gets a hotter, slightly iridescent node flash;
  // the moving current that follows is narrower and more directional.
  col +=
    sparkCore *
    honeyCore *
    impactFlash *
    (
      0.22 +
      0.26*e
    );

  col +=
    mix(
      vec3(1.00, 0.72, 0.26),
      vec3(0.86, 0.42, 1.00),
      0.20 + 0.34*cen
    ) *
    honeyCore *
    impactFlash *
    impactFlash *
    0.16;

  col +=
    sparkCore *
    honeyCore *
    synapticCharge *
    (
      0.11 +
      0.14*e
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

    if (fboA) gl.deleteFramebuffer(fboA);
    if (fboB) gl.deleteFramebuffer(fboB);
    if (texA) gl.deleteTexture(texA);
    if (texB) gl.deleteTexture(texB);

    simW = targetW;
    simH = targetH;

    texA = createTex(gl, simW, simH);
    texB = createTex(gl, simW, simH);
    fboA = createFbo(gl, texA);
    fboB = createFbo(gl, texB);

    clearTex(gl, texA, simW, simH);
    clearTex(gl, texB, simW, simH);

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

      if (didSeek) {
        clearTex(gl, texA, simW, simH);
        clearTex(gl, texB, simW, simH);
        ping = true;
      }

      lastTrackProgress01 = trackProgress01;

      const src = ping ? texA : texB;
      const dstFbo = ping ? fboB : fboA;

      const previousFbo = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;

      const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

      gl.bindFramebuffer(gl.FRAMEBUFFER, dstFbo);
      gl.viewport(0, 0, simW, simH);
      gl.useProgram(progInk);
      gl.bindVertexArray(tri.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, src);

      gl.uniform1i(uPrevI, 0);
      gl.uniform2f(uResI, simW, simH);
      gl.uniform1f(uTimeI, opts.time);
      gl.uniform1f(uTrackProgressI, trackProgress01);
      gl.uniform1f(uEnergyI, energy);
      gl.uniform1f(uBassI, bass);
      gl.uniform1f(uMidI, mid);
      gl.uniform1f(uTrebleI, treble);
      gl.uniform1f(uCentroidI, centroid);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFbo);
      gl.viewport(
        previousViewport[0],
        previousViewport[1],
        previousViewport[2],
        previousViewport[3],
      );

      gl.useProgram(progDraw);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, ping ? texB : texA);

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

      ping = !ping;
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

      if (progInk) gl.deleteProgram(progInk);
      if (progDraw) gl.deleteProgram(progDraw);

      progInk = null;
      progDraw = null;
    },
  };
}
