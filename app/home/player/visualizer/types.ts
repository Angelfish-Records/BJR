// web/app/home/player/visualizer/types.ts
export type AudioFeatures = {
  energy: number
  bass?: number
  treble?: number
}

export type Theme = {
  name: string
  init(gl: WebGL2RenderingContext): void
  render(
    gl: WebGL2RenderingContext,
    opts: {
      time: number
      width: number
      height: number
      dpr: number
      audio: AudioFeatures
    }
  ): void
  dispose(gl: WebGL2RenderingContext): void
}
