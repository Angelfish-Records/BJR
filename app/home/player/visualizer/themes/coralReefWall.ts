// web/app/home/player/visualizer/themes/coralReefWall.ts
// Bioluminescent Coral Reef Wall
// A living vertical reef face: hard skeletal ridges, glowing polyps,
// deeper fixed reef silhouettes, and audio waves passing through tissue.

import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uAge;
uniform float uEnergy;

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

  for (int i = 0; i < 6; i++) {
    value += amplitude * noise(p);
    p = mat2(1.58, -1.11, 1.11, 1.58) * p;
    amplitude *= 0.5;
  }

  return value;
}

float ridged(vec2 p) {
  float value = 0.0;
  float amplitude = 0.62;
  float frequency = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * frequency);
    n = 1.0 - abs(2.0 * n - 1.0);
    value += amplitude * n;

    frequency *= 2.03;
    amplitude *= 0.55;
    p = mat2(0.82, -0.58, 0.58, 0.82) * p;
  }

  return value;
}

float cellularPolyp(vec2 p, float density) {
  vec2 grid = floor(p * density);
  vec2 cell = fract(p * density) - 0.5;

  float rnd = hash(grid);
  vec2 offset = vec2(
    hash(grid + 17.2) - 0.5,
    hash(grid + 43.7) - 0.5
  ) * 0.42;

  float radius = mix(0.18, 0.34, hash(grid + 8.3));
  float body = smoothstep(radius, radius * 0.25, length(cell - offset));
  float keep = smoothstep(0.34, 0.82, rnd);

  return body * keep;
}

float travellingWave(vec2 p, float t, float e) {
  float surface = p.y * 0.85 + fbm(p * 0.55) * 0.55 + sin(p.x * 2.2) * 0.14;
  float phase = fract(surface - t * (0.16 + 0.54 * e));
  float waveA = smoothstep(0.060, 0.0, abs(phase - 0.52));

  float phaseB = fract(surface * 1.7 + 0.28 - t * (0.10 + 0.36 * e));
  float waveB = smoothstep(0.035, 0.0, abs(phaseB - 0.50));

  return waveA + waveB * 0.55;
}

