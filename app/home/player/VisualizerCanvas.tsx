'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import {VisualizerEngine} from './visualizer/VisualizerEngine'
import {createNebulaTheme} from './visualizer/themes/nebula'
import {createFractalWorldTheme} from './visualizer/themes/fractalWorld'
import {createReactionDiffusionTheme} from './visualizer/themes/reactionDiffusion'
import {createCalligraphyTheme} from './visualizer/themes/calligraphy'
import {audioSurface} from './audioSurface'
import {mediaSurface, type StageVariant} from './mediaSurface'
import type {AudioFeatures, Theme} from './visualizer/types'

function themeFromKey(key: string | undefined | null): Theme {
  // Expand later: 'prism', 'rings', etc.
  switch ((key ?? '').toLowerCase()) {
    case 'fractal-world':
    case 'fractal':
      return createFractalWorldTheme()
    case 'reaction-diffusion':
    case 'reaction':
      return createReactionDiffusionTheme()
    case 'calligraphy':
      return createCalligraphyTheme()
    case 'nebula':
    default:
      return createNebulaTheme()
  }
}

export default function VisualizerCanvas(props: {variant: StageVariant}) {
  const {variant} = props
  const p = usePlayer()

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const engineRef = React.useRef<VisualizerEngine | null>(null)

  const [activeStage, setActiveStage] = React.useState<StageVariant | null>(() => mediaSurface.getStageVariant())

  React.useEffect(() => {
    return mediaSurface.subscribe((e) => {
      if (e.type === 'stage') setActiveStage(e.variant)
    })
  }, [])

  // Engine mount once
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const prefersReduced =
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false

    const getAudio = (): AudioFeatures => {
  if (prefersReduced) {
    const a = audioSurface.get()
    return {...a, energy: 0.12}
  }
  return audioSurface.get()
}


    const engine = new VisualizerEngine({
      canvas,
      getAudio,
      theme: themeFromKey(p.current?.visualTheme),
    })

    engineRef.current = engine

    if (activeStage === variant) engine.start()

    return () => {
      engine.dispose()
      engineRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // mount only

  // Start/stop based on stage authority
  React.useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    if (activeStage === variant) engine.start()
    else engine.stop()
  }, [activeStage, variant])

  // Theme changes only when track theme key changes
  const themeKey = p.current?.visualTheme ?? null
  React.useEffect(() => {
    const engine = engineRef.current
    if (!engine) return
    engine.setTheme(themeFromKey(themeKey))
  }, [themeKey])

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
        zIndex: 0,
      }}
    />
  )
}
