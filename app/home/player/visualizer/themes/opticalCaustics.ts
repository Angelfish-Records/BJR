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

// Optical Caustics
// Liquid light focusing through a warped surface: refraction gradients, bright caustic nets.
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
    p = mat2(1.67, -1.12, 1.12, 1.67) * p;
    a *= 0.5;
  }

  return v;
}

float heightField(vec2 p, float t) {
  float h = 0.0;

  h += 0.52 * fbm(p * 1.25 + vec2(t * 0.35, -t * 0.22));
  h += 0.31 * fbm(p * 2.40 + vec2(-t * 0.48, t * 0.31));
  h += 0.17 * sin(p.x * 5.2 + p.y * 2.4 + t * 1.4);

  return h;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.12;
  float e = clamp(uEnergy, 0.0, 1.0);

  float eps = 0.0026;

  float h = heightField(p, t);
  float hx1 = heightField(p + vec2(eps, 0.0), t);
  float hx2 = heightField(p - vec2(eps, 0.0), t);
  float hy1 = heightField(p + vec2(0.0, eps), t);
  float hy2 = heightField(p - vec2(0.0, eps), t);

  vec2 grad = vec2(hx1 - hx2, hy1 - hy2) / (2.0 * eps);

  vec2 refr = p + grad * (0.040 + 0.105 * e);

  float rh = heightField(refr * 1.18 + vec2(0.4, -0.2), t * 0.92);
  float rx1 = heightField(refr + vec2(eps, 0.0), t);
  float rx2 = heightField(refr - vec2(eps, 0.0), t);
  float ry1 = heightField(refr + vec2(0.0, eps), t);
  float ry2 = heightField(refr - vec2(0.0, eps), t);

  vec2 rgrad = vec2(rx1 - rx2, ry1 - ry2) / (2.0 * eps);

  float compression = 1.0 / (0.16 + length(grad - rgrad) * 0.16);
  float caustic = smoothstep(2.1 - 0.70 * e, 6.2, compression);

  float waveNetA = sin(refr.x * (16.0 + 6.0 * e) + rh * 4.0 + t * 1.4);
  float waveNetB = sin(refr.y * (15.0 + 5.0 * e) - rh * 3.5 - t * 1.1);
  float net = 1.0 - smoothstep(0.04, 0.42, abs(waveNetA + waveNetB));

  float foam = smoothstep(0.72, 0.98, fbm(refr * 5.5 + vec2(t * 0.8, -t * 0.6)));

  vec3 deep = vec3(0.025, 0.045, 0.070);
  vec3 pool = vec3(0.055, 0.150, 0.220);
  vec3 aqua = vec3(0.190, 0.560, 0.760);
  vec3 light = vec3(0.900, 0.970, 1.000);

  float body = smoothstep(0.05, 0.92, h);
  vec3 col = mix(deep, pool, body);
  col = mix(col, aqua, smoothstep(0.38, 0.94, rh) * 0.42);

  col += light * caustic * (0.18 + 0.42 * e);
  col += light * net * caustic * (0.18 + 0.28 * e);
  col += vec3(0.35, 0.75, 1.00) * foam * (0.035 + 0.080 * e);

  float highlight = smoothstep(0.18, 0.78, length(grad));
  col += vec3(0.70, 0.90, 1.00) * highlight * (0.035 + 0.090 * e);

  float r = length(p);
  float vig = smoothstep(1.38, 0.22, r);
  col *= 0.56 + 0.74 * vig;

  col *= 0.88 + 0.28 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createOpticalCausticsTheme(): Theme {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;

  return {
    name: "optical-caustics",

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