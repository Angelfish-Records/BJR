// web/app/home/player/visualizer/themes/reactionVeins.ts
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

// Reaction–Diffusion Veins (organic memory skin)
// Note: true reaction-diffusion usually needs ping-pong textures.
// This v0 is still “field-first” with slow, healing vein growth via ridged fbm + advected scalar fields.
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
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.63, -1.14, 1.14, 1.63) * p;
    a *= 0.5;
  }
  return v;
}

float ridged(vec2 p) {
  float v = 0.0;
  float a = 0.65;
  float w = 1.0;
  for (int i = 0; i < 5; i++) {
    float n = noise(p * w);
    n = 1.0 - abs(2.0*n - 1.0);
    v += a * n;
    w *= 2.05;
    a *= 0.55;
    p = mat2(0.86, -0.50, 0.50, 0.86) * p;
  }
  return v;
}

// pseudo “growth bias” field
vec2 flow(vec2 p, float t) {
  float a = fbm(p*1.1 + vec2(t*0.2, -t*0.17));
  float b = fbm(p*1.1 + vec2(-t*0.16, t*0.22));
  vec2 g = vec2(a - 0.5, b - 0.5);
  // rotate for curl-ish drift
  return vec2(g.y, -g.x);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.08;
  float e = clamp(uEnergy, 0.0, 1.0);

  // slow advection for “memory skin”
  vec2 a = p * 1.15;
  float adv = 0.18 + 0.28 * e;
  for (int i = 0; i < 5; i++) {
    vec2 f = flow(a, t);
    a += f * adv * 0.06;
    adv *= 0.86;
  }

  // scalar “reagent” fields (procedural but phase-shifted)
  float U = fbm(a*1.6 + vec2(0.0, t*1.2));
  float V = fbm(a*1.6 + vec2(12.3, -t*1.1));

  // emulate reaction front via difference + sharpening
  float diff = abs(U - V);
  float front = smoothstep(0.08, 0.32, diff);

  // veins: ridged structure biased by front and energy
  float veinBase = ridged(a*2.4 + vec2(t*0.4, -t*0.25));
  float veins = smoothstep(0.40 - 0.10*e, 0.92, veinBase);
  veins *= (0.35 + 0.75 * front);

  // “healing / thickening”: bass-ish energy thickens and slows (approx)
  float thickness = smoothstep(0.12, 0.55, veins) * (0.55 + 0.55 * e);

  // subtle boundary chatter (treble-ish proxy)
  float edge = smoothstep(0.25, 0.85, abs(veinBase - 0.5));
  edge *= (0.08 + 0.14 * e);

  // palette: organic marble / vascular tissue
  vec3 deep = vec3(0.06, 0.05, 0.08);
  vec3 skin = vec3(0.20, 0.16, 0.22);
  vec3 vein = vec3(0.70, 0.62, 0.85);
  vec3 hl   = vec3(0.95, 0.96, 1.00);

  float body = smoothstep(0.20, 0.95, fbm(a*1.1 - vec2(t*0.25, t*0.18)));
  vec3 col = mix(deep, skin, body);
  col = mix(col, vein, thickness);
  col += hl * edge * (0.7 + 0.5 * front);

  // gentle mottling
  float mott = fbm(a*3.2 + vec2(-t*0.6, t*0.4));
  col *= 0.88 + 0.18 * mott;

  // vignette
  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createReactionVeinsTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "reaction-veins",
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
