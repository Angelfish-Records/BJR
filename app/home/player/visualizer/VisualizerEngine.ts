// web/app/home/player/visualizer/VisualizerEngine.ts
"use client";

import type { Theme, AudioFeatures } from "./types";
import { PresentPass } from "./core/PresentPass";
import { RenderTarget } from "./core/RenderTarget";
import { VisualizerFrameRenderer } from "./core/VisualizerFrameRenderer";
import { SnapshotReadback } from "./core/SnapshotReadback";
import { TransitionCompositor } from "./core/TransitionCompositor";
import { createPortalWipe, type PortalWipe } from "./transition/portalWipe";
import type { StageVariant } from "../mediaSurface";
import { visualizerPerfSurface } from "./visualizerPerfSurface";

type PerformanceProfile = "inline" | "fullscreen";

type EngineOpts = {
  canvas: HTMLCanvasElement;
  getAudio: () => AudioFeatures;
  theme: Theme; // initial (can be blank)
  performanceProfile?: PerformanceProfile;
  stageVariant: StageVariant;
  initialThemeName?: string;
};

type StageTier = "idle" | "active" | "transition";

type TierCfg = {
  fpsCap: number; // render cap; raf still runs
  dprMin: number;
  dprMax: number;
};

function getTierConfig(tier: StageTier, profile: PerformanceProfile): TierCfg {
  if (profile === "fullscreen") {
    switch (tier) {
      case "idle":
        return { fpsCap: 20, dprMin: 0.42, dprMax: 0.56 };
      case "active":
        return { fpsCap: 48, dprMin: 0.56, dprMax: 0.85 };
      case "transition":
        return { fpsCap: 48, dprMin: 0.56, dprMax: 0.85 };
    }
  }

  switch (tier) {
    case "idle":
      return { fpsCap: 24, dprMin: 0.45, dprMax: 0.62 };
    case "active":
      return { fpsCap: 60, dprMin: 0.6, dprMax: 1.0 };
    case "transition":
      return { fpsCap: 60, dprMin: 0.6, dprMax: 1.0 };
  }
}

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

function isLikelyMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod/i.test(ua);
}

