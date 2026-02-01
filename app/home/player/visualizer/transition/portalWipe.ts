// web/app/home/player/visualizer/transition/portalWipe.ts
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

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uRes;
uniform float uTime;
uniform float uProgress; // 0..1
uniform float uOnset;    // 1..0 fast decay

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
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.02;
    a *= 0.5;
  }
  return v;
}

float easeInOut(float x) {
  x = clamp(x, 0.0, 1.0);
  return x * x * (3.0 - 2.0 * x);
}

void main() {
  vec2 uv = vUv;
  vec2 px = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);
  float r = length(px);

  float t = uTime * 0.85;
    float p = easeInOut(uProgress);

      float driftGate = smoothstep(0.05, 0.25, uProgress);
  vec2 c = vec2(0.0) + (0.02 * driftGate) * vec2(sin(t*0.7), cos(t*0.6));


  // Use a faster-start curve for the radius so it doesn't "hang" at the center.
  // (easeInOut has zero velocity at t=0, which reads as a micro-pause.)
  float pr = 1.0 - pow(1.0 - clamp(uProgress, 0.0, 1.0), 2.2); // easeOut-ish

  // Portal radius expands (start smaller so it feels like it emerges).
  float portalR = mix(0.028, 1.35, pr);

  // Keep ring width tied to the same radius curve (slightly thicker at start).
  float ringW = mix(0.095, 0.02, pr);

  float ring = smoothstep(portalR + ringW, portalR, rc) * smoothstep(portalR - ringW, portalR, rc);

     // Noise field (0..1) in a square-ish domain
  vec2 nUv = uv * vec2(uRes.x / min(uRes.x,uRes.y), uRes.y / min(uRes.x,uRes.y));
  float n = fbm(nUv * 5.0 + vec2(t*0.15, -t*0.12));

  // Refractive warp: stronger near portal ring; pumped by onset.
  float warpAmt = (0.015 + 0.02 * uOnset) * (0.25 + 1.75 * ring);
  vec2 warp = vec2(
    fbm(nUv * 3.4 + vec2(t*0.2, 0.0)) - 0.5,
    fbm(nUv * 3.4 + vec2(0.0, -t*0.2)) - 0.5
  );
  vec2 uvWarp = uv + warpAmt * warp;

  vec3 fromCol = texture(uFrom, uvWarp).rgb;
  vec3 toCol   = texture(uTo,   uvWarp).rgb;

  // Portal mask (1 inside portal, 0 outside)
  float inside = smoothstep(portalR + 0.02, portalR - 0.02, rc);

  // --- REVEAL: new theme emerges from inside the portal ---
  // Threshold slides down as p increases, so early frames reveal almost nothing.
  float thr = 1.02 - p; // p=0 -> ~1.02 hide, p=1 -> ~0.02 show
  float revealNoise = smoothstep(thr - 0.18, thr + 0.18, n);

  // Gate the reveal so it doesn't start instantly (gives the ring time to "form")
  float revealGate = smoothstep(0.08, 0.24, p);

  // Only reveal TO where the portal is; portal expands outward via inside mask
  float m = clamp(inside * revealNoise * revealGate, 0.0, 1.0);

  // --- BLOTCHY CLOAK: "eats" the old theme more slowly ---
  // The veil ramps IN (no instant cut), peaks, then ramps OUT.
  float veilN = fbm(nUv * 6.2 + vec2(-t*0.10, t*0.13));
  float veilShape = smoothstep(0.22, 0.86, veilN); // chunky blobs

  // Envelope: rise over first ~18%, then fall, gone by ~55%
  float veilIn  = smoothstep(0.04, 0.18, p);
  float veilOut = 1.0 - smoothstep(0.34, 0.58, p);
  float veilEnv = clamp(veilIn * veilOut, 0.0, 1.0);

  // Let the veil invade the portal interior early, but retreat as portal opens.
  // inv=1 at start, fades toward 0 by ~35% progress.
  float inv = 1.0 - smoothstep(0.10, 0.35, p);
  float veilMask = clamp((1.0 - inside) + inv * inside * 0.55, 0.0, 1.0);

  // Strongest near the ring (feels like the portal is doing the eating)
  float ringBoost = 0.35 + 0.85 * ring;

  float veil = veilEnv * veilShape * veilMask * ringBoost;

  // Don't drive to pure black; keep a little "soot" detail so it reads as eating, not cutting.
  vec3 soot = vec3(0.02, 0.02, 0.025);
  vec3 cloakedFrom = mix(fromCol, soot, 0.82 * veil);

  // Base blend: TO genuinely emerges from the portal; FROM is being eaten into soot.
  vec3 col = mix(cloakedFrom, toCol, m);

  // Add a bright ring / shimmer (feels like a lens opening)
  vec3 ringCol = vec3(0.85, 0.92, 1.0) * (0.18 + 0.55 * uOnset);
  col += ringCol * ring;

  // Gentle vignette to keep full-coverage but grounded
  float vig = smoothstep(1.45, 0.35, r);
  col *= 0.65 + 0.55 * vig;

  fragColor = vec4(col, 1.0);
}
`;

export type PortalWipe = {
  init: (gl: WebGL2RenderingContext) => void;
  render: (
    gl: WebGL2RenderingContext,
    opts: {
      fromTex: WebGLTexture;
      toTex: WebGLTexture;
      width: number;
      height: number;
      time: number;
      progress01: number;
      onset01: number;
    },
  ) => void;
  dispose: (gl: WebGL2RenderingContext) => void;
};

export function createPortalWipe(): PortalWipe {
  let program: WebGLProgram | null = null;
  let tri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;

  let uFrom: WebGLUniformLocation | null = null;
  let uTo: WebGLUniformLocation | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uProgress: WebGLUniformLocation | null = null;
  let uOnset: WebGLUniformLocation | null = null;

  return {
    init(gl) {
      program = createProgram(gl, VS, FS);
      tri = makeFullscreenTriangle(gl);

      uFrom = gl.getUniformLocation(program, "uFrom");
      uTo = gl.getUniformLocation(program, "uTo");
      uRes = gl.getUniformLocation(program, "uRes");
      uTime = gl.getUniformLocation(program, "uTime");
      uProgress = gl.getUniformLocation(program, "uProgress");
      uOnset = gl.getUniformLocation(program, "uOnset");
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uProgress, opts.progress01);
      gl.uniform1f(uOnset, opts.onset01);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, opts.fromTex);
      gl.uniform1i(uFrom, 0);

      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, opts.toTex);
      gl.uniform1i(uTo, 1);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
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
