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
uniform float uAge;
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
  float age = min(max(uAge, 0.0), 600.0);
  float t = time * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // Theme-lifetime camera move, independent of track time.
  //
  // 1 min  ≈ 1.31x
  // 3 min  ≈ 1.72x
  // 5 min  ≈ 1.95x
  // 7 min  ≈ 2.07x
  // 10 min ≈ 2.17x
  //
  // This is intentionally substantial: the ring and shadow should feel
  // increasingly enormous rather than merely breathing in place.
  float cameraProgress = 1.0 - exp(-age * 0.0048);
  float cameraZoom = 1.0 + 1.24 * cameraProgress;

  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p *= cameraZoom;

  // The event horizon is intentionally immovable. No travelling centre point.
  vec2 d = p;

  // Mild vertical compression: recognisably oblate without becoming a flat eye.
  float oblateness = 1.22;
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

  float pull = 0.44 + 0.54 * e;
  float lens = 1.0 / (1.0 + pull * 2.35 / (0.13 + r * 2.25));
  float swirl = t * 1.42 + pull * 1.92 / (0.14 + r);

  vec2 q = rot(swirl * (1.0 - smoothstep(0.06, 1.18, r))) * orbital;
  q *= 1.0 + 0.88 * lens;

  // This remains the main luminous ring you already liked.
  float ringRadius = 0.366 + 0.012 * sin(t * 1.45);
  float ringWidth = 0.016 + 0.014 * e;
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
  // Coherent lensed accretion disc.
  //
  // The visible plane is one deliberately selected lower-front ellipse arc.
  // Its width controls the system's scale; its angular window independently
  // controls how much curvature is visible. No rear branch is drawn.
  // ---------------------------------------------------------------------------

  // Restore the tighter scale: the plane still projects beyond the photon
  // ring, but no longer reads as a second full halo.
  float discHalfWidth = ringRadius * 1.50;
  float discHalfHeight = 0.135;
  float discCentreY = 0.015;

  vec2 discSpace = vec2(
    d.x / discHalfWidth,
    (d.y - discCentreY) / discHalfHeight
  );

  float discRadius = length(discSpace);
  float discAngle = atan(discSpace.y, discSpace.x);

  // Approximate the ellipse's signed distance in display space. This lets
  // the accretion plane inherit the same apparent thickness as the main ring,
  // instead of becoming narrow at its crown and fat at its side extremities.
  vec2 discGradient = vec2(
    discSpace.x / discHalfWidth,
    discSpace.y / discHalfHeight
  );

  float discDistance = abs(discRadius - 1.0) / max(
    length(discGradient),
    0.0001
  );

  // Match the main ring's inner thickness and outer falloff exactly.
  float discBand = 1.0 - smoothstep(
    ringWidth,
    0.108,
    discDistance
  );

  // Use the same angular/radial texture grammar as ringMatter.
  float discTexture = ridged(
    vec2(
      discAngle * 2.15,
      discRadius * 3.95
    ) + vec2(t * 0.72, -t * 0.28)
  );

  float discMatter = discBand * smoothstep(
    0.34,
    0.97,
    discTexture
  );

  // The observer-facing centre of the ellipse is -PI / 2. The endpoint is
  // derived from the photon-ring radius, so the arc dies just after its
  // shoulders have turned back toward the lower side quadrants of the ring.
  float frontArcDistance = abs(discAngle + 1.57079632679);
  float discAttachmentX = ringRadius * 1.40;
  float discEndpointAngle = acos(clamp(
    discAttachmentX / discHalfWidth,
    0.0,
    0.999
  ));
  float discArcHalfSpan = 1.57079632679 - discEndpointAngle;

  // This replaces the old screen-space X range. It exposes one continuous
  // lower-front arc, feathers its endpoints, and makes the far/back branch
  // geometrically nonexistent rather than merely faint.
  float discArcMask = 1.0 - smoothstep(
    discArcHalfSpan - 0.160,
    discArcHalfSpan,
    frontArcDistance
  );

  float discFrontWeight = 1.0 - smoothstep(
    -0.020,
    0.100,
    discSpace.y
  );

  float discFront = discMatter
    * discFrontWeight
    * discArcMask;

  // Brighten the actual approach to the photon ring rather than an arbitrary
  // X range. This gives the shoulders a deliberate attachment point while
  // letting the outer tips disappear cleanly.
  float discAttachment = discArcMask
    * discBand
    * (
      1.0 - smoothstep(
        0.026,
        0.102,
        abs(r - ringRadius)
      )
    );

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

  col += violet * filaments * (0.25 + 0.28 * e);

  vec3 ringColour = mix(
    amber,
    blue,
    smoothstep(-1.0, 1.0, sin(a * 2.0 + t))
  );

  // Give the upright ring a restrained local lift at the real disc/ring
  // approach points, helping the shoulder arcs read as connected rather than
  // merely overlaid.
  col += ringColour
    * ringMatter
    * (0.44 + 0.58 * e + 0.10 * discAttachment);
  col += white * lensGlow * (0.040 + 0.15 * e);
  col += vec3(0.18, 0.36, 0.72) * corona * (0.12 + 0.24 * e);

  // The plane shares the main ring's colour and texture language rather
  // than becoming a separately lit white-blue object.
  vec3 accretionColour = ringColour;

  col += white * starField * (0.16 + 0.28 * e);

  // The black shadow removes the background and the upright ring's interior.
  // The selected lower-front accretion arc is drawn afterwards, allowing it
  // alone to cross the lower face of the void.
  col = mix(col, vec3(0.0), horizonMask);
  col = mix(col, vec3(0.0), umbraMask * 0.72);

  // Photon-ring edge comes back after the black shadow.
  col += mix(amber, blue, 0.52 + 0.48 * sin(a * 2.0 + t))
    * photonRing
    * (0.42 + 0.34 * e);

  col += accretionColour
    * discFront
    * (0.44 + 0.58 * e + 0.18 * discAttachment);

  float edgeVignette = 1.0 - smoothstep(0.78, 1.45, length(p));
  col *= 0.52 + 0.84 * edgeVignette;

  col *= 0.88 + 0.32 * e;

  fragColor = vec4(col, 1.0);
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
  let uAge: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let themeStartedAtMs: number | null = null;

  return {
    name: "event-horizon",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      themeStartedAtMs = performance.now();

      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uAge = gl.getUniformLocation(program, "uAge");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      const themeAgeSeconds =
        themeStartedAtMs === null
          ? 0
          : (performance.now() - themeStartedAtMs) / 1000;

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uAge, themeAgeSeconds);
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
      themeStartedAtMs = null;
    },
  };
}
