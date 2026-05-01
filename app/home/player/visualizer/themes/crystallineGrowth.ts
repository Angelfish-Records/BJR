import type { Theme } from "../types";
import { createProgram, makeFullscreenTriangle } from "../gl";
import { createPingPong, type PingPong } from "../gl/pingpong";

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;

void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const SIM_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uPrev;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;
uniform float uFrame;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p + 17.1), hash(p + 43.7));
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

  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = mat2(1.59, -1.20, 1.20, 1.59) * p;
    a *= 0.5;
  }

  return v;
}

float crystalSeed(vec2 p, float t) {
  vec2 g = floor(p * 4.5);
  vec2 f = fract(p * 4.5);

  float best = 10.0;
  float second = 10.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = g + o;
      vec2 h = hash2(id);

      vec2 seed = o + 0.5 + 0.32 * sin(vec2(1.7, 2.1) * t + h * 6.28318);
      float d = length(f - seed);

      if (d < best) {
        second = best;
        best = d;
      } else if (d < second) {
        second = d;
      }
    }
  }

  float edge = second - best;
  return smoothstep(0.020, 0.105, edge);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.07;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 prev = texture(uPrev, uv);

  float n = 0.0;
  n += texture(uPrev, uv + vec2( texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(-texel.x, 0.0)).r;
  n += texture(uPrev, uv + vec2(0.0,  texel.y)).r;
  n += texture(uPrev, uv - vec2(0.0, texel.y)).r;
  n *= 0.25;

  float growth = prev.r;
  float facet = prev.g;
  float glint = prev.b;
  float age = prev.a;

  float seed = crystalSeed(p + vec2(t * 0.08, -t * 0.05), t);
  float mineral = fbm(p * 2.0 + vec2(-t * 0.25, t * 0.20));
  float nucleation = smoothstep(0.76 - 0.16 * e, 0.98, seed * 0.70 + mineral * 0.55);

  float spread = smoothstep(0.08, 0.70, n);
  growth = max(growth * 0.994, nucleation * (0.28 + 0.72 * spread + 0.28 * e));

  facet = mix(facet, seed, 0.045 + 0.055 * e);
  facet = max(facet, growth * seed * 0.75);

  float glintSeed = smoothstep(0.91 - 0.06 * e, 1.0, fbm(p * 8.0 + vec2(t * 1.2, -t)));
  glint = max(glint * (0.930 - 0.018 * e), glintSeed * growth);

  age = max(age * 0.992, growth * 0.62);

  if (uFrame < 2.0) {
    float initial = smoothstep(0.83, 0.99, seed * mineral);
    growth = initial * 0.35;
    facet = seed * initial;
    glint = initial * 0.25;
    age = initial * 0.18;
  }

  fragColor = vec4(
    clamp(growth, 0.0, 1.0),
    clamp(facet, 0.0, 1.0),
    clamp(glint, 0.0, 1.0),
    clamp(age, 0.0, 1.0)
  );
}
`;

const DISPLAY_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uState;
uniform vec2 uRes;
uniform float uTime;
uniform float uEnergy;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash2(vec2 p) {
  return vec2(hash(p + 17.1), hash(p + 43.7));
}

float voronoiEdge(vec2 p, float t) {
  vec2 g = floor(p);
  vec2 f = fract(p);

  float best = 10.0;
  float second = 10.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 o = vec2(float(x), float(y));
      vec2 id = g + o;
      vec2 h = hash2(id);

      vec2 seed = o + 0.5 + 0.26 * sin(vec2(1.3, 1.9) * t + h * 6.28318);
      float d = length(f - seed);

      if (d < best) {
        second = best;
        best = d;
      } else if (d < second) {
        second = d;
      }
    }
  }

  return second - best;
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.07;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);
  float growth = smoothstep(0.10, 0.78, s.r);
  float facet = s.g;
  float glint = s.b;
  float age = s.a;

  float gx1 = texture(uState, uv + vec2(texel.x, 0.0)).r;
  float gx2 = texture(uState, uv - vec2(texel.x, 0.0)).r;
  float gy1 = texture(uState, uv + vec2(0.0, texel.y)).r;
  float gy2 = texture(uState, uv - vec2(0.0, texel.y)).r;
  vec2 grad = vec2(gx1 - gx2, gy1 - gy2);

  float edge = smoothstep(0.035, 0.42, length(grad));

  float vEdge = voronoiEdge(p * 5.2 + vec2(t * 0.15, -t * 0.09), t);
  float facetLine = 1.0 - smoothstep(0.018, 0.085, vEdge);

  float angleLight = dot(normalize(grad + vec2(0.0001)), normalize(vec2(0.45, 0.89)));
  float sheen = smoothstep(0.15, 0.95, angleLight * 0.5 + 0.5);

  vec3 deep = vec3(0.030, 0.032, 0.052);
  vec3 mineral = vec3(0.135, 0.150, 0.210);
  vec3 violet = vec3(0.420, 0.320, 0.620);
  vec3 ice = vec3(0.720, 0.880, 1.000);
  vec3 white = vec3(0.970, 0.985, 1.000);

  vec3 col = mix(deep, mineral, growth);
  col = mix(col, violet, facet * growth * 0.45);
  col = mix(col, ice, growth * sheen * 0.40);

  col += white * facetLine * growth * (0.10 + 0.20 * e);
  col += white * edge * (0.12 + 0.26 * e);
  col += white * glint * (0.20 + 0.50 * e);
  col += vec3(0.25, 0.52, 0.90) * age * 0.055;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.54 + 0.74 * vig;

  col *= 0.88 + 0.30 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createCrystallineGrowthTheme(): Theme {
  let simProgram: WebGLProgram | null = null;
  let displayProgram: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  let pingpong: PingPong | null = null;
  let frame = 0;

  let simPrev: WebGLUniformLocation | null = null;
  let simRes: WebGLUniformLocation | null = null;
  let simTime: WebGLUniformLocation | null = null;
  let simEnergy: WebGLUniformLocation | null = null;
  let simFrame: WebGLUniformLocation | null = null;

  let displayState: WebGLUniformLocation | null = null;
  let displayRes: WebGLUniformLocation | null = null;
  let displayTime: WebGLUniformLocation | null = null;
  let displayEnergy: WebGLUniformLocation | null = null;

  return {
    name: "crystalline-growth",

    init(gl) {
      simProgram = createProgram(gl, VS, SIM_FS);
      displayProgram = createProgram(gl, VS, DISPLAY_FS);
      tri = makeFullscreenTriangle(gl);
      pingpong = createPingPong(gl, 1, 1);
      frame = 0;

      simPrev = gl.getUniformLocation(simProgram, "uPrev");
      simRes = gl.getUniformLocation(simProgram, "uRes");
      simTime = gl.getUniformLocation(simProgram, "uTime");
      simEnergy = gl.getUniformLocation(simProgram, "uEnergy");
      simFrame = gl.getUniformLocation(simProgram, "uFrame");

      displayState = gl.getUniformLocation(displayProgram, "uState");
      displayRes = gl.getUniformLocation(displayProgram, "uRes");
      displayTime = gl.getUniformLocation(displayProgram, "uTime");
      displayEnergy = gl.getUniformLocation(displayProgram, "uEnergy");
    },

    render(gl, opts) {
      if (!simProgram || !displayProgram || !tri || !pingpong) return;

      pingpong.resize(gl, opts.width, opts.height);

      gl.bindVertexArray(tri.vao);

      gl.useProgram(simProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pingpong.dstFbo());
      gl.viewport(0, 0, opts.width, opts.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pingpong.srcTex());

      gl.uniform1i(simPrev, 0);
      gl.uniform2f(simRes, opts.width, opts.height);
      gl.uniform1f(simTime, opts.time);
      gl.uniform1f(simEnergy, opts.audio.energy);
      gl.uniform1f(simFrame, frame);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      pingpong.swap();

      gl.useProgram(displayProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, opts.width, opts.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pingpong.srcTex());

      gl.uniform1i(displayState, 0);
      gl.uniform2f(displayRes, opts.width, opts.height);
      gl.uniform1f(displayTime, opts.time);
      gl.uniform1f(displayEnergy, opts.audio.energy);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);

      frame += 1;
    },

    dispose(gl) {
      pingpong?.dispose(gl);
      pingpong = null;

      if (tri?.buf) gl.deleteBuffer(tri.buf);
      if (tri?.vao) gl.deleteVertexArray(tri.vao);
      tri = null;

      if (simProgram) gl.deleteProgram(simProgram);
      simProgram = null;

      if (displayProgram) gl.deleteProgram(displayProgram);
      displayProgram = null;
    },
  };
}