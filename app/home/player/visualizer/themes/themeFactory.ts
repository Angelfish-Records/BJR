import type { Theme } from "../types";
import { createProgram, makeFullscreenTriangle } from "../gl";
import { createPingPong, type PingPong } from "../gl/pingpong";

const FULLSCREEN_TRIANGLE_VS = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;

void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

type Triangle = {
  vao: WebGLVertexArrayObject | null;
  buf: WebGLBuffer | null;
};

type SinglePassExtraUniform = {
  name: string;
  getValue: (opts: Parameters<Theme["render"]>[1]) => number;
};

type SinglePassThemeConfig = {
  name: string;
  fragmentShader: string;
  extraFloatUniforms?: readonly SinglePassExtraUniform[];
};

type PingPongThemeConfig = {
  name: string;
  simFragmentShader: string;
  displayFragmentShader: string;
};

function disposeTriangle(gl: WebGL2RenderingContext, tri: Triangle | null) {
  if (tri?.buf) gl.deleteBuffer(tri.buf);
  if (tri?.vao) gl.deleteVertexArray(tri.vao);
}

function disposeProgram(
  gl: WebGL2RenderingContext,
  program: WebGLProgram | null,
) {
  if (program) gl.deleteProgram(program);
}

export function createSinglePassTheme(config: SinglePassThemeConfig): Theme {
  let program: WebGLProgram | null = null;
  let tri: Triangle | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uTime: WebGLUniformLocation | null = null;
  let uEnergy: WebGLUniformLocation | null = null;
  let extraFloatUniforms: Array<{
    location: WebGLUniformLocation | null;
    getValue: SinglePassExtraUniform["getValue"];
  }> = [];

  return {
    name: config.name,

    init(gl) {
      const nextProgram = createProgram(
        gl,
        FULLSCREEN_TRIANGLE_VS,
        config.fragmentShader,
      );

      program = nextProgram;
      tri = makeFullscreenTriangle(gl);
      uRes = gl.getUniformLocation(nextProgram, "uRes");
      uTime = gl.getUniformLocation(nextProgram, "uTime");
      uEnergy = gl.getUniformLocation(nextProgram, "uEnergy");
      extraFloatUniforms = (config.extraFloatUniforms ?? []).map((uniform) => ({
        location: gl.getUniformLocation(nextProgram, uniform.name),
        getValue: uniform.getValue,
      }));
    },

    render(gl, opts) {
      if (!program || !tri) return;

      gl.useProgram(program);
      gl.bindVertexArray(tri.vao);

      gl.uniform2f(uRes, opts.width, opts.height);
      gl.uniform1f(uTime, opts.time);
      gl.uniform1f(uEnergy, opts.audio.energy);

      for (const uniform of extraFloatUniforms) {
        gl.uniform1f(uniform.location, uniform.getValue(opts));
      }

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindVertexArray(null);
      gl.useProgram(null);
    },

    dispose(gl) {
      disposeTriangle(gl, tri);
      tri = null;

      disposeProgram(gl, program);
      program = null;
      extraFloatUniforms = [];
    },
  };
}

export function createPingPongTheme(config: PingPongThemeConfig): Theme {
  let simProgram: WebGLProgram | null = null;
  let displayProgram: WebGLProgram | null = null;
  let tri: Triangle | null = null;
  let pingpong: PingPong | null = null;
  let frame = 0;

  let simPrev: WebGLUniformLocation | null = null;
  let simRes: WebGLUniformLocation | null = null;
  let simTime: WebGLUniformLocation | null = null;
  let simEnergy: WebGLUniformLocation | null = null;
  let simFrame: WebGLUniformLocation | null = null;

  let displayState: WebGLUniformLocation | null = null;
  let displayRes: WebGLUniformLocation | null = null;
  let displayTime: WebGLUniformLocation | null = null;
  let displayEnergy: WebGLUniformLocation | null = null;

  return {
    name: config.name,

    init(gl) {
      simProgram = createProgram(
        gl,
        FULLSCREEN_TRIANGLE_VS,
        config.simFragmentShader,
      );
      displayProgram = createProgram(
        gl,
        FULLSCREEN_TRIANGLE_VS,
        config.displayFragmentShader,
      );
      tri = makeFullscreenTriangle(gl);
      pingpong = createPingPong(gl, 1, 1);
      frame = 0;

      simPrev = gl.getUniformLocation(simProgram, "uPrev");
      simRes = gl.getUniformLocation(simProgram, "uRes");
      simTime = gl.getUniformLocation(simProgram, "uTime");
      simEnergy = gl.getUniformLocation(simProgram, "uEnergy");
      simFrame = gl.getUniformLocation(simProgram, "uFrame");

      displayState = gl.getUniformLocation(displayProgram, "uState");
      displayRes = gl.getUniformLocation(displayProgram, "uRes");
      displayTime = gl.getUniformLocation(displayProgram, "uTime");
      displayEnergy = gl.getUniformLocation(displayProgram, "uEnergy");
    },

    render(gl, opts) {
      if (!simProgram || !displayProgram || !tri || !pingpong) return;

      const outputFramebuffer = gl.getParameter(
        gl.FRAMEBUFFER_BINDING,
      ) as WebGLFramebuffer | null;

      pingpong.resize(gl, opts.width, opts.height);

      gl.bindVertexArray(tri.vao);

      gl.useProgram(simProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, pingpong.dstFbo());
      gl.viewport(0, 0, opts.width, opts.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pingpong.srcTex());

      gl.uniform1i(simPrev, 0);
      gl.uniform2f(simRes, opts.width, opts.height);
      gl.uniform1f(simTime, opts.time);
      gl.uniform1f(simEnergy, opts.audio.energy);
      const renderFrame = opts.frameIndex ?? frame;

      if (renderFrame === 0) {
        pingpong.reset();
        pingpong.clear(gl);
        gl.bindVertexArray(tri.vao);
        gl.useProgram(simProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, pingpong.dstFbo());
        gl.viewport(0, 0, opts.width, opts.height);
      }

      gl.uniform1f(simFrame, renderFrame);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      pingpong.swap();

      gl.useProgram(displayProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
      gl.viewport(0, 0, opts.width, opts.height);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, pingpong.srcTex());

      gl.uniform1i(displayState, 0);
      gl.uniform2f(displayRes, opts.width, opts.height);
      gl.uniform1f(displayTime, opts.time);
      gl.uniform1f(displayEnergy, opts.audio.energy);

      gl.drawArrays(gl.TRIANGLES, 0, 3);

      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindVertexArray(null);
      gl.useProgram(null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);

      frame = renderFrame + 1;
    },

    dispose(gl) {
      pingpong?.dispose(gl);
      pingpong = null;

      disposeTriangle(gl, tri);
      tri = null;

      disposeProgram(gl, simProgram);
      simProgram = null;

      disposeProgram(gl, displayProgram);
      displayProgram = null;
    },
  };
}
