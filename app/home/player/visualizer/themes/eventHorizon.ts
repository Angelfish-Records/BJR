// web/app/home/player/visualizer/themes/eventHorizon.ts
// gorgeous and as-advertised, probably needs to be a bit more squashed in shape and progressively zoom closer for intensity
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
// Radial compression field: gravitational lensing, accretion filaments, singularity pulse.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uTrackProgress;
uniform float uEnergy;

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
    p = mat2(1.61, -1.19, 1.19, 1.61) * p;
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

    frequency *= 2.06;
    amplitude *= 0.55;
    p = mat2(0.83, -0.56, 0.56, 0.83) * p;
  }

  return value;
}

mat2 rot(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}

float band(float value, float centre, float innerWidth, float outerWidth) {
  return 1.0 - smoothstep(
    innerWidth,
    outerWidth,
    abs(value - centre)
  );
}

void main() {
  float time = max(uTime, 0.0);
  float trackProgress = clamp(uTrackProgress, 0.0, 1.0);
  float journey = trackProgress * trackProgress * (3.0 - 2.0 * trackProgress);
  float t = time * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // Whole-track narrative: the viewer should feel as though they are
  // falling into the black hole. In this coordinate system, that means the
  // scene scale must decrease over the life of the track so the hole grows.
  float cameraScale = mix(1.0, 0.54, journey);

  vec2 viewP = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec2 cameraOffset = vec2(
    0.0,
    mix(0.012, 0.002, journey)
  );

  vec2 p = (viewP - cameraOffset) * cameraScale;

  // The event horizon remains spatially fixed; the apparent descent comes from
  // camera ingress and framing rather than a travelling singularity.
  vec2 d = p;

  // Slightly more oblate later in the fall, helping the approach feel deeper
  // without flattening the system into an eye-shaped graphic.
  float oblateness = mix(1.18, 1.28, journey);
  vec2 orbital = vec2(d.x, d.y * oblateness);

  float r = length(orbital);
  float a = atan(orbital.y, orbital.x);

  float horizonRadius = 0.206;
  float horizonMask = 1.0 - smoothstep(
    horizonRadius,
    horizonRadius + 0.026,
    r
  );

  float umbraMask = 1.0 - smoothstep(0.082, 0.112, r);

  // Structural lensing should feel physically continuous rather than music-
  // driven. Audio will brighten and energise the system later instead.
  float pull = 0.64;
  float lens = 1.0 / (1.0 + pull * 2.35 / (0.13 + r * 2.25));
  float swirl = t * 1.42 + 1.32 / (0.18 + r);

  vec2 q = rot(swirl * (1.0 - smoothstep(0.06, 1.18, r))) * orbital;
  q *= 1.0 + 0.88 * lens;

  // Keep the main luminous ring stable; its energy should read through
  // brightness and surrounding activity rather than large shape changes.
  float ringRadius = 0.366 + 0.006 * sin(t * 1.10);
  float ringWidth = 0.020;
  float ring = band(r, ringRadius, ringWidth, 0.108);

  float diskNoise = ridged(
    vec2(a * 2.15, r * 3.95)
      + vec2(t * 0.72, -t * 0.28)
  );

  float ringMatter = ring * smoothstep(0.34, 0.97, diskNoise);

  float filaments = ridged(
    q * 2.30 + vec2(t * 0.44, -t * 0.31)
  );

  filaments = smoothstep(0.53 - 0.10 * e, 0.97, filaments);
  filaments *= 1.0 - smoothstep(0.16, 1.20, r);

  float corona = 1.0 - smoothstep(0.20, 0.74, r);
  corona *= smoothstep(
    0.30,
    0.94,
    fbm(q * 3.20 + vec2(-t, t * 0.60))
  );
  corona *= 1.0 - horizonMask;

  // ---------------------------------------------------------------------------
  // Observer-facing accretion disc.
  //
  // The structure should read as a near side-on disc plane protruding toward
  // the viewer: the front arc is visibly thicker, while the more distant back
  // shoulders are thinner and stay close to the main arc rather than ballooning
  // upward like a frontal oval. So flatten the ellipse strongly, preserve the
  // settled front overlap on the central shadow, and shorten the shoulder run.
  // ---------------------------------------------------------------------------

  float discHalfWidth = ringRadius * 1.66;
  float discHalfHeight = mix(0.118, 0.102, journey);
  float discCentreY = mix(0.070, 0.076, journey);

  vec2 discSpace = vec2(
    d.x / discHalfWidth,
    (d.y - discCentreY) / discHalfHeight
  );

  float discRadius = length(discSpace);
  float discAngle = atan(discSpace.y, discSpace.x);

  // Approximate the ellipse's signed distance in display space so the visible
  // near-side branch inherits the same apparent thickness grammar as the ring.
  vec2 discGradient = vec2(
    discSpace.x / discHalfWidth,
    discSpace.y / discHalfHeight
  );

  float discDistance = abs(discRadius - 1.0) / max(
    length(discGradient),
    0.0001
  );

  float discTexture = ridged(
    vec2(
      discAngle * 1.90,
      discRadius * 3.66
    ) + vec2(t * 0.60, -t * 0.19)
  );

  float discTextureMatter = smoothstep(
    0.44,
    0.96,
    discTexture
  );

  const float HALF_PI = 1.57079632679;
  float discArcCenter = HALF_PI;
  float frontArcDistance = abs(atan(
    sin(discAngle - discArcCenter),
    cos(discAngle - discArcCenter)
  ));

  // The front of the disc is the nearest part, so let it stay visibly thicker.
  float frontOuterWidth = mix(
    0.104,
    0.074,
    smoothstep(0.0, HALF_PI, frontArcDistance)
  );

  float discFrontBand = 1.0 - smoothstep(
    ringWidth * 0.90,
    frontOuterWidth,
    discDistance
  );

  float discArcMask = 1.0 - smoothstep(
    HALF_PI,
    HALF_PI + 0.060,
    frontArcDistance
  );

  float discFront =
    discFrontBand
    * discTextureMatter
    * discArcMask;

  // Keep the quarter-ellipse fillet idea, but reduce the outer tail and make
  // the disc itself own more of the silhouette. The fillet should start a bit
  // inboard of the disc's maximum width, stay close to the existing arc, and
  // only shift toward ring-like behaviour near the actual fusion zone.
  float shoulderOuterX = discHalfWidth * 0.94;
  float shoulderJoinX = ringRadius * 1.00;
  float shoulderStartY = discCentreY;
  float shoulderJoinY = discCentreY - mix(0.068, 0.062, journey);

  float shoulderSpanX = max(
    shoulderOuterX - shoulderJoinX,
    0.0001
  );

  float shoulderSpanY = max(
    shoulderStartY - shoulderJoinY,
    0.0001
  );

  vec2 shoulderSpace = vec2(
    (abs(d.x) - shoulderOuterX) / shoulderSpanX,
    (d.y - shoulderJoinY) / shoulderSpanY
  );

  float shoulderRadius = length(shoulderSpace);

  vec2 shoulderGradient = vec2(
    shoulderSpace.x / shoulderSpanX,
    shoulderSpace.y / shoulderSpanY
  );

  float shoulderDistance = abs(shoulderRadius - 1.0) / max(
    length(shoulderGradient),
    0.0001
  );

  float shoulderXMask =
    smoothstep(-1.06, -0.96, shoulderSpace.x)
    * (
      1.0 - smoothstep(
        -0.02,
        0.04,
        shoulderSpace.x
      )
    );

  float shoulderYMask =
    smoothstep(-0.05, 0.04, shoulderSpace.y)
    * (
      1.0 - smoothstep(
        0.96,
        1.04,
        shoulderSpace.y
      )
    );

  float shoulderQuadrantMask =
    shoulderXMask
    * shoulderYMask;

  float shoulderProgress = clamp(
    -shoulderSpace.x,
    0.0,
    1.0
  );

  float shoulderCurve = shoulderProgress
    * shoulderProgress
    * (3.0 - 2.0 * shoulderProgress);

  // Start thinner and taper a little faster so the fillet doesn't read as a
  // separate broad tail extending out from the disc.
  float shoulderOuterWidth = mix(
    0.048,
    0.024,
    shoulderCurve
  );

  float shoulderBand = 1.0 - smoothstep(
    ringWidth * 0.90,
    shoulderOuterWidth,
    shoulderDistance
  );

  float discShoulder =
    shoulderBand
    * shoulderQuadrantMask
    * (0.46 + 0.54 * discTextureMatter);

  float shoulderRoot = discShoulder * (1.0 - smoothstep(
    0.12,
    0.46,
    shoulderCurve
  ));

  float ringProximity = 1.0 - smoothstep(
    0.018,
    0.094,
    abs(r - ringRadius)
  );

  float discAttachment =
    discShoulder
    * ringProximity
    * smoothstep(0.60, 0.96, shoulderCurve);

  float shoulderJoin =
    discShoulder
    * smoothstep(0.70, 0.98, shoulderCurve);

  // Stable star field: no frame-stepped twinkling or popping.
  vec2 starGrid = floor((p + 1.55) * 176.0);
  vec2 starCell = fract((p + 1.55) * 176.0) - 0.5;

  float starSeed = hash(starGrid);
  float starField = step(0.992 - 0.014 * e, starSeed);

  starField *= 1.0 - smoothstep(
    0.010,
    0.072,
    length(starCell)
  );

  float lensGlow = band(
    r,
    ringRadius,
    0.064,
    0.265
  );

  float photonRing = band(
    r,
    horizonRadius,
    0.004,
    0.026
  );

  vec3 deep = vec3(0.008, 0.009, 0.020);
  vec3 violet = vec3(0.165, 0.095, 0.285);
  vec3 amber = vec3(0.930, 0.560, 0.250);
  vec3 blue = vec3(0.250, 0.600, 1.000);
  vec3 white = vec3(0.960, 0.980, 1.000);

  vec3 col = deep;

  col += violet * filaments * (0.20 + 0.20 * e);

  vec3 ringColour = mix(
    amber,
    blue,
    smoothstep(-1.0, 1.0, sin(a * 2.0 + t))
  );

  // Keep the core structure bright but not blown out.
  col += ringColour
    * ringMatter
    * (0.34 + 0.34 * e + 0.16 * discAttachment);
  col += white * lensGlow * (0.018 + 0.072 * e);
  col += vec3(0.18, 0.36, 0.72) * corona * (0.10 + 0.18 * e);

  // The observer-facing branch should feel warmer and denser than the ring,
  // while remaining visibly ring-like across a broader structural arc.
  vec3 accretionColour = mix(
    amber,
    mix(amber, white, 0.20),
    0.30
  );

  vec3 shoulderColour = mix(
    accretionColour,
    ringColour,
    smoothstep(0.42, 0.96, shoulderCurve)
  );

  col += white * starField * (0.14 + 0.20 * e);

  // The black shadow removes the background and the upright ring's interior.
  // The selected lower-front accretion arc is drawn afterwards, allowing it
  // alone to cross the lower face of the void.
  col = mix(col, vec3(0.0), horizonMask);
  col = mix(col, vec3(0.0), umbraMask * 0.72);

  // Photon-ring edge comes back after the black shadow.
  col += mix(amber, blue, 0.52 + 0.48 * sin(a * 2.0 + t))
    * photonRing
    * (0.36 + 0.24 * e);

  float discCore = 1.0 - smoothstep(
    0.0,
    0.82,
    abs(discSpace.x)
  );

  col += accretionColour
    * discFront
    * (0.18 + 0.18 * e + 0.24 * discCore + 0.14 * discAttachment);

  // Keep the fillet visually subordinate to the front disc. Most of the early
  // shoulder should still read as accretion-disc material, with ring-like
  // behaviour only arriving close to the actual fusion zone.
  col += accretionColour
    * shoulderRoot
    * (0.12 + 0.12 * e);

  col += shoulderColour
    * discShoulder
    * (0.08 + 0.09 * e);

  col += ringColour
    * shoulderJoin
    * (0.08 + 0.10 * e);

  col += mix(white, ringColour, 0.24)
    * discAttachment
    * (0.010 + 0.022 * e);

  col += white
    * discFront
    * (discCore * 0.20)
    * (0.008 + 0.026 * e);

  float edgeVignette = 1.0 - smoothstep(0.78, 1.45, length(p));
  col *= 0.52 + 0.84 * edgeVignette;

  col *= 0.92 + 0.18 * e;

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

  return {
    name: "event-horizon",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uTrackProgress = gl.getUniformLocation(program, "uTrackProgress");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uTrackProgress, opts.trackProgress01 ?? 0);
      gl.uniform1f(uEnergy, opts.audio.energy);

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
