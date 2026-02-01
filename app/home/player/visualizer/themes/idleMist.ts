// web/app/home/player/visualizer/themes/idleMist.ts
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

float fbm3(vec2 p) {
  // only 3 octaves: cheap
  float v = 0.0;
  float a = 0.55;
  v += a * noise(p); p *= 2.0; a *= 0.5;
  v += a * noise(p); p *= 2.0; a *= 0.5;
  v += a * noise(p);
  return v;
}

void main() {
  vec2 uv = vUv;
  vec2 px = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.07;
  float e = clamp(uEnergy, 0.0, 1.0);

  // Slow drift; keep it full-coverage
  vec2 p = px * 1.25;
  p += 0.12 * vec2(sin(t*2.2), cos(t*1.7));

  float a = fbm3(p + vec2(t, -t*0.7));
  float b = fbm3(p * 1.7 + vec2(-t*0.35, t*0.25));
  float m = smoothstep(0.28, 0.92, 0.55*a + 0.45*b);

  // Palette: charcoal -> indigo -> lilac haze
  vec3 c0 = vec3(0.06, 0.06, 0.08);
  vec3 c1 = vec3(0.18, 0.20, 0.36);
  vec3 c2 = vec3(0.55, 0.46, 0.70);

  vec3 col = mix(c0, mix(c1, c2, m), m);

  // A tiny "breath" linked to energy but bounded
  col *= 0.92 + 0.10 * e;

  // Soft vignette
  float r = length(px);
  float vig = smoothstep(1.25, 0.25, r);
  col *= 0.60 + 0.55 * vig;

  fragColor = vec4(col, 1.0);
}
`;

export function createIdleMistTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: { vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null } | null =
    null;

  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "idle-mist",
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

      // Even if audio energy is 0, keep a tiny floor so idle has breath.
      gl.uniform1f(uEnergy, Math.max(0.06, opts.audio.energy));

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
