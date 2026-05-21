// web/app/home/player/visualizer/core/VisualizerFrameRenderer.ts

import type {
  AudioFeatures,
  Theme,
  VisualizerRenderMode,
} from "../types";

import { RenderTarget } from "./RenderTarget";
import { PresentPass } from "./PresentPass";

export type VisualizerFrameRendererOptions = {
  gl: WebGL2RenderingContext;
  width: number;
  height: number;
  dpr: number;
  mode: VisualizerRenderMode;
};

export type RenderFrameArgs = {
  theme: Theme;
  time: number;
  frameIndex?: number;
  audio: AudioFeatures;
  seed?: number;
  presentToScreen?: boolean;
};

export class VisualizerFrameRenderer {
  readonly gl: WebGL2RenderingContext;

  private width: number;
  private height: number;
  private dpr: number;
  private readonly mode: VisualizerRenderMode;

  private readonly presentPass: PresentPass;
  private readonly presentTarget: RenderTarget;

  private disposed = false;

  constructor(opts: VisualizerFrameRendererOptions) {
    this.gl = opts.gl;

    this.width = Math.max(2, Math.floor(opts.width));
    this.height = Math.max(2, Math.floor(opts.height));
    this.dpr = Math.max(0.25, opts.dpr);
    this.mode = opts.mode;

    this.presentPass = new PresentPass(this.gl);
    this.presentPass.init();

    this.presentTarget = new RenderTarget(
      this.gl,
      this.width,
      this.height,
    );
  }

  setSize(width: number, height: number, dpr: number): void {
    if (this.disposed) {
      throw new Error("VisualizerFrameRenderer has been disposed");
    }

    this.width = Math.max(2, Math.floor(width));
    this.height = Math.max(2, Math.floor(height));
    this.dpr = Math.max(0.25, dpr);

    this.presentTarget.resize(this.width, this.height);
  }

  renderFrame(args: RenderFrameArgs): void {
    if (this.disposed) {
      throw new Error("VisualizerFrameRenderer has been disposed");
    }

    const gl = this.gl;

    const prevFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;

    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.presentTarget.fbo);

      gl.viewport(0, 0, this.width, this.height);

      args.theme.render(gl, {
        time: args.time,
        frameIndex: args.frameIndex,
        width: this.width,
        height: this.height,
        dpr: this.dpr,
        audio: args.audio,
        seed: args.seed,
        mode: this.mode,
      });

      if (args.presentToScreen) {
        this.presentPass.render({
          texture: this.presentTarget.tex,
          target: {
            framebuffer: null,
            width: this.width,
            height: this.height,
          },
          flipY: false,
        });
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);

      gl.viewport(
        prevViewport[0],
        prevViewport[1],
        prevViewport[2],
        prevViewport[3],
      );
    }
  }

  get texture(): WebGLTexture {
    return this.presentTarget.tex;
  }

  get framebuffer(): WebGLFramebuffer {
    return this.presentTarget.fbo;
  }

  get renderTarget(): RenderTarget {
    return this.presentTarget;
  }

  readPixelsInto(target: Uint8Array): void {
    if (this.disposed) {
      throw new Error("VisualizerFrameRenderer has been disposed");
    }

    const gl = this.gl;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.presentTarget.fbo);

    gl.readPixels(
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      target,
    );

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  clear(r = 0, g = 0, b = 0, a = 0): void {
    this.presentTarget.clear(r, g, b, a);
  }

  dispose(): void {
    if (this.disposed) return;

    this.presentTarget.dispose();
    this.presentPass.dispose();

    this.disposed = true;
  }
}