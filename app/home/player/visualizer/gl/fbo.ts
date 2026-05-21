// web/app/home/player/visualizer/gl/fbo.ts
// Robust single-target FBO helper for WebGL2.
// Prefers RGBA16F when renderable; falls back to RGBA8.

export type FboTex = {
  w: number;
  h: number;
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  useFloat: boolean;
  clear: (
    gl: WebGL2RenderingContext,
    r?: number,
    g?: number,
    b?: number,
    a?: number,
  ) => void;
  resize: (gl: WebGL2RenderingContext, w: number, h: number) => void;
  dispose: (gl: WebGL2RenderingContext) => void;
};

type FboResources = {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  useFloat: boolean;
};

function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

function framebufferStatusName(
  gl: WebGL2RenderingContext,
  status: number,
): string {
  if (status === gl.FRAMEBUFFER_COMPLETE) return "FRAMEBUFFER_COMPLETE";
  if (status === gl.FRAMEBUFFER_INCOMPLETE_ATTACHMENT) {
    return "FRAMEBUFFER_INCOMPLETE_ATTACHMENT";
  }
  if (status === gl.FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT) {
    return "FRAMEBUFFER_INCOMPLETE_MISSING_ATTACHMENT";
  }
  if (status === gl.FRAMEBUFFER_INCOMPLETE_DIMENSIONS) {
    return "FRAMEBUFFER_INCOMPLETE_DIMENSIONS";
  }
  if (status === gl.FRAMEBUFFER_UNSUPPORTED) return "FRAMEBUFFER_UNSUPPORTED";
  if (status === gl.FRAMEBUFFER_INCOMPLETE_MULTISAMPLE) {
    return "FRAMEBUFFER_INCOMPLETE_MULTISAMPLE";
  }

  return `UNKNOWN_FRAMEBUFFER_STATUS(${status})`;
}

function createTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create FBO texture");

  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    useFloat ? gl.RGBA16F : gl.RGBA8,
    w,
    h,
    0,
    gl.RGBA,
    useFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE,
    null,
  );

  gl.bindTexture(gl.TEXTURE_2D, null);

  return tex;
}

function createFramebuffer(
  gl: WebGL2RenderingContext,
  tex: WebGLTexture,
): WebGLFramebuffer {
  const fbo = gl.createFramebuffer();
  if (!fbo) throw new Error("Failed to create framebuffer");

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

  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    gl.deleteFramebuffer(fbo);
    throw new Error(`Framebuffer incomplete: ${framebufferStatusName(gl, status)}`);
  }

  return fbo;
}

function disposeResources(
  gl: WebGL2RenderingContext,
  resources: Partial<FboResources>,
): void {
  if (resources.fbo) gl.deleteFramebuffer(resources.fbo);
  if (resources.tex) gl.deleteTexture(resources.tex);
}

function createResources(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean,
): FboResources {
  const resources: Partial<FboResources> = {};

  try {
    resources.tex = createTexture(gl, w, h, useFloat);
    resources.fbo = createFramebuffer(gl, resources.tex);

    return {
      tex: resources.tex,
      fbo: resources.fbo,
      useFloat,
    };
  } catch (err) {
    disposeResources(gl, resources);
    throw err;
  }
}

function canUseFloatFramebuffer(gl: WebGL2RenderingContext): boolean {
  const hasRenderableFloat = !!gl.getExtension("EXT_color_buffer_float");
  if (!hasRenderableFloat) return false;

  let test: FboResources | null = null;

  try {
    test = createResources(gl, 1, 1, true);
    return true;
  } catch (err) {
    console.warn("[gl] Falling back to RGBA8 FBO texture", err);
    return false;
  } finally {
    if (test) disposeResources(gl, test);
  }
}

function clearFbo(
  gl: WebGL2RenderingContext,
  fbo: WebGLFramebuffer,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.viewport(0, 0, w, h);
  gl.clearColor(r, g, b, a);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function createFboTex(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): FboTex {
  const width = clampDimension(w);
  const height = clampDimension(h);
  const useFloat = canUseFloatFramebuffer(gl);

  let resources = createResources(gl, width, height, useFloat);
  let disposed = false;

  const api: FboTex = {
    w: width,
    h: height,
    tex: resources.tex,
    fbo: resources.fbo,
    useFloat: resources.useFloat,

    clear: (gl2, r = 0, g = 0, b = 0, a = 0) => {
      if (disposed) throw new Error("FboTex has been disposed");

      clearFbo(gl2, resources.fbo, api.w, api.h, r, g, b, a);
      gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
    },

    resize: (gl2, nw, nh) => {
      if (disposed) throw new Error("FboTex has been disposed");

      const nextW = clampDimension(nw);
      const nextH = clampDimension(nh);

      if (nextW === api.w && nextH === api.h) return;

      const nextResources = createResources(gl2, nextW, nextH, useFloat);
      disposeResources(gl2, resources);

      resources = nextResources;

      api.w = nextW;
      api.h = nextH;
      api.tex = resources.tex;
      api.fbo = resources.fbo;
      api.useFloat = resources.useFloat;
    },

    dispose: (gl2) => {
      if (disposed) return;

      disposeResources(gl2, resources);
      disposed = true;
    },
  };

  api.clear(gl);

  return api;
}