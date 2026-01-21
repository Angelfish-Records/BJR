// web/app/home/player/visualizer/gl/pingpong.ts
// Minimal ping-pong framebuffer helper for WebGL2 feedback shaders.
// Tries RGBA16F if EXT_color_buffer_float is available; falls back to RGBA8.

export type PingPong = {
  w: number
  h: number
  texA: WebGLTexture
  texB: WebGLTexture
  fboA: WebGLFramebuffer
  fboB: WebGLFramebuffer
  useFloat: boolean
  srcTex: () => WebGLTexture
  dstFbo: () => WebGLFramebuffer
  swap: () => void
  resize: (gl: WebGL2RenderingContext, w: number, h: number) => void
  dispose: (gl: WebGL2RenderingContext) => void
}

function createTex(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  useFloat: boolean
): WebGLTexture {
  const tex = gl.createTexture()
  if (!tex) throw new Error('Failed to create texture')
  gl.bindTexture(gl.TEXTURE_2D, tex)

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  if (useFloat) {
    // RGBA16F requires EXT_color_buffer_float for rendering.
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      w,
      h,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null
    )
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  }

  gl.bindTexture(gl.TEXTURE_2D, null)
  return tex
}

function createFbo(gl: WebGL2RenderingContext, tex: WebGLTexture): WebGLFramebuffer {
  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('Failed to create framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  return fbo
}

export function createPingPong(
  gl: WebGL2RenderingContext,
  w: number,
  h: number
): PingPong {
  const hasFloat = !!gl.getExtension('EXT_color_buffer_float')
  // Note: OES_texture_float_linear is not required for HALF_FLOAT linear filtering in WebGL2;
  // but some drivers can be picky. If you see artifacts, force fallback by setting hasFloat=false.
  const useFloat = hasFloat

  let texA = createTex(gl, w, h, useFloat)
  let texB = createTex(gl, w, h, useFloat)
  let fboA = createFbo(gl, texA)
  let fboB = createFbo(gl, texB)

  let flip = false

  const api: PingPong = {
    w,
    h,
    texA,
    texB,
    fboA,
    fboB,
    useFloat,
    srcTex: () => (flip ? texB : texA),
    dstFbo: () => (flip ? fboA : fboB),
    swap: () => {
      flip = !flip
    },
    resize: (gl2, nw, nh) => {
      if (nw === api.w && nh === api.h) return
      api.w = nw
      api.h = nh

      // delete old
      gl2.deleteFramebuffer(fboA)
      gl2.deleteFramebuffer(fboB)
      gl2.deleteTexture(texA)
      gl2.deleteTexture(texB)

      // recreate
      texA = createTex(gl2, nw, nh, useFloat)
      texB = createTex(gl2, nw, nh, useFloat)
      fboA = createFbo(gl2, texA)
      fboB = createFbo(gl2, texB)

      api.texA = texA
      api.texB = texB
      api.fboA = fboA
      api.fboB = fboB
    },
    dispose: (gl2) => {
      gl2.deleteFramebuffer(fboA)
      gl2.deleteFramebuffer(fboB)
      gl2.deleteTexture(texA)
      gl2.deleteTexture(texB)
    },
  }

  return api
}
