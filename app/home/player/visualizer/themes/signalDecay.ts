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
    p = mat2(1.64, -1.17, 1.17, 1.64) * p;
    a *= 0.5;
  }

  return v;
}

vec2 flow(vec2 p, float t) {
  float a = fbm(p * 1.2 + vec2(t * 0.35, -t * 0.22));
  float b = fbm(p * 1.2 + vec2(8.3 - t * 0.25, t * 0.31));
  vec2 g = vec2(a - 0.5, b - 0.5);
  return vec2(g.y, -g.x);
}

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec2 f = flow(p, t);
  vec2 advect = uv - f * texel * (12.0 + 24.0 * e);

  vec4 prev = texture(uPrev, clamp(advect, vec2(0.001), vec2(0.999)));

  vec4 blur = vec4(0.0);
  blur += texture(uPrev, uv + vec2( texel.x, 0.0));
  blur += texture(uPrev, uv + vec2(-texel.x, 0.0));
  blur += texture(uPrev, uv + vec2(0.0,  texel.y));
  blur += texture(uPrev, uv + vec2(0.0, -texel.y));
  blur *= 0.25;

  vec4 state = mix(prev, blur, 0.040 + 0.050 * e);

  float carrierA = sin((p.x * 8.0 + p.y * 2.0) + t * 2.2);
  float carrierB = sin((p.y * 7.4 - p.x * 1.7) - t * 1.8);
  float carrierC = sin(dot(p, normalize(vec2(0.74, 0.67))) * 13.0 + t * 1.1);

  float signal = (carrierA + carrierB + carrierC) * 0.333;
  signal += (fbm(p * 2.6 + vec2(t, -t * 0.6)) - 0.5) * 0.65;

  float injection = smoothstep(0.56 - 0.14 * e, 0.98, abs(signal));
  injection *= smoothstep(1.15, 0.08, length(p));
  injection *= 0.045 + 0.22 * e;

  vec3 spectral = vec3(
    smoothstep(0.20, 0.95, signal),
    smoothstep(0.18, 0.88, fbm(p * 2.0 + vec2(3.1, t))),
    smoothstep(0.18, 0.90, -signal + 0.42)
  );

  state.rgb *= 0.962 - 0.026 * e;
  state.rgb += spectral * injection;

  float scan = smoothstep(0.025, 0.0, abs(fract(uv.y * 42.0 - t * 3.0) - 0.5));
  state.b += scan * (0.006 + 0.030 * e);

  state.a = max(state.a * 0.970, injection * 2.4);

  if (uFrame < 2.0) {
    state = vec4(0.0);
  }

  fragColor = clamp(state, vec4(0.0), vec4(1.0));
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

void main() {
  vec2 uv = vUv;
  vec2 texel = 1.0 / max(uRes, vec2(1.0));
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  vec4 s = texture(uState, uv);

  float lx = texture(uState, uv + vec2(texel.x, 0.0)).a;
  float rx = texture(uState, uv - vec2(texel.x, 0.0)).a;
  float uy = texture(uState, uv + vec2(0.0, texel.y)).a;
  float dy = texture(uState, uv - vec2(0.0, texel.y)).a;
  float edge = smoothstep(0.02, 0.42, length(vec2(lx - rx, uy - dy)));

  float grain = hash(floor((p + 1.3) * (180.0 + 70.0 * e)) + floor(t * 20.0));
  float dropout = smoothstep(0.04 + 0.08 * e, 1.0, grain);

  vec3 deep = vec3(0.018, 0.018, 0.035);
  vec3 ghost = vec3(0.16, 0.30, 0.50);
  vec3 hot = vec3(0.82, 0.92, 1.0);

  vec3 col = deep;
  col += ghost * s.rgb * (1.2 + 0.8 * e);
  col += hot * edge * (0.16 + 0.32 * e);
  col += vec3(0.32, 0.55, 0.90) * s.a * (0.10 + 0.18 * e);

  col *= 0.72 + 0.28 * dropout;

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.54 + 0.76 * vig;

  col *= 0.88 + 0.30 * e;

  fragColor = vec4(col, 1.0);
}
`;

export function createSignalDecayTheme(): Theme {
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
    name: "signal-decay",

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