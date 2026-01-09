// web/app/home/player/visualizer/VisualizerEngine.ts
'use client'

import type {Theme, AudioFeatures} from './types'

type EngineOpts = {
  canvas: HTMLCanvasElement
  getAudio: () => AudioFeatures
  theme: Theme
}

export class VisualizerEngine {
  private canvas: HTMLCanvasElement
  private gl: WebGL2RenderingContext
  private theme: Theme
  private getAudio: () => AudioFeatures

  private ro: ResizeObserver | null = null
  private raf: number | null = null

  private w = 1
  private h = 1

  private baseDpr = 1
  private dprScale = 0.7

  private lastT = 0
  private acc = 0
  private readonly fixedDt = 1 / 60
  private avgFrameCostMs = 16.7

  constructor(opts: EngineOpts) {
    this.canvas = opts.canvas
    this.getAudio = opts.getAudio
    this.theme = opts.theme

    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    })
    if (!gl) throw new Error('WebGL2 not available')
    this.gl = gl

    this.theme.init(this.gl)
  }

  start() {
    if (this.raf) return

    const parent = this.canvas.parentElement
    if (!parent) return

    const resize = () => {
      const r = parent.getBoundingClientRect()
      const rawDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      this.baseDpr = Math.max(1, Math.min(2, rawDpr))
      this.w = Math.max(1, Math.floor(r.width))
      this.h = Math.max(1, Math.floor(r.height))
      this.applyCanvasSize()
    }

    this.ro = new ResizeObserver(resize)
    this.ro.observe(parent)
    resize()

    this.lastT = performance.now()
    this.acc = 0

    const loop = (tNowMs: number) => {
      const dtSec = Math.min(0.05, (tNowMs - this.lastT) / 1000)
      this.lastT = tNowMs

      // fixed timestep accumulator (reserved for future sim steps)
      this.acc += dtSec
      while (this.acc >= this.fixedDt) this.acc -= this.fixedDt

      const frameStart = performance.now()

      this.applyCanvasSize()

      const gl = this.gl
      gl.viewport(0, 0, this.canvas.width, this.canvas.height)
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.BLEND)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)

      const audio = this.getAudio()

      this.theme.render(gl, {
        time: tNowMs / 1000,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: this.baseDpr * this.dprScale,
        audio,
      })

      const frameCost = performance.now() - frameStart
      this.avgFrameCostMs = this.avgFrameCostMs * 0.9 + frameCost * 0.1

      if (this.avgFrameCostMs > 20) this.dprScale = Math.max(0.5, this.dprScale * 0.95)
      else if (this.avgFrameCostMs < 12) this.dprScale = Math.min(1.0, this.dprScale * 1.02)

      this.raf = window.requestAnimationFrame(loop)
    }

    this.raf = window.requestAnimationFrame(loop)
  }

  stop() {
    if (this.raf) window.cancelAnimationFrame(this.raf)
    this.raf = null
    this.ro?.disconnect()
    this.ro = null
  }

  dispose() {
    this.stop()
    this.theme.dispose(this.gl)
  }

  private applyCanvasSize() {
    const dpr = this.baseDpr * this.dprScale
    const W = Math.max(1, Math.floor(this.w * dpr))
    const H = Math.max(1, Math.floor(this.h * dpr))

    if (this.canvas.width !== W) this.canvas.width = W
    if (this.canvas.height !== H) this.canvas.height = H

    this.canvas.style.width = `${this.w}px`
    this.canvas.style.height = `${this.h}px`
  }
}
