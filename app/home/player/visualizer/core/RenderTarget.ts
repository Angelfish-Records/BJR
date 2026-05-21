// web/app/home/player/visualizer/core/RenderTarget.ts

export class RenderTarget {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;

  private disposed = false;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    w: number,
    h: number,
  ) {
    const width = RenderTarget.clampDimension(w);
    const height = RenderTarget.clampDimension(h);

    const tex = gl.createTexture();
    if (!tex) throw new Error("RenderTarget texture creation failed");

    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );

    const fbo = gl.createFramebuffer();
    if (!fbo) {
      gl.deleteTexture(tex);
      throw new Error("RenderTarget framebuffer creation failed");
    }

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
      throw new Error(`RenderTarget framebuffer incomplete: ${status}`);
    }

    this.fbo = fbo;
    this.tex = tex;
    this.w = width;
    this.h = height;
  }

  static clampDimension(value: number): number {
    if (!Number.isFinite(value)) return 2;
    return Math.max(2, Math.floor(value));
  }

  resize(w: number, h: number): void {
    if (this.disposed) throw new Error("RenderTarget has been disposed");

    const nextW = RenderTarget.clampDimension(w);
    const nextH = RenderTarget.clampDimension(h);

    if (nextW === this.w && nextH === this.h) return;

    this.w = nextW;
    this.h = nextH;

    const gl = this.gl;

    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      nextW,
      nextH,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  clear(r = 0, g = 0, b = 0, a = 0): void {
    if (this.disposed) throw new Error("RenderTarget has been disposed");

    const gl = this.gl;

    const prevFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.viewport(0, 0, this.w, this.h);
      gl.clearColor(r, g, b, a);
      gl.clear(gl.COLOR_BUFFER_BIT);
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
    if (this.disposed) return;

    this.gl.deleteFramebuffer(this.fbo);
    this.gl.deleteTexture(this.tex);

    this.disposed = true;
  }
}
