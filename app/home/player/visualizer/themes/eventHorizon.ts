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
  float t = time * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // This is deliberately true camera movement, not radial parameter drift.
  //
  // At 60 sec:  1.08x
  // At 3 min:   1.26x
  // At 5 min:   1.48x
  // At 7 min+:  1.73x
  //
  // The cap prevents an endlessly running player from eventually filling
  // the screen with nothing but the inner void.
  float travelTime = min(time, 420.0);
  float cameraZoom = exp(travelTime * 0.00130);

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
  // Rear accretion disc:
  //
  // A bright lensed arch behind the horizon. It is drawn before the black
  // shadow, so the central portion disappears behind the event horizon while
  // the two shoulders rise out around it.
  // ---------------------------------------------------------------------------

  float rearExtent = 0.435;
  float rearX = d.x / rearExtent;
  float rearArcHeight = sqrt(max(0.0, 1.0 - rearX * rearX));

  float rearArcY = -0.016 - rearArcHeight * 0.152;

  float rearArc = 1.0 - smoothstep(
    0.010,
    0.052,
    abs(d.y - rearArcY)
  );

  rearArc *= 1.0 - smoothstep(0.345, 0.455, abs(d.x));

  float rearTexture = ridged(
    vec2(
      d.x * 12.0 + t * 0.66,
      (d.y - rearArcY) * 29.0 - t * 0.24
    )
  );

  rearArc *= 0.48 + 0.52 * smoothstep(0.25, 0.90, rearTexture);

  // ---------------------------------------------------------------------------
  // Foreground accretion disc:
  //
  // This is an independent compressed torus, not a radial blob. Its lower half
  // is allowed to sit in front of the black hole, creating the convincing
  // "matter passing across the face" relationship.
  // ---------------------------------------------------------------------------

  float foregroundOffset = 0.040;
  vec2 foregroundPlane = vec2(
    d.x,
    (d.y - foregroundOffset) * 3.35
  );

  float foregroundRadius = length(foregroundPlane);
  float foregroundAngle = atan(foregroundPlane.y, foregroundPlane.x);

  float lowerHemisphere = smoothstep(-0.020, 0.205, d.y);

  float foregroundTorus = band(
    foregroundRadius,
    0.258,
    0.000,
    0.108
  );

  foregroundTorus *= lowerHemisphere;

  float foregroundCore = band(
    foregroundRadius,
    0.258,
    0.000,
    0.032
  );

  foregroundCore *= lowerHemisphere;

  float foregroundTexture = ridged(
    vec2(
      foregroundAngle * 2.20 + t * 0.88,
      foregroundRadius * 11.0 - t * 0.42
    )
  );

  foregroundTorus *= 0.44 + 0.56 * smoothstep(
    0.24,
    0.92,
    foregroundTexture
  );

  // Fine lensed bridge across the near side of the shadow.
  // It is curved rather than ruler-straight, so it reads as depth rather than UI.
  float bridgeCurve = 0.026
    + 0.108 * pow(abs(d.x) / 0.345, 2.0);

  float foregroundBridge = 1.0 - smoothstep(
    0.011,
    0.047,
    abs(d.y - bridgeCurve)
  );

  foregroundBridge *= 1.0 - smoothstep(0.295, 0.375, abs(d.x));

  float bridgeTexture = fbm(
    vec2(
      d.x * 14.0 - t * 0.70,
      (d.y - bridgeCurve) * 34.0 + t * 0.34
    )
  );

  foregroundBridge *= 0.58 + 0.42 * smoothstep(
    0.26,
    0.82,
    bridgeTexture
  );

  float approachingSide = pow(
    max(0.0, 0.50 + 0.50 * sin(foregroundAngle + 0.72)),
    2.3
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
  vec3 copper = vec3(1.000, 0.420, 0.145);

  vec3 col = deep;

  col += violet * filaments * (0.25 + 0.28 * e);

  vec3 ringColour = mix(
    amber,
    blue,
    smoothstep(-1.0, 1.0, sin(a * 2.0 + t))
  );

  col += ringColour * ringMatter * (0.44 + 0.58 * e);
  col += white * lensGlow * (0.040 + 0.15 * e);
  col += vec3(0.18, 0.36, 0.72) * corona * (0.12 + 0.24 * e);

  col += mix(blue, amber, 0.48 + 0.52 * sin(t + d.x * 3.0))
    * rearArc
    * (0.30 + 0.34 * e);

  col += white * starField * (0.16 + 0.28 * e);

  // The rear arc is now hidden where it passes behind the actual shadow.
  col = mix(col, vec3(0.0), horizonMask);
  col = mix(col, vec3(0.0), umbraMask * 0.72);

  // Photon-ring edge comes back after the black shadow.
  col += mix(amber, blue, 0.52 + 0.48 * sin(a * 2.0 + t))
    * photonRing
    * (0.42 + 0.34 * e);

  // The foreground plane is deliberately composited last: it is matter nearer
  // to the observer than the horizon and should visibly pass across its face.
  vec3 foregroundColour = mix(
    vec3(0.56, 0.16, 0.095),
    copper,
    0.62 + 0.38 * approachingSide
  );

  foregroundColour = mix(
    foregroundColour,
    vec3(0.33, 0.58, 1.00),
    0.20 * (1.0 - approachingSide)
  );

  col += foregroundColour
    * foregroundTorus
    * (0.34 + 0.48 * e);

  col += white
    * foregroundCore
    * (0.09 + 0.22 * e + 0.22 * approachingSide);

  col += mix(copper, white, 0.35 + 0.45 * approachingSide)
    * foregroundBridge
    * (0.12 + 0.20 * e);

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
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "event-horizon",

    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);
      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uEnergy = gl.getUniformLocation(program, "uEnergy");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
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
