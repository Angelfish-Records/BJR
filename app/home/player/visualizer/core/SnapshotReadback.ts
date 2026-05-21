// web/app/home/player/visualizer/core/SnapshotReadback.ts

import { PresentPass } from "./PresentPass";
import { RenderTarget } from "./RenderTarget";

export type SnapshotReadbackOptions = {
  gl: WebGL2RenderingContext;
  presentPass: PresentPass;
  source: RenderTarget;
  width: number;
  height: number;
};

export class SnapshotReadback {
  readonly target: RenderTarget;
  readonly pixels: Uint8Array;

  constructor(private readonly opts: SnapshotReadbackOptions) {
    this.target = new RenderTarget(opts.gl, opts.width, opts.height);
    this.pixels = new Uint8Array(opts.width * opts.height * 4);
  }

  readToCanvas(canvas: HTMLCanvasElement): void {
    const { gl, presentPass, source } = this.opts;

    this.target.resize(this.target.w, this.target.h);

    presentPass.render({
      texture: source.tex,
      target: {
        framebuffer: this.target.fbo,
        width: this.target.w,
        height: this.target.h,
      },
      flipY: true,
    });

    const prevFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.target.fbo);
      gl.readPixels(
        0,
        0,
        this.target.w,
        this.target.h,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        this.pixels,
      );
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, prevFramebuffer);
    }

    canvas.width = this.target.w;
    canvas.height = this.target.h;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const imagePixels = new Uint8ClampedArray(this.pixels.length);
    imagePixels.set(this.pixels);

    ctx.putImageData(
      new ImageData(imagePixels, this.target.w, this.target.h),
      0,
      0,
    );
  }

  dispose(): void {
    this.target.dispose();
  }
}
