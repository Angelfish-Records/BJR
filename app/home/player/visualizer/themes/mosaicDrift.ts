// web/app/home/player/visualizer/themes/mosaicDrift.ts
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

// Cellular Mosaic Drift (living tiled geometry)
// Voronoi-ish tessellation with morphing cell centers + stained-glass palette.
// Full coverage is guaranteed by the cell fill; edges ripple with treble.
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

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  float n = hash12(p);
  return vec2(n, hash12(p + n + 17.7));
}

vec3 hash33(vec2 p) {
  float a = hash12(p);
  float b = hash12(p + 13.37);
  float c = hash12(p + 91.17);
  return vec3(a, b, c);
}

float smoothVoronoi(vec2 x, out vec2 cellId, out vec2 cellCenter, out float edgeDist) {
  vec2 n = floor(x);
  vec2 f = fract(x);

  float md = 1e9;
  float md2 = 1e9;
  vec2 bestId = vec2(0.0);
  vec2 bestP = vec2(0.0);

  // 3x3 neighborhood
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 g = vec2(float(i), float(j));
      vec2 id = n + g;
      vec2 r = hash22(id);

      // animate cell centers gently (mid drives drift)
      float t = uTime * 0.10;
      vec2 wob = 0.14 * vec2(sin(t + r.x*6.28318), cos(t*1.1 + r.y*6.28318));
      vec2 p = g + r + wob * (0.35 + 0.65*uMid);

      float d = dot(f - p, f - p);
      if (d < md) {
        md2 = md;
        md = d;
        bestId = id;
        bestP = p;
      } else if (d < md2) {
        md2 = d;
      }
    }
  }

  cellId = bestId;
  cellCenter = (n + bestP);

  // distance to nearest site (md) and second nearest (md2) gives edge proximity
  float dist1 = sqrt(md);
  float dist2 = sqrt(md2);
  edgeDist = dist2 - dist1; // smaller near borders
  return dist1;
}

vec3 stainedGlass(vec3 k) {
  // warm, stained-glass diversity with a bit of earth + jewel.
  vec3 a = vec3(0.10, 0.06, 0.05); // lead shadow
  vec3 b = vec3(0.90, 0.35, 0.15); // amber
  vec3 c = vec3(0.15, 0.70, 0.35); // green
  vec3 d = vec3(0.10, 0.35, 0.85); // cobalt
  vec3 e = vec3(0.80, 0.70, 0.20); // gold

  // pick palette based on hashed channels
  vec3 col = mix(b, c, smoothstep(0.20, 0.85, k.x));
  col = mix(col, d, smoothstep(0.35, 0.90, k.y));
  col = mix(col, e, smoothstep(0.55, 0.95, k.z));
  // keep it slightly earthy
  col = mix(a, col, 0.92);
  return col;
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;

  // global drift so the mosaic “slides”
  vec2 drift = vec2(0.10, -0.07) * sin(t*0.7) + vec2(0.08, 0.06) * cos(t*0.45);
  vec2 q = p + drift * (0.25 + 0.75*uMid);

  // scale controls cell size; bass grows large-scale deformation
  float scale = mix(6.5, 4.2, uBass);
  vec2 x = q * scale + vec2(0.0, t*0.35);

  vec2 cellId, cellCenter;
  float edgeDist;
  (void)smoothVoronoi(x, cellId, cellCenter, edgeDist);

  // edge thickness: treble tightens, bass thickens
  float edge = smoothstep(0.020 + 0.020*uBass, 0.080 - 0.030*uTreble, edgeDist);

  // interior shading: subtle “glass thickness” via radial from center + energy
  vec2 f = fract(x);
  vec2 centerF = fract(cellCenter);
  vec2 dv = f - centerF;
  dv.x *= uRes.x / uRes.y;
  float radial = length(dv);

  float thickness = smoothstep(0.90, 0.05, radial);
  thickness = mix(thickness, pow(thickness, 1.6), 0.55 + 0.30*uEnergy);

  // per-cell color
  vec3 k = hash33(cellId);
  vec3 base = stainedGlass(k);

  // add subtle marbling inside the cell so crops remain rich
  float marble = hash12(cellId + floor(uTime*0.8));
  float swirl = sin(8.0*radial + marble*6.28318 + t*0.9);
  float bloom = 0.12 * (0.5 + 0.5*swirl) * (0.35 + 0.65*uMid);

  vec3 col = base * (0.65 + 0.45*thickness) + bloom;

  // lead lines (borders)
  vec3 lead = vec3(0.03, 0.03, 0.04);
  col = mix(lead, col, edge);

  // treble shimmer along edges
  float shimmer = (1.0 - edge) * (0.10 + 0.22*uTreble) * (0.6 + 0.4*sin(t*5.0 + k.x*10.0));
  col += vec3(0.95, 0.92, 0.85) * shimmer;

  // vignette (soft, stained-glass look likes a frame)
  float r = length(p);
  float vig = smoothstep(1.25, 0.20, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22 * uEnergy;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

export function createMosaicDriftTheme(): Theme {
  let program: WebGLProgram | null = null
  let tri: {vao: WebGLVertexArrayObject | null; buf: WebGLBuffer | null} | null = null
  let uRes: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uEnergy: WebGLUniformLocation | null = null
  let uBass: WebGLUniformLocation | null = null
  let uMid: WebGLUniformLocation | null = null
  let uTreble: WebGLUniformLocation | null = null

  return {
    name: 'mosaic-drift',
    init(gl) {
      program = createProgram(gl, VS, FS)
      tri = makeFullscreenTriangle(gl)
      uRes = gl.getUniformLocation(program, 'uRes')
      uTime = gl.getUniformLocation(program, 'uTime')
      uEnergy = gl.getUniformLocation(program, 'uEnergy')
      uBass = gl.getUniformLocation(program, 'uBass')
      uMid = gl.getUniformLocation(program, 'uMid')
      uTreble = gl.getUniformLocation(program, 'uTreble')
    },
    render(gl, opts) {
      if (!program || !tri) return
      const bass = opts.audio.bass ?? opts.audio.energy
      const mid = opts.audio.mid ?? opts.audio.energy
      const treble = opts.audio.treble ?? opts.audio.energy

      gl.useProgram(program)
      gl.bindVertexArray(tri.vao)

      gl.uniform2f(uRes, opts.width, opts.height)
      gl.uniform1f(uTime, opts.time)
      gl.uniform1f(uEnergy, opts.audio.energy)
      gl.uniform1f(uBass, bass)
      gl.uniform1f(uMid, mid)
      gl.uniform1f(uTreble, treble)

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
