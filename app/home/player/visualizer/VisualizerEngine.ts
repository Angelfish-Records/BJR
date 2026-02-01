// web/app/home/player/visualizer/VisualizerEngine.ts
"use client";

import type { Theme, AudioFeatures } from "./types";
import { createProgram, makeFullscreenTriangle } from "./gl";
import { createPortalWipe, type PortalWipe } from "./transition/portalWipe";

type EngineOpts = {
  canvas: HTMLCanvasElement;
  getAudio: () => AudioFeatures;
  theme: Theme; // initial (can be blank)
};

type StageTier = "idle" | "active" | "transition";

type TierCfg = {
  fpsCap: number; // render cap; raf still runs
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

type FboTex8 = {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
  resize: (gl: WebGL2RenderingContext, w: number, h: number) => void;
  dispose: (gl: WebGL2RenderingContext) => void;
};

function createFboTexRGBA8(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): FboTex8 {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA8,
    Math.max(2, w),
    Math.max(2, h),
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null,
  );

  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("createFramebuffer failed");
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(
    gl.FRAMEBUFFER,
    gl.COLOR_ATTACHMENT0,
    gl.TEXTURE_2D,
    tex,
    0,
  );

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    throw new Error(`RGBA8 FBO incomplete: ${status}`);
  }

  const out: FboTex8 = {
    fbo,
    tex,
    w: Math.max(2, w),
    h: Math.max(2, h),
    resize(gl2, w2, h2) {
      const W = Math.max(2, w2);
      const H = Math.max(2, h2);
      if (W === out.w && H === out.h) return;
      out.w = W;
      out.h = H;
      gl2.bindTexture(gl2.TEXTURE_2D, out.tex);
      gl2.texImage2D(
        gl2.TEXTURE_2D,
        0,
        gl2.RGBA8,
        W,
        H,
        0,
        gl2.RGBA,
        gl2.UNSIGNED_BYTE,
        null,
      );
      gl2.bindTexture(gl2.TEXTURE_2D, null);
    },
    dispose(gl2) {
      gl2.deleteFramebuffer(out.fbo);
      gl2.deleteTexture(out.tex);
    },
  };

  return out;
}

const PRESENT_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const PRESENT_FS = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uFlipY; // 0 or 1

