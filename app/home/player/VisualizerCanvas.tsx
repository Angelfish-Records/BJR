// web/app/home/player/VisualizerCanvas.tsx
'use client'

import React from 'react'
import {VisualizerEngine} from './visualizer/VisualizerEngine'
import {createNebulaTheme} from './visualizer/themes/nebula'
import {audioSurface} from './audioSurface'
import type {AudioFeatures} from './visualizer/types'

export default function VisualizerCanvas() {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const engineRef = React.useRef<VisualizerEngine | null>(null)

  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

    const getAudio = (): AudioFeatures => {
      if (prefersReduced) return {energy: 0.12}
      return audioSurface.get()
    }

    const engine = new VisualizerEngine({
      canvas,
      getAudio,
      theme: createNebulaTheme(),
    })

    engineRef.current = engine
    engine.start()

    return () => {
      engine.dispose()
      engineRef.current = null
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        pointerEvents: 'none',
        zIndex: 0, // ✅ always behind overlays
      }}
    />
  )
}
