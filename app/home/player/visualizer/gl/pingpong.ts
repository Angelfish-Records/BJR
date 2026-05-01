// web/app/home/player/visualizer/gl/pingpong.ts
// Robust ping-pong framebuffer helper for WebGL2 feedback shaders.
// Prefers RGBA16F when renderable; falls back to RGBA8.

export type PingPong = {
  w: number;
  h: number;
  texA: WebGLTexture;
  texB: WebGLTexture;
  fboA: WebGLFramebuffer;
  fboB: WebGLFramebuffer;
  useFloat: boolean;
  srcTex: () => WebGLTexture;
  dstFbo: () => WebGLFramebuffer;
  swap: () => void;
  reset: () => void;
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

type PingPongResources = {
  texA: WebGLTexture;
  texB: WebGLTexture;
  fboA: WebGLFramebuffer;
  fboB: WebGLFramebuffer;
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

function createTex(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean,
): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error("Failed to create texture");

  gl.bindTexture(gl.TEXTURE_2D, tex);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (useFloat) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      w,
      h,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA8,
      w,
      h,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    );
  }

  gl.bindTexture(gl.TEXTURE_2D, null);

  return tex;
}

function createFbo(
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
    throw new Error(
      `Framebuffer incomplete: ${framebufferStatusName(gl, status)}`,
    );
  }

  return fbo;
}

function disposeResources(
  gl: WebGL2RenderingContext,
  resources: Partial<PingPongResources>,
): void {
  if (resources.fboA) gl.deleteFramebuffer(resources.fboA);
  if (resources.fboB) gl.deleteFramebuffer(resources.fboB);
  if (resources.texA) gl.deleteTexture(resources.texA);
  if (resources.texB) gl.deleteTexture(resources.texB);
}

function createResources(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean,
): PingPongResources {
  const resources: Partial<PingPongResources> = {};

  try {
    resources.texA = createTex(gl, w, h, useFloat);
    resources.texB = createTex(gl, w, h, useFloat);
    resources.fboA = createFbo(gl, resources.texA);
    resources.fboB = createFbo(gl, resources.texB);

    return {
      texA: resources.texA,
      texB: resources.texB,
      fboA: resources.fboA,
      fboB: resources.fboB,
      useFloat,
    };
  } catch (err) {
    disposeResources(gl, resources);
    throw err;
  }
}

function canUseFloatFramebuffers(gl: WebGL2RenderingContext): boolean {
  const hasRenderableFloat = !!gl.getExtension("EXT_color_buffer_float");
  if (!hasRenderableFloat) return false;

  let test: PingPongResources | null = null;

  try {
    test = createResources(gl, 1, 1, true);
    return true;
  } catch (err) {
    console.warn("[gl] Falling back to RGBA8 ping-pong textures", err);
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

export function createPingPong(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): PingPong {
  const width = clampDimension(w);
  const height = clampDimension(h);
  const useFloat = canUseFloatFramebuffers(gl);

  let resources = createResources(gl, width, height, useFloat);
  let flip = false;
  let disposed = false;

  const api: PingPong = {
    w: width,
    h: height,
    texA: resources.texA,
    texB: resources.texB,
    fboA: resources.fboA,
    fboB: resources.fboB,
    useFloat: resources.useFloat,

    srcTex: () => {
      if (disposed) throw new Error("PingPong has been disposed");
      return flip ? resources.texB : resources.texA;
    },

    dstFbo: () => {
      if (disposed) throw new Error("PingPong has been disposed");
      return flip ? resources.fboA : resources.fboB;
    },

    swap: () => {
      if (disposed) throw new Error("PingPong has been disposed");
      flip = !flip;
    },

    reset: () => {
      if (disposed) throw new Error("PingPong has been disposed");
      flip = false;
    },

    clear: (gl2, r = 0, g = 0, b = 0, a = 0) => {
      if (disposed) throw new Error("PingPong has been disposed");

      clearFbo(gl2, resources.fboA, api.w, api.h, r, g, b, a);
      clearFbo(gl2, resources.fboB, api.w, api.h, r, g, b, a);

      gl2.bindFramebuffer(gl2.FRAMEBUFFER, null);
    },

    resize: (gl2, nw, nh) => {
      if (disposed) throw new Error("PingPong has been disposed");

      const nextW = clampDimension(nw);
      const nextH = clampDimension(nh);

      if (nextW === api.w && nextH === api.h) return;

      const nextResources = createResources(gl2, nextW, nextH, useFloat);
      disposeResources(gl2, resources);

      resources = nextResources;
      flip = false;

      api.w = nextW;
      api.h = nextH;
      api.texA = resources.texA;
      api.texB = resources.texB;
      api.fboA = resources.fboA;
      api.fboB = resources.fboB;
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