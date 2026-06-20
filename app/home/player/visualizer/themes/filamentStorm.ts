// web/app/home/player/visualizer/themes/filamentStorm.ts
// black and white pulsating bacteria vibe; needs to have bigger particles
import type { Theme } from "../types";
import { createSinglePassTheme } from "./themeFactory";

// Filament Storm (hairline geometry saturation)
// Inline-tuned: fwidth AA for “band boundaries”, softened highlights, less single-pixel glitter.
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

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  vec2 u = f*f*(3.0-2.0*f);
  return mix(a, b, u.x) + (c - a)*u.y*(1.0-u.x) + (d - b)*u.x*u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.55;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p = mat2(1.70, -1.12, 1.12, 1.70) * p;
    a *= 0.5;
  }
  return v;
}

vec2 flow(vec2 p, float t) {
  float a = fbm(p*1.2 + vec2(t*0.22, -t*0.18));
  float b = fbm(p*1.2 + vec2(-t*0.16, t*0.24));
  vec2 g = vec2(a - 0.5, b - 0.5);
  vec2 v = vec2(g.y, -g.x);
  v += 0.35 * vec2(sin(t*0.12), cos(t*0.10));
  return v * (0.85 + 0.85*uMid);
}

float filamentField(vec2 p, float t) {
  vec2 a = p;
  float s = 0.0;
  float w = 1.0;

  float freq = mix(7.0, 4.2, uBass);

  for (int i = 0; i < 7; i++) {
    vec2 v = flow(a, t);
    a += v * 0.05;

    float n = fbm(a * freq + float(i) * 17.1);
    float r = 1.0 - abs(2.0*n - 1.0);
    s += w * r;

    w *= 0.72;
    freq *= 1.10;
  }

  return s / 2.2;
}

float aaBandLine(float x) {
  // x is fractional distance to band center (0 at band boundary)
  float w = fwidth(x) + 1e-5;
  return 1.0 - smoothstep(0.0, 0.055 + w, x);
}

void main() {
  vec2 uv = vUv;
  vec2 p = (uv * uRes - 0.5 * uRes) / min(uRes.x, uRes.y);

  float t = uTime * 0.10;
  float e = clamp(uEnergy, 0.0, 1.0);

  // SCREEN-friendly base (dark, but not dead)
  // Larger spatial scale: calmer behind text, more negative space.
  vec2 q = p * 0.66;

  float under = fbm(q*1.35 + vec2(0.0, t*0.35));
  vec3 base = mix(vec3(0.012, 0.012, 0.016), vec3(0.040, 0.052, 0.068), under);

  float f = filamentField(q, t);

  // Fewer, wider bands: same behaviour, less visual chatter.
  float bands = 12.0 + 16.0 * uTreble;
  float v = f * bands;
  float frac = fract(v);
  float d = min(frac, 1.0 - frac); // 0 at boundary
  float line = aaBandLine(d);

  // treble shimmer: keep it subtle and broad (no pixel glitter)
  float jitter = fbm(q*5.5 + vec2(t*1.9, -t*1.6));
  float shiver = (0.55 + 0.45*sin(t*6.5 + jitter*6.28318)) * (0.06 + 0.14*uTreble);
  line = clamp(line + shiver * (0.30 + 0.60*line), 0.0, 1.0);

  // bundle control (bass)
float bundle = smoothstep(0.38, 0.92, fbm(q*2.05 + vec2(t*0.6, -t*0.5)));
  float thick = mix(0.48, 0.92, uBass) * bundle;
  float strand = pow(line, mix(1.30, 0.82, thick));

  // Dark pastel iridescence: oil-slick colour, not rainbow neon.
  vec3 ink = vec3(0.030, 0.030, 0.040);
  vec3 pearl = vec3(0.82, 0.84, 0.90);
  vec3 lilac = vec3(0.70, 0.58, 0.90);
  vec3 rose = vec3(0.86, 0.56, 0.68);
  vec3 mint = vec3(0.48, 0.78, 0.72);
  vec3 blue = vec3(0.42, 0.62, 0.92);

  float hueA = fbm(q*1.05 + vec2(5.7, t*0.18));
  float hueB = fbm(q*1.70 + vec2(-t*0.12, 11.3));
  vec3 rainbowA = mix(lilac, rose, smoothstep(0.18, 0.82, hueA));
  vec3 rainbowB = mix(mint, blue, smoothstep(0.20, 0.86, hueB));
  vec3 filamentCol = mix(pearl, mix(rainbowA, rainbowB, hueA), 0.68);

  vec3 col = base;
  col = mix(col, ink, 0.10);
  col += filamentCol * strand * (0.16 + 0.42*e);

  // highlights: broaden + cap (avoid pinprick whites)
  float peak = smoothstep(0.68, 0.96, strand);
  col += filamentCol * peak * (0.08 + 0.18*uTreble);
  col += vec3(0.90, 0.92, 1.00) * peak * (0.025 + 0.07*uTreble);

  float r = length(p);
  float vig = smoothstep(1.35, 0.25, r);
  col *= 0.55 + 0.70 * vig;

  col *= 0.92 + 0.22*e;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function createFilamentStormTheme(): Theme {
  return createSinglePassTheme({
    name: "filament-storm",
    fragmentShader: FS,
    extraFloatUniforms: [
      {
        name: "uBass",
        getValue: (opts) => opts.audio.bass ?? opts.audio.energy,
      },
      {
        name: "uMid",
        getValue: (opts) => opts.audio.mid ?? opts.audio.energy,
      },
      {
        name: "uTreble",
        getValue: (opts) => opts.audio.treble ?? opts.audio.energy,
      },
    ],
  });
}
