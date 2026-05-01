const VERBOSE_GL_DEBUG = false;

export type FullscreenTriangle = {
  vao: WebGLVertexArrayObject;
  buf: WebGLBuffer;
};

function shaderTypeName(gl: WebGL2RenderingContext, type: number): string {
  if (type === gl.VERTEX_SHADER) return "VERTEX";
  if (type === gl.FRAGMENT_SHADER) return "FRAGMENT";
  return `UNKNOWN(${type})`;
}

function numberSourceLines(source: string): string {
  return source
    .split("\n")
    .map((line, idx) => `${String(idx + 1).padStart(3, " ")}| ${line}`)
    .join("\n");
}

export function createShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("createShader failed");

  gl.shaderSource(sh, source);
  gl.compileShader(sh);

  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const typeName = shaderTypeName(gl, type);
    const infoLog = (gl.getShaderInfoLog(sh) || "").trim();
    const numberedSource = numberSourceLines(source);
    const err = new Error(
      `shader compile failed (${typeName}): ${infoLog || "empty info log"}`,
    );

    let version: string | null = null;
    let shadingLanguageVersion: string | null = null;
    let isContextLost = false;
    let glError: number | null = null;

    try {
      version = String(gl.getParameter(gl.VERSION));
      shadingLanguageVersion = String(
        gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      );
      isContextLost =
        typeof gl.isContextLost === "function" ? gl.isContextLost() : false;
      glError = gl.getError();
    } catch {
      // ignore diagnostic failures
    }

    console.error(`[gl] ${typeName} shader compile failed`, {
      infoLog: infoLog || null,
      version,
      shadingLanguageVersion,
      isContextLost,
      glError,
      ...(VERBOSE_GL_DEBUG ? { source, numberedSource } : {}),
    });

    if (VERBOSE_GL_DEBUG) {
      console.error(`[gl] ${typeName} shader source:\n${numberedSource}`);
    }

    gl.deleteShader(sh);
    throw err;
  }

  return sh;
}

export function createProgram(
  gl: WebGL2RenderingContext,
  vsSource: string,
  fsSource: string,
): WebGLProgram {
  let vs: WebGLShader | null = null;
  let fs: WebGLShader | null = null;
  let program: WebGLProgram | null = null;

  try {
    vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
    fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

    program = gl.createProgram();
    if (!program) throw new Error("createProgram failed");

    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const infoLog = (gl.getProgramInfoLog(program) || "").trim();

      const numberedVsSource = numberSourceLines(vsSource);
      const numberedFsSource = numberSourceLines(fsSource);

      console.error("[gl] program link failed", {
        infoLog: infoLog || null,
        ...(VERBOSE_GL_DEBUG
          ? {
              vsSource,
              fsSource,
              numberedVsSource,
              numberedFsSource,
            }
          : {}),
      });

      if (VERBOSE_GL_DEBUG) {
        console.error(`[gl] LINK vertex shader source:\n${numberedVsSource}`);
        console.error(`[gl] LINK fragment shader source:\n${numberedFsSource}`);
      }

      throw new Error(`program link failed: ${infoLog || "empty info log"}`);
    }

    return program;
  } catch (err) {
    if (program) gl.deleteProgram(program);
    throw err;
  } finally {
    if (vs) gl.deleteShader(vs);
    if (fs) gl.deleteShader(fs);
  }
}

export function makeFullscreenTriangle(
  gl: WebGL2RenderingContext,
): FullscreenTriangle {
  const vao = gl.createVertexArray();
  if (!vao) throw new Error("createVertexArray failed");

  const buf = gl.createBuffer();
  if (!buf) {
    gl.deleteVertexArray(vao);
    throw new Error("createBuffer failed");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);

  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );

  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, buf };
}