// web/app/home/player/visualizer/core/TransitionCompositor.ts

import type { PortalWipe } from "../transition/portalWipe";
import { RenderTarget } from "./RenderTarget";

export type PortalWipeCompositeArgs = {
  wipe: PortalWipe;
  from: RenderTarget;
  to: RenderTarget;
  target: RenderTarget;
  time: number;
  progress01: number;
  onset01: number;
};

export class TransitionCompositor {
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  renderPortalWipe(args: PortalWipeCompositeArgs): void {
    if (this.disposed) {
      throw new Error("TransitionCompositor has been disposed");
    }

    const gl = this.gl;

    const prevFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;

    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    try {
      args.target.clear(0, 0, 0, 1);

      gl.bindFramebuffer(gl.FRAMEBUFFER, args.target.fbo);
      gl.viewport(0, 0, args.target.w, args.target.h);

      args.wipe.render(gl, {
        fromTex: args.from.tex,
        toTex: args.to.tex,
        width: args.target.w,
        height: args.target.h,
        time: args.time,
        progress01: args.progress01,
        onset01: args.onset01,
      });
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
  dispose(): void {
    this.disposed = true;
  }
}
