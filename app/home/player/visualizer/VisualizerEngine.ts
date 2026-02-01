"use client";

import type { Theme, AudioFeatures } from "./types";
import { createFboTex, type FboTex } from "./gl/fbo";
import { createPortalWipe, type PortalWipe } from "./transition/portalWipe";

type EngineOpts = {
  canvas: HTMLCanvasElement;
  getAudio: () => AudioFeatures;
  theme: Theme; // initial
};

type StageTier = "idle" | "active" | "transition";

type TierCfg = {
  fpsCap: number;
  dprMin: number;
  dprMax: number;
};

const TIER: Record<StageTier, TierCfg> = {
  idle: { fpsCap: 24, dprMin: 0.45, dprMax: 0.62 },
  active: { fpsCap: 60, dprMin: 0.6, dprMax: 1.0 },
  transition: { fpsCap: 60, dprMin: 0.6, dprMax: 1.0 },
};

type StageMode =
  | { mode: "idle" }
  | { mode: "playing" }
  | {
      mode: "transition";
      kind: "toTheme" | "toIdle" | "themeToTheme";
      startMs: number;
      durMs: number;
      onset01: number;
    };

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function easeInOut(x: number) {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
}

/** Toggle via: window.__AF_VIS_DEBUG = true */
function debugEnabled(): boolean {
  const g = globalThis as typeof globalThis & { __AF_VIS_DEBUG?: boolean };
  return g.__AF_VIS_DEBUG === true;
}

type SampleResult = {
  sum: number;
  nonZero: number;
  avgA: number; // avg alpha (0..255)
};

function samplePixels(
  gl: WebGL2RenderingContext,
  x: number,
  y: number,
  w: number,
  h: number,
  scratch: Uint8Array
): SampleResult {
  const need = w * h * 4;
  if (scratch.length < need) scratch = new Uint8Array(need);

  gl.readPixels(x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, scratch);

  let sum = 0;
  let nz = 0;
  let aSum = 0;
  for (let i = 0; i < need; i += 4) {
    const r = scratch[i]!;
    const g = scratch[i + 1]!;
    const b = scratch[i + 2]!;
    const a = scratch[i + 3]!;
    const s = r + g + b + a;
    sum += s;
    if (s !== 0) nz++;
    aSum += a;
  }
  const px = w * h;
  return { sum, nonZero: nz, avgA: px ? aSum / px : 0 };
}

