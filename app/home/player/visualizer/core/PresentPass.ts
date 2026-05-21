// web/app/home/player/visualizer/core/PresentPass.ts

import { createProgram, makeFullscreenTriangle } from "../gl";

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
uniform float uFlipY;

void main() {
  vec2 uv = vUv;
  if (uFlipY > 0.5) uv.y = 1.0 - uv.y;
  fragColor = texture(uTex, uv);
}
`;

export type PresentPassTarget =
  | { framebuffer: WebGLFramebuffer; width: number; height: number }
  | { framebuffer: null; width: number; height: number };

export class PresentPass {
  private program: WebGLProgram | null = null;
  private tri: { vao: WebGLVertexArrayObject; buf: WebGLBuffer } | null = null;
  private uTex: WebGLUniformLocation | null = null;
  private uFlipY: WebGLUniformLocation | null = null;
  private disposed = false;

  constructor(private readonly gl: WebGL2RenderingContext) {}

  init(): void {
    if (this.disposed) throw new Error("PresentPass has been disposed");
    if (this.program && this.tri) return;

    const program = createProgram(this.gl, PRESENT_VS, PRESENT_FS);

    this.program = program;
    this.tri = makeFullscreenTriangle(this.gl);
    this.uTex = this.gl.getUniformLocation(program, "uTex");
    this.uFlipY = this.gl.getUniformLocation(program, "uFlipY");
  }

  render(args: {
    texture: WebGLTexture;
    target: PresentPassTarget;
    flipY?: boolean;
  }): void {
    if (this.disposed) throw new Error("PresentPass has been disposed");

    this.init();

    if (!this.program || !this.tri) return;

    const gl = this.gl;

    const prevFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    const prevViewport = gl.getParameter(gl.VIEWPORT) as Int32Array;

    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, args.target.framebuffer);
      gl.viewport(0, 0, args.target.width, args.target.height);

      gl.useProgram(this.program);
      gl.bindVertexArray(this.tri.vao);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, args.texture);

      gl.uniform1i(this.uTex, 0);
      gl.uniform1f(this.uFlipY, args.flipY ? 1.0 : 0.0);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);
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

    if (this.tri?.buf) this.gl.deleteBuffer(this.tri.buf);
    if (this.tri?.vao) this.gl.deleteVertexArray(this.tri.vao);
    if (this.program) this.gl.deleteProgram(this.program);

    this.tri = null;
    this.program = null;
    this.uTex = null;
    this.uFlipY = null;
    this.disposed = true;
  }
}