void main() {
  float time = max(uTime, 0.0);
  float age = min(max(uAge, 0.0), 720.0);
  float t = time * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  float ageProgress = 1.0 - exp(-age * 0.0038);
  float approach = 1.0 + 1.35 * ageProgress;

  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);

  // Stable deep layer: fixed against the camera, so the foreground can grow
  // toward the viewer without the whole image feeling like a flat scrolling map.
  vec2 deepP = p * 1.8;
  float deepBranches = smoothstep(
    0.72,
    1.10,
    ridged(vec2(deepP.x * 1.15, deepP.y * 1.6 + fbm(deepP * 0.7)))
  );
  float deepMask = smoothstep(1.25, 0.20, length(p));
  vec3 col = vec3(0.006, 0.012, 0.020);
  col += vec3(0.018, 0.070, 0.088) * deepBranches * deepMask;

  vec2 wall = p * approach;
  wall.y += t * 0.045;

  // Cartesian wall that becomes increasingly radial as the camera sinks in.
  float r = length(wall);
  float a = atan(wall.y, wall.x);
  vec2 radialized = vec2(a / PI * 1.25, log(r + 1.18) * 1.55);
  float radialMix = 0.42 * ageProgress;
  vec2 reef = mix(wall, radialized, radialMix);

  float surfaceWarp = fbm(reef * 0.78 + vec2(t * 0.08, -t * 0.03));
  reef += vec2(
    fbm(reef * 1.2 + vec2(3.1, t * 0.05)),
    fbm(reef * 1.2 + vec2(-2.4, -t * 0.04))
  ) * (0.035 + 0.035 * ageProgress);

  float skeletonNoise = ridged(vec2(
    reef.x * 1.75 + surfaceWarp * 0.55,
    reef.y * 2.15
  ));

  float verticalRibs = 1.0 - smoothstep(
    0.055,
    0.22,
    abs(fract(reef.x * (5.5 + 3.5 * ageProgress) + fbm(reef * 0.65) * 0.55) - 0.5)
  );

  float branchLace = smoothstep(0.68, 1.08, skeletonNoise + verticalRibs * 0.34);
  branchLace *= smoothstep(1.65, 0.16, length(p));

  float polypDensity = 12.0 + 19.0 * ageProgress;
  float polypsA = cellularPolyp(reef + vec2(surfaceWarp * 0.22, 0.0), polypDensity);
  float polypsB = cellularPolyp(reef * 1.42 + vec2(8.1, -3.4), polypDensity * 0.72) * 0.62;
  float polyps = max(polypsA, polypsB);
  polyps *= smoothstep(1.45, 0.10, length(p));

  float wave = travellingWave(reef, t, e);
  float subsurface = smoothstep(
    0.42,
    0.96,
    fbm(reef * 1.1 + vec2(-t * 0.06, t * 0.04))
  );

  float glowPulse = wave * (0.30 + 0.95 * e);
  float softTissue = smoothstep(0.36, 0.92, fbm(reef * 2.2 + skeletonNoise));

  vec3 bone = vec3(0.24, 0.22, 0.18);
  vec3 shadowTeal = vec3(0.02, 0.16, 0.18);
  vec3 reefGreen = vec3(0.07, 0.52, 0.42);
  vec3 cyanGlow = vec3(0.22, 0.92, 0.88);
  vec3 blueGlow = vec3(0.12, 0.42, 0.98);
  vec3 coralPink = vec3(0.95, 0.30, 0.48);
  vec3 pearl = vec3(0.82, 0.98, 0.88);

  float colourField = fbm(reef * 0.9 + vec2(t * 0.03, -t * 0.02));
  vec3 livingColour = mix(reefGreen, cyanGlow, smoothstep(0.22, 0.72, colourField));
  livingColour = mix(livingColour, coralPink, smoothstep(0.72, 1.04, colourField + polyps * 0.18));

  col += shadowTeal * softTissue * 0.18;
  col += bone * branchLace * (0.22 + 0.24 * ageProgress);
  col += livingColour * polyps * (0.32 + 0.32 * ageProgress);
  col += cyanGlow * polyps * glowPulse * 0.70;
  col += blueGlow * subsurface * wave * (0.10 + 0.34 * e);
  col += pearl * branchLace * wave * (0.06 + 0.18 * e);

  // Sparse drifting microorganisms. The hashed grid now determines only
  // placement and character; each occupied cell contains a soft organic body
  // rather than illuminating the whole square.
  float microbeDensity = 58.0 + 32.0 * ageProgress;
  vec2 microbeUv = (reef + 1.2) * microbeDensity;
  vec2 microbeId = floor(microbeUv);
  vec2 microbeCell = fract(microbeUv) - 0.5;

  float microbeSeed = hash(microbeId);

  vec2 microbeOffset = vec2(
    hash(microbeId + 17.2),
    hash(microbeId + 43.7)
  ) - 0.5;

  microbeOffset *= 0.44;

  float driftPhase =
    t * (0.34 + 0.38 * hash(microbeId + 29.1))
    + microbeSeed * PI * 2.0;

  microbeOffset += vec2(
    sin(driftPhase),
    cos(driftPhase * 0.83)
  ) * 0.052;

  vec2 microbeDelta = microbeCell - microbeOffset;

  float microbeAngle = hash(microbeId + 71.3) * PI * 2.0;
  float microbeSin = sin(microbeAngle);
  float microbeCos = cos(microbeAngle);

  vec2 microbeLocal = vec2(
    microbeCos * microbeDelta.x + microbeSin * microbeDelta.y,
    -microbeSin * microbeDelta.x + microbeCos * microbeDelta.y
  );

  // Uneven elliptical bodies prevent the field from reading as dots or stars.
  float microbeAspect = mix(
    1.15,
    2.15,
    hash(microbeId + 91.6)
  );

  microbeLocal.x *= microbeAspect;

  float microbeTheta = atan(microbeLocal.y, microbeLocal.x);
  float edgeWobble = 1.0 + 0.11 * sin(
    microbeTheta * 3.0
      + driftPhase
      + hash(microbeId + 12.8) * PI * 2.0
  );

  float microbeDistance = length(microbeLocal) / edgeWobble;
  float microbeRadius = mix(
    0.095,
    0.190,
    hash(microbeId + 8.3)
  );

  float microbeBody = 1.0 - smoothstep(
    microbeRadius * 0.38,
    microbeRadius,
    microbeDistance
  );

  float microbeHalo = 1.0 - smoothstep(
    microbeRadius,
    microbeRadius * 2.45,
    microbeDistance
  );

  // Occupancy remains spatially stable. Energy changes luminosity rather
  // than causing organisms to appear and disappear on every transient.
  float microbeKeep = smoothstep(
    0.970,
    0.995,
    microbeSeed
  );

  float microbeDepthMask = smoothstep(
    1.4,
    0.18,
    length(p)
  );

  float microorganisms =
    microbeKeep
    * microbeDepthMask
    * (microbeBody + microbeHalo * 0.28);

  vec3 microorganismColour = mix(
    vec3(0.18, 0.66, 0.58),
    vec3(0.34, 0.98, 0.88),
    microbeBody
  );

  col += microorganismColour
    * microorganisms
    * (0.08 + 0.26 * wave + 0.16 * e);

  float foregroundBloom = smoothstep(0.72, 1.0, branchLace + polyps * 0.42);
  col += livingColour * foregroundBloom * ageProgress * 0.08;

  float depthShade = smoothstep(1.42, 0.16, length(p));
  col *= 0.50 + 0.80 * depthShade;

  float vig = smoothstep(1.34, 0.30, length(p));
  col *= 0.62 + 0.64 * vig;

  col *= 0.90 + 0.22 * e;

  fragColor = vec4(col, 1.0);
}
`;

function getThemeAgeSeconds(startedAtMs: number): number {
  if (typeof performance === "undefined") return 0;
  return (performance.now() - startedAtMs) / 1000;
}

export function createCoralReefWallTheme(): Theme {
  const startedAtMs =
    typeof performance === "undefined" ? 0 : performance.now();

  return createSinglePassTheme({
    name: "coral-reef-wall",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uAge",
        getValue: () => getThemeAgeSeconds(startedAtMs),
      },
    ],
  });
}