function pickSnapshotCapPx(profile: PerformanceProfile): number {
  // Conservative: reduce memory & bandwidth pressure on mobile.
  const mobile = isLikelyMobile();
  type NavigatorMaybeMemory = Navigator & { deviceMemory?: number };
  const dm =
    typeof navigator !== "undefined"
      ? (navigator as NavigatorMaybeMemory).deviceMemory
      : undefined;

  if (profile === "fullscreen") {
    if (mobile) return 384;
    if (typeof dm === "number" && dm > 0 && dm <= 4) return 384;
    return 640;
  }

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
  private fromFbo: RenderTarget | null = null;
  private toFbo: RenderTarget | null = null;
  private wipe: PortalWipe | null = null;
  private transitionCompositor: TransitionCompositor | null = null;

  // Present plumbing (Route B core)
  private frameRenderer: VisualizerFrameRenderer | null = null;
  private presentFbo: RenderTarget | null = null;
  private presentPass: PresentPass | null = null;

  // Snapshot plumbing (stable sip source)
  private snapReadback: SnapshotReadback | null = null;
  private snapFbo: RenderTarget | null = null;
  private snapCanvas: HTMLCanvasElement;
  private snapCtx: CanvasRenderingContext2D;
  private performanceProfile: PerformanceProfile;
  private snapCapPx = 768;
  private snapFps = 12;
  private lastSnapAtMs = 0;
  private snapW = 2;
  private snapH = 2;
  private snapBufAB: ArrayBuffer = new ArrayBuffer(2 * 2 * 4);
  private snapBufU8: Uint8Array = new Uint8Array(this.snapBufAB);

  private stageVariant: StageVariant;
  private themeDebugName = "blank";
  private perfFrames = 0;
  private perfWindowStartMs = 0;
  private fpsObserved = 0;
  private lastPerfPublishAtMs = 0;
  private didLogPresentFailure = false;
  private contextLost = false;
  private disposed = false;

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
    this.performanceProfile = opts.performanceProfile ?? "inline";
    this.stageVariant = opts.stageVariant;
    this.themeDebugName = opts.initialThemeName ?? "blank";
    this.snapCapPx = pickSnapshotCapPx(this.performanceProfile);
    this.snapFps = this.performanceProfile === "fullscreen" ? 8 : 12;

    this.disposed = false;

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

    try {
      const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER);
      const vendor = debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : gl.getParameter(gl.VENDOR);

      console.log("[VisualizerEngine] GL context created", {
        stageVariant: opts.stageVariant,
        performanceProfile: opts.performanceProfile ?? "inline",
        isContextLost:
          typeof gl.isContextLost === "function" ? gl.isContextLost() : false,
        version: gl.getParameter(gl.VERSION),
        shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
        vendor,
        renderer,
      });
    } catch (err) {
      console.warn("[VisualizerEngine] GL context diagnostics failed", err);
    }

    this.canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.stop();
      console.error("[VisualizerEngine] webglcontextlost", {
        stageVariant: this.stageVariant,
      });
    });

    this.canvas.addEventListener("webglcontextrestored", () => {
      this.contextLost = false;
      this.didLogPresentFailure = false;
      console.warn("[VisualizerEngine] webglcontextrestored", {
        stageVariant: this.stageVariant,
      });
    });

    // Stable snapshot canvas (2D) used for sip.
    const sc = document.createElement("canvas");
    const sctx = sc.getContext("2d", { alpha: true });
    if (!sctx) throw new Error("2D canvas not available");
    this.snapCanvas = sc;
    this.snapCtx = sctx;

    try {
      this.currentTheme.init(this.gl);
    } catch (err) {
      console.error("[VisualizerEngine] initial theme init failed", err);
    }

    this.ensurePresentResources();
  }

  /** The stable 2D snapshot canvas that should be registered into visualSurface for sip consumers. */
  getStableSnapshotCanvas(): HTMLCanvasElement {
    return this.snapCanvas;
  }

  setThemeDebugName(name: string) {
    const next = name.trim();
    this.themeDebugName = next.length > 0 ? next : "blank";
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
    const prevIdle = this.idleTheme;

    try {
      next.init(gl);
      this.idleTheme = next;

      if (prevIdle && prevIdle !== next) {
        try {
          prevIdle.dispose(gl);
        } catch {}
      }
    } catch (err) {
      console.error("[VisualizerEngine] idle theme init failed", err);
      this.idleTheme = prevIdle ?? null;
      try {
        next.dispose?.(gl);
      } catch {}
    }
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
    const prevTarget = this.targetTheme;

    try {
      next.init(gl);
      this.targetTheme = next;

      if (prevTarget && prevTarget !== next) {
        try {
          prevTarget.dispose(gl);
        } catch {}
      }
    } catch (err) {
      console.error("[VisualizerEngine] target theme init failed", err);
      this.targetTheme = prevTarget ?? null;
      try {
        next.dispose?.(gl);
      } catch {}
    }
  }

  /** Promote an already-initialized theme to current without re-initializing it. */
  private setCurrentTheme(next: Theme) {
    if (
      !next ||
      typeof next.init !== "function" ||
      typeof next.render !== "function"
    )
      return;
    if (next === this.currentTheme) return;

    const gl = this.gl;
    const prevCurrent = this.currentTheme;

    this.currentTheme = next;

    if (
      prevCurrent &&
      prevCurrent !== next &&
      prevCurrent !== this.idleTheme &&
      prevCurrent !== this.targetTheme
    ) {
      try {
        prevCurrent.dispose(gl);
      } catch {}
    }
  }

  start() {
    if (this.disposed || this.contextLost) return;

    const parent = this.canvas.parentElement;
    if (!parent) return;

    const parentChanged = this.parent !== parent;

    // If already running and parent hasn't changed, nothing to do.
    if (this.raf != null && !parentChanged) return;

    // If parent changed while running, rebind sizing observer without restarting RAF.
    if (parentChanged) {
      try {
        this.ro?.disconnect();
      } catch {}
      this.ro = null;
      this.parent = parent;
      this.cssDirty = true;
    } else {
      this.parent = parent;
    }

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

    // If RAF is already running, we only needed to rebind to the new parent.
    if (this.raf != null) return;

    this.lastT = performance.now();
    this.lastDrawMs = 0;

    const loop = (tNowMs: number) => {
      if (this.disposed || this.contextLost) {
        this.raf = null;
        return;
      }

      const dtSec = Math.min(0.05, (tNowMs - this.lastT) / 1000);
      this.lastT = tNowMs;

      // FPS cap per tier
      const fpsCap = getTierConfig(this.tier, this.performanceProfile).fpsCap;
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

      if (!this.presentPass || !this.presentFbo || !this.frameRenderer) {
        this.raf = window.requestAnimationFrame(loop);
        return;
      }

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

        toFbo.clear(0, 0, 0, 1);

        this.frameRenderer.renderFrame({
          theme: toTheme ?? this.currentTheme,
          time,
          audio,
          target: toFbo,
          presentToScreen: false,
        });

        const p01 = easeInOut(
          (tNowMs - this.mode.startMs) / Math.max(1, this.mode.durMs),
        );
        const onset01 = clamp(this.mode.onset01, 0, 1);

        this.transitionCompositor?.renderPortalWipe({
          wipe,
          from: fromFbo,
          to: toFbo,
          target: this.presentFbo,
          time,
          progress01: p01,
          onset01,
        });

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

        this.frameRenderer.clear(0, 0, 0, 1);

        this.frameRenderer.renderFrame({
          theme,
          time,
          audio,
          presentToScreen: false,
        });
      }

      // Present pass: draw presentFbo.tex to the default framebuffer
      this.presentToScreen();

      // Snapshot pass: occasionally refresh the stable 2D canvas
      this.maybeUpdateSnapshot(tNowMs);

      // Adaptive DPR target (quality signal)
      const frameCost = performance.now() - frameStart;
      this.avgFrameCostMs = this.avgFrameCostMs * 0.9 + frameCost * 0.1;

      if (this.avgFrameCostMs > 20)
        this.dprScale = Math.max(0.5, this.dprScale * 0.95);
      else if (this.avgFrameCostMs < 12)
        this.dprScale = Math.min(1.0, this.dprScale * 1.02);

      const cfg = getTierConfig(this.tier, this.performanceProfile);
      this.dprScale = clamp(this.dprScale, cfg.dprMin, cfg.dprMax);

      this.perfFrames += 1;
      if (!this.perfWindowStartMs) this.perfWindowStartMs = tNowMs;

      const perfElapsedMs = tNowMs - this.perfWindowStartMs;
      if (perfElapsedMs >= 500) {
        this.fpsObserved =
          (this.perfFrames * 1000) / Math.max(1, perfElapsedMs);
        this.perfFrames = 0;
        this.perfWindowStartMs = tNowMs;
      }

      if (
        !this.lastPerfPublishAtMs ||
        tNowMs - this.lastPerfPublishAtMs >= 250
      ) {
        const modeName =
          this.mode.mode === "transition"
            ? "transition"
            : this.mode.mode === "playing"
              ? "playing"
              : "idle";

        visualizerPerfSurface.setMetrics(this.stageVariant, {
          variant: this.stageVariant,
          profile: this.performanceProfile,
          themeName: this.themeDebugName,
          tier: this.tier,
          mode: modeName,
          fpsCap: cfg.fpsCap,
          fpsObserved: this.fpsObserved,
          avgFrameCostMs: this.avgFrameCostMs,
          baseDpr: this.baseDpr,
          dprScale: this.dprScale,
          appliedDpr: this.appliedDpr || this.baseDpr * this.dprScale,
          canvasPxW: this.canvas.width,
          canvasPxH: this.canvas.height,
          snapshotPxW: this.snapW,
          snapshotPxH: this.snapH,
          snapshotFps: this.snapFps,
          updatedAt: tNowMs,
        });
        this.lastPerfPublishAtMs = tNowMs;
      }

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
    visualizerPerfSurface.clearMetrics(this.stageVariant);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    this.stop();

    const gl = this.gl;
    this.freeTransitionResources();

    try {
      this.frameRenderer?.dispose();
    } catch {}
    this.frameRenderer = null;
    this.presentFbo = null;

    try {
      this.snapReadback?.dispose();
    } catch {}
    this.snapReadback = null;
    this.snapFbo = null;

    try {
      this.presentPass?.dispose();
    } catch {}
    this.presentPass = null;

    try {
      this.currentTheme.dispose(gl);
    } catch {}
    try {
      this.idleTheme?.dispose(gl);
    } catch {}
    try {
      this.targetTheme?.dispose(gl);
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
    if (!this.presentPass || !this.presentFbo) {
      this.mode = this.wantPlaying ? { mode: "playing" } : { mode: "idle" };
      return;
    }

    this.ensureTransitionResources();
    this.resizeTransitionResources(this.presentFbo.w, this.presentFbo.h);

    const gl = this.gl;
    const fromFbo = this.fromFbo!;

    // Capture "from" as the *last fully rendered frame* (presentFbo),
    // not a one-off re-render of the theme (which can be blank during swaps/resizes).
    if (this.presentFbo && this.presentPass) {
      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);

      this.presentPass.render({
        texture: this.presentFbo.tex,
        target: {
          framebuffer: fromFbo.fbo,
          width: fromFbo.w,
          height: fromFbo.h,
        },
        flipY: false,
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      // Fallback: render the theme once (should be rare; mainly during very first frames).
      const audio = this.getAudio();
      const time = tNowMs / 1000;

      const snapshotTheme =
        this.mode.mode === "idle"
          ? (this.idleTheme ?? this.currentTheme)
          : this.currentTheme;

      const frameRenderer = this.frameRenderer;
      if (!frameRenderer) return;

      fromFbo.clear(0, 0, 0, 1);

      frameRenderer.renderFrame({
        theme: snapshotTheme,
        time,
        audio,
        target: fromFbo,
        presentToScreen: false,
      });
    }

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
    if (!this.transitionCompositor) {
      this.transitionCompositor = new TransitionCompositor(gl);
    }

    if (!this.wipe) {
      this.wipe = createPortalWipe();
      this.wipe.init(gl);
    }
    if (!this.fromFbo) this.fromFbo = new RenderTarget(gl, 2, 2);
    if (!this.toFbo) this.toFbo = new RenderTarget(gl, 2, 2);
  }

  private resizeTransitionResources(w: number, h: number) {
    const W = Math.max(2, w);
    const H = Math.max(2, h);
    this.fromFbo?.resize(W, H);
    this.toFbo?.resize(W, H);
  }

  private freeTransitionResources() {
    const gl = this.gl;
    try {
      this.fromFbo?.dispose();
    } catch {}
    this.fromFbo = null;

    try {
      this.toFbo?.dispose();
    } catch {}
    this.toFbo = null;

    try {
      this.wipe?.dispose(gl);
    } catch {}
    this.wipe = null;

    try {
      this.transitionCompositor?.dispose();
    } catch {}
    this.transitionCompositor = null;
  }

  private ensurePresentResources() {
    if (this.disposed || this.contextLost) return;

    if (!this.presentPass) {
      try {
        this.presentPass = new PresentPass(this.gl);
        this.presentPass.init();
      } catch (err) {
        if (!this.didLogPresentFailure) {
          console.error("[VisualizerEngine] present pass setup failed", err);
          this.didLogPresentFailure = true;
        }
        this.presentPass = null;
      }
    }
  }

  private ensurePresentFboSized() {
    const gl = this.gl;
    this.ensurePresentResources();

    if (!this.presentPass) return;

    const W = Math.max(2, this.canvas.width);
    const H = Math.max(2, this.canvas.height);
    const dpr = this.appliedDpr || this.baseDpr * this.dprScale;

    if (!this.frameRenderer) {
      this.frameRenderer = new VisualizerFrameRenderer({
        gl,
        width: W,
        height: H,
        dpr,
        mode: "realtime",
      });
    } else {
      this.frameRenderer.setSize(W, H, dpr);
    }

    this.presentFbo = this.frameRenderer.renderTarget;
  }

  private presentToScreen() {
    if (!this.presentFbo || !this.presentPass) return;

    this.presentPass.render({
      texture: this.presentFbo.tex,
      target: {
        framebuffer: null,
        width: this.canvas.width,
        height: this.canvas.height,
      },
      flipY: false,
    });
  }

  private maybeUpdateSnapshot(nowMs: number) {
    const gl = this.gl;
    if (!this.presentFbo || !this.presentPass) return;

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
    if (!this.snapReadback) {
      this.snapReadback = new SnapshotReadback({
        gl,
        presentPass: this.presentPass,
        source: this.presentFbo,
        width: W,
        height: H,
      });

      this.snapFbo = this.snapReadback.target;
    } else {
      this.snapReadback.target.resize(W, H);
      this.snapFbo = this.snapReadback.target;
    }

    if (W !== this.snapW || H !== this.snapH) {
      this.snapW = W;
      this.snapH = H;

      this.snapCanvas.width = W;
      this.snapCanvas.height = H;

      this.snapBufAB = new ArrayBuffer(W * H * 4);
      this.snapBufU8 = new Uint8Array(this.snapBufAB);
    }

    if (!this.snapReadback) return;

    const snapshotCanvas = this.getStableSnapshotCanvas();
    if (!snapshotCanvas) return;

    this.snapReadback.readToCanvas(snapshotCanvas);

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