export class VisualizerEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  private getAudio: () => AudioFeatures;

  private ro: ResizeObserver | null = null;
  private raf: number | null = null;
  private parent: HTMLElement | null = null;

  private w = 1;
  private h = 1;

  private baseDpr = 1;
  private dprScale = 0.7;
  private tier: StageTier = "idle";
  private lastTier: StageTier = "idle";
  private lastTierChangeAtMs = 0;

  private lastDrawMs = 0;

  private lastT = 0;
  private avgFrameCostMs = 16.7;

  private currentTheme: Theme;
  private idleTheme: Theme | null = null;

  private mode: StageMode = { mode: "idle" };
  private fromFbo: FboTex | null = null;
  private toFbo: FboTex | null = null;
  private wipe: PortalWipe | null = null;

  private wantPlaying = false;
  private targetTheme: Theme | null = null;

  // --- sizing state ---
  private appliedDpr = 0;
  private lastResizeAtMs = 0;
  private lastCssW = 0;
  private lastCssH = 0;
  private cssDirty = true;
  private lastBackW = 0;
  private lastBackH = 0;

  // --- sampler state ---
  private dbgFrame = 0;
  private dbgScratch = new Uint8Array(8 * 8 * 4);
  private dbgLastLogAt = 0;

  constructor(opts: EngineOpts) {
    this.canvas = opts.canvas;
    this.getAudio = opts.getAudio;
    this.currentTheme = opts.theme;

    const gl = this.canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;

    this.currentTheme.init(this.gl);
  }

  setIdleTheme(next: Theme) {
    if (!next || typeof next.init !== "function" || typeof next.render !== "function") return;
    if (this.idleTheme === next) return;

    const gl = this.gl;
    try {
      this.idleTheme?.dispose(gl);
    } catch {}
    this.idleTheme = next;
    this.idleTheme.init(gl);
  }

  setWantPlaying(want: boolean, opts?: { transitionMs?: number; toIdleTransition?: boolean }) {
    const nextWant = !!want;
    const prevWant = this.wantPlaying;
    this.wantPlaying = nextWant;

    if (!nextWant && prevWant && opts?.toIdleTransition === false) {
      this.mode = { mode: "idle" };
      this.tier = "idle";
    }
  }

  setTargetTheme(next: Theme) {
    if (!next || typeof next.init !== "function" || typeof next.render !== "function") return;
    if (this.targetTheme === next) return;

    const gl = this.gl;
    try {
      this.targetTheme?.dispose(gl);
    } catch {}
    this.targetTheme = next;
    this.targetTheme.init(gl);
  }

  private setCurrentTheme(next: Theme) {
    if (!next || typeof next.init !== "function" || typeof next.render !== "function") return;
    if (next === this.currentTheme) return;

    const gl = this.gl;
    try {
      this.currentTheme.dispose(gl);
    } catch {}
    this.currentTheme = next;
    this.currentTheme.init(gl);
  }

  start() {
    if (this.raf != null) return;

    const parent = this.canvas.parentElement;
    if (!parent) return;
    this.parent = parent;

    const resize = () => {
      if (!this.parent) return;
      const r = this.parent.getBoundingClientRect();
      const rawDpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

      this.baseDpr = Math.max(1, Math.min(2, rawDpr));

      const nextW = Math.max(1, Math.floor(r.width));
      const nextH = Math.max(1, Math.floor(r.height));

      if (nextW !== this.w || nextH !== this.h) {
        this.w = nextW;
        this.h = nextH;
        this.cssDirty = true;
      }

      if (this.lastCssW !== this.w || this.lastCssH !== this.h) {
        this.canvas.style.width = `${this.w}px`;
        this.canvas.style.height = `${this.h}px`;
        this.lastCssW = this.w;
        this.lastCssH = this.h;
      }
    };

    this.ro = new ResizeObserver(resize);
    this.ro.observe(parent);
    resize();

    this.lastT = performance.now();
    this.lastDrawMs = 0;

    const loop = (tNowMs: number) => {
      const dtSec = Math.min(0.05, (tNowMs - this.lastT) / 1000);
      this.lastT = tNowMs;

      const fpsCap = TIER[this.tier].fpsCap;
      const minFrame = 1000 / Math.max(1, fpsCap);
      if (this.lastDrawMs && tNowMs - this.lastDrawMs < minFrame) {
        this.raf = window.requestAnimationFrame(loop);
        return;
      }
      this.lastDrawMs = tNowMs;

      const frameStart = performance.now();

      this.advanceStage(tNowMs);
      this.applyCanvasSize(tNowMs);

      const gl = this.gl;
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      const audio = this.getAudio();
      const time = tNowMs / 1000;

      if (this.mode.mode === "transition") {
        this.ensureTransitionResources();
        this.resizeTransitionResources(this.canvas.width, this.canvas.height);

        const fromFbo = this.fromFbo!;
        const toFbo = this.toFbo!;
        const wipe = this.wipe!;

        const toTheme =
          this.mode.kind === "toIdle"
            ? this.idleTheme
            : (this.targetTheme ?? this.currentTheme);

        gl.bindFramebuffer(gl.FRAMEBUFFER, toFbo.fbo);
        gl.viewport(0, 0, toFbo.w, toFbo.h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        (toTheme ?? this.currentTheme).render(gl, {
          time,
          width: toFbo.w,
          height: toFbo.h,
          dpr: this.baseDpr * this.dprScale,
          audio,
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const p01 = easeInOut((tNowMs - this.mode.startMs) / Math.max(1, this.mode.durMs));
        const onset01 = clamp(this.mode.onset01, 0, 1);

        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        wipe.render(gl, {
          fromTex: toFbo.tex,
          toTex: fromFbo.tex,
          width: this.canvas.width,
          height: this.canvas.height,
          time,
          progress01: p01,
          onset01,
        });

        const decay = dtSec * 2.5;
        this.mode.onset01 = Math.max(0, this.mode.onset01 - decay);

        if (p01 >= 1) {
          if (this.mode.kind === "toIdle") {
            if (this.idleTheme) this.setCurrentTheme(this.idleTheme);
            this.tier = "idle";
            this.mode = { mode: "idle" };
          } else {
            const next = this.targetTheme ?? this.currentTheme;
            this.setCurrentTheme(next);
            this.tier = "active";
            this.mode = { mode: "playing" };
          }
          this.freeTransitionResources();
        }
      } else {
        const useIdle = !this.wantPlaying;
        const theme = useIdle ? (this.idleTheme ?? this.currentTheme) : this.currentTheme;

        theme.render(gl, {
          time,
          width: this.canvas.width,
          height: this.canvas.height,
          dpr: this.baseDpr * this.dprScale,
          audio,
        });
      }

      // ---- sampler (after final render) ----
      this.debugSampleIfNeeded(tNowMs);

      // Adaptive DPR target (quality signal)
      const frameCost = performance.now() - frameStart;
      this.avgFrameCostMs = this.avgFrameCostMs * 0.9 + frameCost * 0.1;

      if (this.avgFrameCostMs > 20) this.dprScale = Math.max(0.5, this.dprScale * 0.95);
      else if (this.avgFrameCostMs < 12) this.dprScale = Math.min(1.0, this.dprScale * 1.02);

      const cfg = TIER[this.tier];
      this.dprScale = clamp(this.dprScale, cfg.dprMin, cfg.dprMax);

      this.raf = window.requestAnimationFrame(loop);
    };

    this.raf = window.requestAnimationFrame(loop);
  }

  stop() {
    if (this.raf != null) window.cancelAnimationFrame(this.raf);
    this.raf = null;
    this.ro?.disconnect();
    this.ro = null;
    this.parent = null;
  }

  dispose() {
    this.stop();

    const gl = this.gl;
    this.freeTransitionResources();

    try {
      this.currentTheme.dispose(gl);
    } catch {}
    try {
      this.idleTheme?.dispose(gl);
    } catch {}
    try {
      this.targetTheme?.dispose(gl);
    } catch {}

    try {
      const lose = gl.getExtension("WEBGL_lose_context") as { loseContext?: () => void } | null;
      lose?.loseContext?.();
    } catch {}
  }

  private advanceStage(tNowMs: number) {
    const want = this.wantPlaying;
    const hasIdle = !!this.idleTheme;
    const hasTarget = !!this.targetTheme;

    if (this.mode.mode !== "transition") {
      this.tier = want ? "active" : "idle";
    }

    if (this.tier !== this.lastTier) {
      this.lastTier = this.tier;
      this.lastTierChangeAtMs = tNowMs;
      this.cssDirty = true;
    }

    if (this.mode.mode === "transition") return;

    if (want) {
      if (hasTarget && this.currentTheme !== this.targetTheme) {
        this.beginTransition(tNowMs, "toTheme");
        return;
      }
      this.mode = { mode: "playing" };
      this.tier = "active";
      return;
    }

    if (hasIdle && this.currentTheme !== this.idleTheme) {
      this.beginTransition(tNowMs, "toIdle");
      return;
    }
    this.mode = { mode: "idle" };
    this.tier = "idle";
  }

  private beginTransition(tNowMs: number, kind: "toTheme" | "toIdle") {
    this.tier = "transition";
    if (this.tier !== this.lastTier) {
      this.lastTier = this.tier;
      this.lastTierChangeAtMs = tNowMs;
      this.cssDirty = true;
    }

    this.ensureTransitionResources();
    this.resizeTransitionResources(this.canvas.width, this.canvas.height);

    const gl = this.gl;
    const fromFbo = this.fromFbo!;

    const audio = this.getAudio();
    const time = tNowMs / 1000;

    const snapshotTheme =
      this.mode.mode === "idle"
        ? (this.idleTheme ?? this.currentTheme)
        : this.currentTheme;

    gl.bindFramebuffer(gl.FRAMEBUFFER, fromFbo.fbo);
    gl.viewport(0, 0, fromFbo.w, fromFbo.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    snapshotTheme.render(gl, {
      time,
      width: fromFbo.w,
      height: fromFbo.h,
      dpr: this.baseDpr * this.dprScale,
      audio,
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    this.mode = {
      mode: "transition",
      kind,
      startMs: tNowMs,
      durMs: kind === "toIdle" ? 700 : 900,
      onset01: 1.0,
    };
  }

  private ensureTransitionResources() {
    const gl = this.gl;
    if (!this.wipe) {
      this.wipe = createPortalWipe();
      this.wipe.init(gl);
    }
    if (!this.fromFbo) this.fromFbo = createFboTex(gl, 2, 2);
    if (!this.toFbo) this.toFbo = createFboTex(gl, 2, 2);
  }

  private resizeTransitionResources(w: number, h: number) {
    const gl = this.gl;
    const W = Math.max(2, w);
    const H = Math.max(2, h);
    this.fromFbo?.resize(gl, W, H);
    this.toFbo?.resize(gl, W, H);
  }

  private freeTransitionResources() {
    const gl = this.gl;
    try {
      this.fromFbo?.dispose(gl);
    } catch {}
    this.fromFbo = null;

    try {
      this.toFbo?.dispose(gl);
    } catch {}
    this.toFbo = null;

    try {
      this.wipe?.dispose(gl);
    } catch {}
    this.wipe = null;
  }

  private applyCanvasSize(nowMs?: number) {
    const t = typeof nowMs === "number" ? nowMs : performance.now();

    const raw = this.baseDpr * this.dprScale;
    const quant = Math.round(raw * 16) / 16;

    if (!this.appliedDpr) this.appliedDpr = quant;

    const curW = Math.max(1, Math.floor(this.w * this.appliedDpr));
    const curH = Math.max(1, Math.floor(this.h * this.appliedDpr));

    const cssChanged = this.cssDirty || this.lastBackW !== curW || this.lastBackH !== curH;

    const dprDelta = Math.abs(quant - this.appliedDpr);
    const tierIsActive = this.tier === "active";
    const tierJustChanged = t - this.lastTierChangeAtMs < 400;

    const quietLongEnough = t - this.lastResizeAtMs > (tierIsActive ? 2200 : 700);
    const meaningful = dprDelta >= (tierIsActive ? 0.125 : 0.0625);

    const allowDprResize =
      !tierIsActive || tierJustChanged || (quietLongEnough && meaningful);

    if (cssChanged) {
      this.appliedDpr = quant;
    } else if (allowDprResize && meaningful && quietLongEnough) {
      this.appliedDpr = quant;
    }

    const dpr = this.appliedDpr;
    const W = Math.max(1, Math.floor(this.w * dpr));
    const H = Math.max(1, Math.floor(this.h * dpr));

    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
      this.lastResizeAtMs = t;
    }

    this.lastBackW = W;
    this.lastBackH = H;
    this.cssDirty = false;
  }

  // --- DEBUG SAMPLER ---
  private debugSampleIfNeeded(nowMs: number) {
    if (!debugEnabled()) return;

    // Sample 1 out of 15 frames to limit stalls.
    this.dbgFrame++;
    if (this.dbgFrame % 15 !== 0) return;

    const gl = this.gl;
    const W = this.canvas.width;
    const H = this.canvas.height;

    // bottom-left origin in GL; sample a tiny patch in a corner.
    const sw = 8;
    const sh = 8;
    const sx = 0;
    const sy = 0;

    // Sample default framebuffer (what user sees).
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const out = samplePixels(gl, sx, sy, sw, sh, this.dbgScratch);

    // Define “blank”: literally all channels 0 OR extremely close to 0 with alpha ~0.
    // (alpha will usually be 255 because alpha:false, but drivers can surprise you.)
    const isBlank = out.sum === 0 || (out.nonZero === 0 && out.avgA < 5);

    if (!isBlank) return;

    // Rate-limit logs so we don't spam.
    if (nowMs - this.dbgLastLogAt < 800) return;
    this.dbgLastLogAt = nowMs;

    // If we're in transition, also sample the FBOs to localise where blackness appears.
    let fromS: SampleResult | null = null;
    let toS: SampleResult | null = null;

    if (this.mode.mode === "transition" && this.fromFbo && this.toFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fromFbo.fbo);
      fromS = samplePixels(gl, 0, 0, sw, sh, this.dbgScratch);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.toFbo.fbo);
      toS = samplePixels(gl, 0, 0, sw, sh, this.dbgScratch);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    const modeTag =
      this.mode.mode === "transition"
        ? `transition:${this.mode.kind}`
        : this.mode.mode;

    console.warn("[VIS] blank-frame detected", {
      atMs: Math.round(nowMs),
      tier: this.tier,
      mode: modeTag,
      wantPlaying: this.wantPlaying,
      canvasCss: { w: this.w, h: this.h },
      backingStore: { w: W, h: H },
      baseDpr: this.baseDpr,
      dprScale: this.dprScale,
      appliedDpr: this.appliedDpr,
      avgFrameCostMs: Math.round(this.avgFrameCostMs * 10) / 10,
      outputSample: out,
      fromFboSample: fromS,
      toFboSample: toS,
      lastResizeAgoMs: Math.round(nowMs - this.lastResizeAtMs),
      lastTierChangeAgoMs: Math.round(nowMs - this.lastTierChangeAtMs),
    });
  }
}
