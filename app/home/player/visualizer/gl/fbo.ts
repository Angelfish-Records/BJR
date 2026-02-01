// web/app/home/player/visualizer/gl/fbo.ts
// Minimal single-target FBO helper for WebGL2.
// Prefers RGBA16F if EXT_color_buffer_float exists, else RGBA8.

export type FboTex = {
  w: number;
  h: number;
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  useFloat: boolean;
  resize: (gl: WebGL2RenderingContext, w: number, h: number) => void;
  dispose: (gl: WebGL2RenderingContext) => void;
};

function createTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean,
) {
  const tex = gl.createTexture();
  if (!tex) throw new Error("createTexture failed");
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

function createFramebuffer(gl: WebGL2RenderingContext, tex: WebGLTexture) {
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
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

export function createFboTex(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
): FboTex {
  const useFloat = !!gl.getExtension("EXT_color_buffer_float");

  let tex = createTexture(gl, w, h, useFloat);
  let fbo = createFramebuffer(gl, tex);

  const api: FboTex = {
    w,
    h,
    tex,
    fbo,
    useFloat,
    resize: (gl2, nw, nh) => {
      if (nw === api.w && nh === api.h) return;
      api.w = nw;
      api.h = nh;

      gl2.deleteFramebuffer(fbo);
      gl2.deleteTexture(tex);

      tex = createTexture(gl2, nw, nh, useFloat);
      fbo = createFramebuffer(gl2, tex);

      api.tex = tex;
      api.fbo = fbo;
    },
    dispose: (gl2) => {
      try {
        gl2.deleteFramebuffer(fbo);
      } catch {}
      try {
        gl2.deleteTexture(tex);
      } catch {}
    },
  };

  return api;
}
