import type {Theme} from '../types'
import {createProgram, makeFullscreenTriangle} from '../gl'

const VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

// A reasonably cheap “folded-space” raymarch (gives that fractal/SDF-world vibe)
// Audio drives fold strength, camera path, and glow.
const FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;

uniform float uEnergy;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uCentroid;

#define MAX_STEPS 80
#define MAX_DIST  30.0
#define SURF_DIST 0.002

mat2 rot(float a){ float s=sin(a), c=cos(a); return mat2(c,-s,s,c); }

float hash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

float mapFractal(vec3 p, float foldK, float iters){
  // Folded / inverted space SDF-ish
  float scale = 1.3 + 0.7 * foldK;
  float d = 1e9;
  vec3 q = p;

  // use integer-ish loop for performance, but allow audio to “act” via foldK
  for(int i=0;i<7;i++){
    // box fold
    q = abs(q);
    q.xy = q.xy * rot(0.35 + 0.15*foldK);
    q.yz = q.yz * rot(0.25 + 0.10*foldK);

    // sphere-ish inversion
    float r2 = dot(q,q);
    q = q / max(0.25, r2) - vec3(0.9, 0.7, 0.8);

    // distance-ish measure
    float di = length(q) - (0.55 + 0.12*foldK);
    d = min(d, di);

    // early exit if we're effectively done (keeps cost down)
    if(float(i) > iters) break;
    q *= scale;
  }

  // ground plane
  float ground = p.y + 1.2;
  return min(d, ground);
}

vec3 getNormal(vec3 p, float foldK, float iters){
  vec2 e = vec2(0.0015, 0.0);
  float d = mapFractal(p, foldK, iters);
  vec3 n = d - vec3(
    mapFractal(p - vec3(e.x,e.y,e.y), foldK, iters),
    mapFractal(p - vec3(e.y,e.x,e.y), foldK, iters),
    mapFractal(p - vec3(e.y,e.y,e.x), foldK, iters)
  );
  return normalize(n);
}

float raymarch(vec3 ro, vec3 rd, float foldK, float iters, out vec3 pHit){
  float dO = 0.0;
  for(int i=0;i<MAX_STEPS;i++){
    vec3 p = ro + rd*dO;
    float dS = mapFractal(p, foldK, iters);
    if(dS < SURF_DIST){ pHit = p; return dO; }
    dO += dS;
    if(dO > MAX_DIST) break;
  }
  pHit = ro + rd*dO;
  return -1.0;
}

void main(){
  vec2 uv = vUv;
  vec2 p = (uv*uRes - 0.5*uRes) / min(uRes.x,uRes.y);

  float e = clamp(uEnergy, 0.0, 1.0);
  float bass = clamp(uBass, 0.0, 1.0);
  float tre = clamp(uTreble, 0.0, 1.0);
  float cen = clamp(uCentroid, 0.0, 1.0);

  float t = uTime;

  // Camera: orbit + bob, “steered” by audio
  float camR = 4.2 + 1.6*bass;
  float camA = t*0.25 + 1.3*cen;
  vec3 ro = vec3(camR*cos(camA), 0.8 + 0.5*sin(t*0.55), camR*sin(camA));
  ro.y += 0.25 * sin(t*0.8 + 6.0*e);

  vec3 ta = vec3(0.0, 0.0, 0.0);
  ta.y = -0.2 + 0.25*sin(t*0.3);

  // Build camera basis
  vec3 ww = normalize(ta - ro);
  vec3 uu = normalize(cross(vec3(0.0,1.0,0.0), ww));
  vec3 vv = cross(ww, uu);

  float fov = mix(1.4, 1.0, 0.35*bass);
  vec3 rd = normalize(uu*p.x + vv*p.y + ww*fov);

  // Fractal controls
  float foldK = 0.35 + 0.9*e + 0.5*tre;
  float iters = 4.0 + floor(2.0*e + 2.0*bass);

  vec3 hitP;
  float d = raymarch(ro, rd, foldK, iters, hitP);

  vec3 col = vec3(0.02, 0.02, 0.03);

  // sky / haze
  float haze = exp(-0.20 * length(p));
  col += vec3(0.06, 0.05, 0.10) * haze;

  if(d > 0.0){
    vec3 n = getNormal(hitP, foldK, iters);

    // simple lighting
    vec3 ldir = normalize(vec3(0.6, 0.9, 0.2));
    float diff = clamp(dot(n, ldir), 0.0, 1.0);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);

    // palette: deep violet → lavender, driven by centroid
    vec3 a = vec3(0.10, 0.07, 0.16);
    vec3 b = vec3(0.55, 0.35, 0.85);
    vec3 base = mix(a, b, smoothstep(0.15, 0.85, cen));

    // distance glow (acts like “iteration depth” feel)
    float glow = exp(-0.12*d) * (0.7 + 1.3*e);

    col = base * (0.25 + 0.85*diff) + glow * (0.15 + 0.55*fres);

    // ground tint
    if(hitP.y < -1.05){
      col *= vec3(0.65, 0.60, 0.75);
    }

    // sparkles
    float sp = pow(hash(hitP.xz*7.0 + t*0.2), 24.0) * (0.3 + 1.2*tre);
    col += vec3(1.0, 0.95, 1.0) * sp;
  }

  // vignette
  float r = length(p);
  col *= smoothstep(1.25, 0.35, r);

  // energy “breathing”
  col *= 0.92 + 0.28*e;

  fragColor = vec4(col, 1.0);
}
`

export function createFractalWorldTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null
  let uBass: WebGLUniformLocation | null = null
  let uMid: WebGLUniformLocation | null = null
  let uTreble: WebGLUniformLocation | null = null
  let uCentroid: WebGLUniformLocation | null = null

  return {
    name: 'fractal-world',
    init(gl) {
      program = createProgram(gl, VS, FS)
      tri = makeFullscreenTriangle(gl)
      uRes = gl.getUniformLocation(program, 'uRes')
      uTime = gl.getUniformLocation(program, 'uTime')
      uEnergy = gl.getUniformLocation(program, 'uEnergy')
      uBass = gl.getUniformLocation(program, 'uBass')
      uMid = gl.getUniformLocation(program, 'uMid')
      uTreble = gl.getUniformLocation(program, 'uTreble')
      uCentroid = gl.getUniformLocation(program, 'uCentroid')
    },
    render(gl, opts) {
      if (!program || !tri) return
      const a = opts.audio
      gl.useProgram(program)
      gl.bindVertexArray(tri.vao)

      gl.uniform2f(uRes, opts.width, opts.height)
      gl.uniform1f(uTime, opts.time)
      gl.uniform1f(uEnergy, a.energy ?? 0.0)
      gl.uniform1f(uBass, a.bass ?? 0.0)
      gl.uniform1f(uMid, a.mid ?? 0.0)
      gl.uniform1f(uTreble, a.treble ?? 0.0)
      gl.uniform1f(uCentroid, a.centroid ?? 0.0)

      gl.drawArrays(gl.TRIANGLES, 0, 3)

      gl.bindVertexArray(null)
      gl.useProgram(null)
    },
    dispose(gl) {
      if (tri?.buf) gl.deleteBuffer(tri.buf)
      if (tri?.vao) gl.deleteVertexArray(tri.vao)
      tri = null
      if (program) gl.deleteProgram(program)
      program = null
    },
  }
}