void main() {
  vec2 uv = vUv;
  if (uFlipY > 0.5) uv.y = 1.0 - uv.y;
  fragColor = texture(uTex, uv);
}
`;

function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

function pickSnapshotCapPx(): number {
  // Conservative: reduce memory & bandwidth pressure on mobile.
  const mobile = isLikelyMobile();
  type NavigatorMaybeMemory = Navigator & { deviceMemory?: number };
  const dm =
    typeof navigator !== "undefined"
      ? (navigator as NavigatorMaybeMemory).deviceMemory
      : undefined;

  if (mobile) return 512;
  if (typeof dm === "number" && dm > 0 && dm <= 4) return 512;
  return 768;
}

export class VisualizerEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;

  private getAudio: () => AudioFeatures;

  private ro: ResizeObserver | null = null;
  private raf: number | null = null;
  private parent: HTMLElement | null = null;

  private w = 1; // CSS px width of parent
  private h = 1; // CSS px height of parent

  private baseDpr = 1;
  private dprScale = 0.7;
  private tier: StageTier = "idle";
  private lastTier: StageTier = "idle";
  private lastTierChangeAtMs = 0;

  private lastDrawMs = 0;

  private lastT = 0;
  private avgFrameCostMs = 16.7;

  // Themes
  private currentTheme: Theme; // what we consider "main"
  private idleTheme: Theme | null = null;

  // Transition plumbing
  private mode: StageMode = { mode: "idle" };
  private fromFbo: FboTex8 | null = null;
  private toFbo: FboTex8 | null = null;
  private wipe: PortalWipe | null = null;

  // Present plumbing (Route B core)
  private presentFbo: FboTex8 | null = null;
  private presentProg: WebGLProgram | null = null;
  private presentTri: {
    vao: WebGLVertexArrayObject | null;
    buf: WebGLBuffer | null;
  } | null = null;
  private uPresentTex: WebGLUniformLocation | null = null;
  private uPresentFlipY: WebGLUniformLocation | null = null;

  // Snapshot plumbing (stable sip source)
  private snapFbo: FboTex8 | null = null;
  private snapCanvas: HTMLCanvasElement;
  private snapCtx: CanvasRenderingContext2D;
  private snapCapPx = pickSnapshotCapPx();
  private snapFps = 12;
  private lastSnapAtMs = 0;

  private snapW = 2;
  private snapH = 2;
  private snapBufAB: ArrayBuffer = new ArrayBuffer(2 * 2 * 4);
  private snapBufU8: Uint8Array = new Uint8Array(this.snapBufAB);

  // Always create ImageData by dimensions (avoids TypedArray overload issues in TS)
  private snapImageData: ImageData = new ImageData(2, 2);
  private snapBufClamp: Uint8ClampedArray = this.snapImageData.data;

  // Targets requested by UI
  private wantPlaying = false;
  private targetTheme: Theme | null = null;

  // --- sizing state ---
  private appliedDpr = 0; // quantized effective DPR used for backing-store size
  private lastResizeAtMs = 0;
  private lastCssW = 0;
  private lastCssH = 0;
  private cssDirty = true; // force first-time size apply
  private lastBackW = 0;
  private lastBackH = 0;

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
      preserveDrawingBuffer: false, // Route B: fast path, never sample default framebuffer
      powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 not available");
    this.gl = gl;

    // Stable snapshot canvas (2D) used for sip.
    const sc = document.createElement("canvas");
    const sctx = sc.getContext("2d", { alpha: true });
    if (!sctx) throw new Error("2D canvas not available");
    this.snapCanvas = sc;
    this.snapCtx = sctx;

    this.currentTheme.init(this.gl);
    this.ensurePresentResources();
  }

  /** The stable 2D snapshot canvas that should be registered into visualSurface for sip consumers. */
  getStableSnapshotCanvas(): HTMLCanvasElement {
    return this.snapCanvas;
  }

  /** Set the always-available idle theme. Engine owns it and will dispose on replacement. */
  setIdleTheme(next: Theme) {
    if (
      !next ||
      typeof next.init !== "function" ||
      typeof next.render !== "function"
    )
      return;
    if (this.idleTheme === next) return;

    const gl = this.gl;
    try {
      this.idleTheme?.dispose(gl);
    } catch {}
    this.idleTheme = next;
    this.idleTheme.init(gl);
  }

  /** Request "playing" vs "idle". This is the state machine input. */
  setWantPlaying(
    want: boolean,
    opts?: { transitionMs?: number; toIdleTransition?: boolean },
  ) {
    const nextWant = !!want;
    const prevWant = this.wantPlaying;
    this.wantPlaying = nextWant;

    // If we just requested idle and we don't want a transition to idle, snap tier immediately.
    if (!nextWant && prevWant && opts?.toIdleTransition === false) {
      this.mode = { mode: "idle" };
      this.tier = "idle";
    }
  }

  /** Provide the target theme (track theme). Engine owns it and will dispose old target/theme on swap. */
  setTargetTheme(next: Theme) {
    if (
      !next ||
      typeof next.init !== "function" ||
      typeof next.render !== "function"
    )
      return;
    if (this.targetTheme === next) return;

    const gl = this.gl;
    try {
      this.targetTheme?.dispose(gl);
    } catch {}

    this.targetTheme = next;
    this.targetTheme.init(gl);
  }

  /** Convenience: swap "current main" theme without recreating canvas/GL/RAF. */
  private setCurrentTheme(next: Theme) {
    if (
      !next ||
      typeof next.init !== "function" ||
      typeof next.render !== "function"
    )
      return;
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
      const rawDpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

      // Clamp base DPR (device DPR) – keep stable-ish.
      this.baseDpr = Math.max(1, Math.min(2, rawDpr));

      // Integer CSS px box size. (This is what should drive backing store changes.)
      const nextW = Math.max(1, Math.floor(r.width));
      const nextH = Math.max(1, Math.floor(r.height));

      if (nextW !== this.w || nextH !== this.h) {
        this.w = nextW;
        this.h = nextH;
        this.cssDirty = true;
      }

      // Only touch CSS sizing on resize events, not every frame.
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

      // FPS cap per tier
      const fpsCap = TIER[this.tier].fpsCap;
      const minFrame = 1000 / Math.max(1, fpsCap);
      if (this.lastDrawMs && tNowMs - this.lastDrawMs < minFrame) {
        this.raf = window.requestAnimationFrame(loop);
        return;
      }
      this.lastDrawMs = tNowMs;

      const frameStart = performance.now();

      // Step state machine before drawing (tier may change here)
      this.advanceStage(tNowMs);

      // Apply backing-store size *after* tier decisions
      this.applyCanvasSize(tNowMs);

      // Ensure FBO sizes match backing store
      this.ensurePresentFboSized();

      const gl = this.gl;
      const audio = this.getAudio();
      const time = tNowMs / 1000;

      // Route B: render into presentFbo, never into default framebuffer.
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);

      if (this.mode.mode === "transition") {
        this.ensureTransitionResources();
        this.resizeTransitionResources(this.presentFbo!.w, this.presentFbo!.h);

        const fromFbo = this.fromFbo!;
        const toFbo = this.toFbo!;
        const wipe = this.wipe!;

        // Render "to" theme into toFbo (current frame)
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
          dpr: this.appliedDpr || this.baseDpr * this.dprScale,
          audio,
        });
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        const p01 = easeInOut(
          (tNowMs - this.mode.startMs) / Math.max(1, this.mode.durMs),
        );
        const onset01 = clamp(this.mode.onset01, 0, 1);

        // Render wipe into presentFbo
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.presentFbo!.fbo);
        gl.viewport(0, 0, this.presentFbo!.w, this.presentFbo!.h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        wipe.render(gl, {
          fromTex: fromFbo.tex, // correct: from is snapshot, to is new
          toTex: toFbo.tex,
          width: this.presentFbo!.w,
          height: this.presentFbo!.h,
          time,
          progress01: p01,
          onset01,
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // onset decay
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
        const theme = useIdle
          ? (this.idleTheme ?? this.currentTheme)
          : this.currentTheme;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.presentFbo!.fbo);
        gl.viewport(0, 0, this.presentFbo!.w, this.presentFbo!.h);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        theme.render(gl, {
          time,
          width: this.presentFbo!.w,
          height: this.presentFbo!.h,
          dpr: this.appliedDpr || this.baseDpr * this.dprScale,
          audio,
        });

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      }

      // Present pass: draw presentFbo.tex to the default framebuffer
      this.presentToScreen();

      // Snapshot pass: occasionally downsample + readPixels into stable 2D canvas
      this.maybeUpdateSnapshot(tNowMs);

      // Adaptive DPR target (quality signal)
      const frameCost = performance.now() - frameStart;
      this.avgFrameCostMs = this.avgFrameCostMs * 0.9 + frameCost * 0.1;

      if (this.avgFrameCostMs > 20)
        this.dprScale = Math.max(0.5, this.dprScale * 0.95);
      else if (this.avgFrameCostMs < 12)
        this.dprScale = Math.min(1.0, this.dprScale * 1.02);

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
      this.presentFbo?.dispose(gl);
    } catch {}
    this.presentFbo = null;

    try {
      this.snapFbo?.dispose(gl);
    } catch {}
    this.snapFbo = null;

    try {
      try {
        if (this.presentTri?.buf) gl.deleteBuffer(this.presentTri.buf);
        if (this.presentTri?.vao) gl.deleteVertexArray(this.presentTri.vao);
      } catch {}
      this.presentTri = null;
    } catch {}
    this.presentTri = null;

    try {
      if (this.presentProg) gl.deleteProgram(this.presentProg);
    } catch {}
    this.presentProg = null;

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
      const lose = gl.getExtension("WEBGL_lose_context") as {
        loseContext?: () => void;
      } | null;
      lose?.loseContext?.();
    } catch {}
  }

  /** The state machine step: decides when to transition, and captures "from" when needed. */
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
      // Treat tier changes as “size sensitive” moments where a one-off resize is acceptable.
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

    this.ensurePresentFboSized();
    this.ensureTransitionResources();
    this.resizeTransitionResources(this.presentFbo!.w, this.presentFbo!.h);

    const gl = this.gl;
    const fromFbo = this.fromFbo!;

    const audio = this.getAudio();
    const time = tNowMs / 1000;

    const snapshotTheme =
      this.mode.mode === "idle"
        ? (this.idleTheme ?? this.currentTheme)
        : this.currentTheme;

    // Capture "from" into fromFbo exactly once at transition start.
    gl.bindFramebuffer(gl.FRAMEBUFFER, fromFbo.fbo);
    gl.viewport(0, 0, fromFbo.w, fromFbo.h);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    snapshotTheme.render(gl, {
      time,
      width: fromFbo.w,
      height: fromFbo.h,
      dpr: this.appliedDpr || this.baseDpr * this.dprScale,
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
    if (!this.fromFbo) this.fromFbo = createFboTexRGBA8(gl, 2, 2);
    if (!this.toFbo) this.toFbo = createFboTexRGBA8(gl, 2, 2);
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

  private ensurePresentResources() {
    const gl = this.gl;
    if (!this.presentProg) {
      this.presentProg = createProgram(gl, PRESENT_VS, PRESENT_FS);
      this.uPresentTex = gl.getUniformLocation(this.presentProg, "uTex");
      this.uPresentFlipY = gl.getUniformLocation(this.presentProg, "uFlipY");
    }
    if (!this.presentTri) {
      this.presentTri = makeFullscreenTriangle(gl);
    }
  }

  private ensurePresentFboSized() {
    const gl = this.gl;
    this.ensurePresentResources();

    const W = Math.max(2, this.canvas.width);
    const H = Math.max(2, this.canvas.height);

    if (!this.presentFbo) this.presentFbo = createFboTexRGBA8(gl, W, H);
    else this.presentFbo.resize(gl, W, H);
  }

  private presentToScreen() {
    const gl = this.gl;
    if (!this.presentFbo || !this.presentProg || !this.presentTri) return;

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.useProgram(this.presentProg);
    gl.bindVertexArray(this.presentTri.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.presentFbo.tex);
    gl.uniform1i(this.uPresentTex, 0);
    gl.uniform1f(this.uPresentFlipY, 0.0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
  }

  private maybeUpdateSnapshot(nowMs: number) {
    const gl = this.gl;
    if (!this.presentFbo || !this.presentProg || !this.presentTri) return;

    const minFrame = 1000 / Math.max(1, this.snapFps);
    if (this.lastSnapAtMs && nowMs - this.lastSnapAtMs < minFrame) return;
    this.lastSnapAtMs = nowMs;

    // Compute snapshot size capped by snapCapPx on the longer edge.
    const srcW = this.presentFbo.w;
    const srcH = this.presentFbo.h;

    const cap = this.snapCapPx;
    const longEdge = Math.max(srcW, srcH);
    const scale = longEdge > cap ? cap / longEdge : 1.0;

    // Keep even-ish and >=2.
    const W = Math.max(2, Math.floor(srcW * scale));
    const H = Math.max(2, Math.floor(srcH * scale));

    // Lazily allocate/resize snap FBO + CPU buffers.
    if (!this.snapFbo) this.snapFbo = createFboTexRGBA8(gl, W, H);
    else this.snapFbo.resize(gl, W, H);

    if (W !== this.snapW || H !== this.snapH) {
      this.snapW = W;
      this.snapH = H;

      this.snapCanvas.width = W;
      this.snapCanvas.height = H;

      this.snapBufAB = new ArrayBuffer(W * H * 4);
      this.snapBufU8 = new Uint8Array(this.snapBufAB);

      // Create ImageData using dimensions (typed correctly everywhere)
      this.snapImageData = new ImageData(W, H);

      // We'll copy bytes into ImageData.data (Uint8ClampedArray)
      this.snapBufClamp = this.snapImageData.data;
    }

    // Downsample present -> snap (flip in shader so readPixels buffer is already top-left oriented)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.snapFbo.fbo);
    gl.viewport(0, 0, this.snapFbo.w, this.snapFbo.h);

    gl.useProgram(this.presentProg);
    gl.bindVertexArray(this.presentTri.vao);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.presentFbo.tex);
    gl.uniform1i(this.uPresentTex, 0);
    gl.uniform1f(this.uPresentFlipY, 1.0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Read pixels from snapFbo
    gl.readPixels(
      0,
      0,
      this.snapFbo.w,
      this.snapFbo.h,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.snapBufU8,
    );

    this.snapBufClamp.set(this.snapBufU8);
    this.snapCtx.putImageData(this.snapImageData, 0, 0);

    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.bindVertexArray(null);
    gl.useProgram(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * Backing-store sizing policy:
   * - Always respond immediately to parent CSS size changes (w/h).
   * - During ACTIVE playback, do NOT resize the backing store just because dprScale changes.
   * - Allow rare DPR-driven resizes only after a long “quiet” period and meaningful delta.
   */
  private applyCanvasSize(nowMs?: number) {
    const t = typeof nowMs === "number" ? nowMs : performance.now();

    const raw = this.baseDpr * this.dprScale;
    const quant = Math.round(raw * 16) / 16; // 1/16th steps

    if (!this.appliedDpr) this.appliedDpr = quant;

    // Calculate the candidate backing store size for current appliedDpr.
    const curW = Math.max(1, Math.floor(this.w * this.appliedDpr));
    const curH = Math.max(1, Math.floor(this.h * this.appliedDpr));

    // Detect parent/CSS size change (dominant reason to resize backing store).
    const cssChanged =
      this.cssDirty || this.lastBackW !== curW || this.lastBackH !== curH;

    // Decide whether we are allowed to adopt a new DPR for backing store.
    const dprDelta = Math.abs(quant - this.appliedDpr);
    const tierIsActive = this.tier === "active";
    const tierJustChanged = t - this.lastTierChangeAtMs < 400;

    // “Quiet” window: only allow DPR-driven backing-store resize when stable for a while.
    const quietLongEnough =
      t - this.lastResizeAtMs > (tierIsActive ? 2200 : 700);

    // Meaningful delta: avoid tiny ping-pong.
    const meaningful = dprDelta >= (tierIsActive ? 0.125 : 0.0625); // 1/8 active, 1/16 idle/transition

    // In active playback: freeze DPR resizes unless CSS changed OR tier just changed OR long quiet + meaningful.
    const allowDprResize =
      !tierIsActive || tierJustChanged || (quietLongEnough && meaningful);

    if (cssChanged) {
      // CSS size changed: snap to quant.
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
}
