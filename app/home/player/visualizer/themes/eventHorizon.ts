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
  float v = 0.0;
  float a = 0.55;

  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.61, -1.19, 1.19, 1.61) * p;
    a *= 0.5;
  }

  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.62;
  float w = 1.0;

  for (int i = 0; i < 5; i++) {
    float n = noise(p * w);
    n = 1.0 - abs(2.0 * n - 1.0);
    v += a * n;

    w *= 2.06;
    a *= 0.55;
    p = mat2(0.83, -0.56, 0.56, 0.83) * p;
  }

  return v;
}

mat2 rot(float a) {
  float s = sin(a);
  float c = cos(a);
  return mat2(c, -s, s, c);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 centre = vec2(
    0.07 * sin(t * 0.8),
    0.05 * cos(t * 0.7)
  );

  vec2 d = p - centre;
  float r = length(d);
  float a = atan(d.y, d.x);

  float pull = 0.42 + 0.58 * e;
  float lens = 1.0 / (1.0 + pull * 2.2 / (0.16 + r * 2.4));
  float swirl = t * 1.4 + pull * 1.8 / (0.14 + r);

  vec2 q = rot(swirl * smoothstep(1.25, 0.05, r)) * d;
  q *= 1.0 + 0.85 * lens;

  float ringRadius = 0.34 + 0.035 * sin(t * 1.7) - 0.045 * e;
  float ring = 1.0 - smoothstep(0.020 + 0.018 * e, 0.115, abs(r - ringRadius));

  float inner = smoothstep(0.34, 0.07, r);
  float voidCore = smoothstep(0.19 + 0.035 * e, 0.045, r);

  float diskNoise = ridged(vec2(a * 1.9, r * 3.5) + vec2(t * 0.7, -t * 0.28));
  float disk = ring * smoothstep(0.35, 0.98, diskNoise);

  float filaments = ridged(q * 2.25 + vec2(t * 0.45, -t * 0.32));
  filaments = smoothstep(0.52 - 0.10 * e, 0.97, filaments);
  filaments *= smoothstep(1.20, 0.16, r);

  float starField = smoothstep(
    0.986 - 0.018 * e,
    1.0,
    hash(floor((p + 1.4) * 165.0) + floor(t * 4.0))
  );
  vec2 starCell = fract((p + 1.4) * 165.0) - 0.5;
  starField *= smoothstep(0.10, 0.015, length(starCell));

  float lensGlow = smoothstep(0.48, 0.08, abs(r - ringRadius)) * smoothstep(0.12, 0.62, r);

  vec3 deep = vec3(0.010, 0.010, 0.022);
  vec3 violet = vec3(0.165, 0.095, 0.285);
  vec3 amber = vec3(0.930, 0.560, 0.250);
  vec3 blue = vec3(0.250, 0.600, 1.000);
  vec3 white = vec3(0.960, 0.980, 1.000);

  vec3 col = deep;

  col += violet * filaments * (0.24 + 0.28 * e);
  col += mix(amber, blue, smoothstep(-1.0, 1.0, sin(a * 2.0 + t))) * disk * (0.42 + 0.56 * e);
  col += white * lensGlow * (0.045 + 0.16 * e);
  col += white * starField * (0.18 + 0.34 * e);

  float corona = smoothstep(0.70, 0.05, r) * (1.0 - voidCore);
  corona *= smoothstep(0.30, 0.94, fbm(q * 3.2 + vec2(-t, t * 0.6)));
  col += vec3(0.18, 0.36, 0.72) * corona * (0.10 + 0.26 * e);

  col *= 1.0 - inner * 0.82;
  col = mix(col, vec3(0.0), voidCore);

  float outerVig = smoothstep(1.45, 0.20, length(p));
  col *= 0.52 + 0.82 * outerVig;

  col *= 0.88 + 0.34 * e;

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