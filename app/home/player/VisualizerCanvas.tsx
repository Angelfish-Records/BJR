// web/app/home/player/VisualizerCanvas.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import {VisualizerEngine} from './visualizer/VisualizerEngine'
import {createNebulaTheme} from './visualizer/themes/nebula'
import {createGravitationalLatticeTheme} from './visualizer/themes/gravitationalLattice'
import {createOrbitalScriptTheme} from './visualizer/themes/orbitalScript'
import {createPhaseGlassTheme} from './visualizer/themes/phaseGlass'
import {createMHDSilkTheme} from './visualizer/themes/mhdSilk'
import {createPressureGlassTheme} from './visualizer/themes/pressureGlass'
import {createReactionVeinsTheme} from './visualizer/themes/reactionVeins'
import {createDreamFogTheme} from './visualizer/themes/dreamFog'
import {createFilamentStormTheme} from './visualizer/themes/filamentStorm'
import {createMosaicDriftTheme} from './visualizer/themes/mosaicDrift'
import {createOilFlowTheme} from './visualizer/themes/oilFlow'
import {createStarfallCanopyTheme} from './visualizer/themes/starfallCanopy'
import {audioSurface} from './audioSurface'
import {mediaSurface, type StageVariant} from './mediaSurface'
import type {Theme} from './visualizer/types'
import {visualSurface} from './visualSurface'

function themeFromKey(key: string | undefined | null): Theme {
  switch ((key ?? '').toLowerCase()) {
    case 'gravitational-lattice':
    case 'lattice':
      return createGravitationalLatticeTheme()
    case 'dream-fog':
    case 'fog':
      return createDreamFogTheme()
    case 'filament-storm':
    case 'filament':
      return createFilamentStormTheme()
    case 'mosaic-drift':
    case 'mosaic':
      return createMosaicDriftTheme()
    case 'oil-flow':
    case 'oil':
      return createOilFlowTheme()
    case 'starfall-canopy':
    case 'starfall':
      return createStarfallCanopyTheme()
    case 'orbital-script':
    case 'orbital':
      return createOrbitalScriptTheme()
    case 'phase-glass':
    case 'glass':
      return createPhaseGlassTheme()
    case 'mhd-silk':
    case 'mhd':
      return createMHDSilkTheme()
    case 'pressure-glass':
    case 'pressure':
      return createPressureGlassTheme()
    case 'reaction-veins':
    case 'veins':
      return createReactionVeinsTheme()
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

  const [activeStage, setActiveStage] = React.useState<StageVariant | null>(() =>
    mediaSurface.getStageVariant()
  )

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

  const getAudio = () => {
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

  // register canvas for UI sampling (fullscreen wins)
  const unreg = visualSurface.registerCanvas(variant, canvas)

  if (activeStage === variant) engine.start()

  return () => {
    try {
      engine.stop()
      engine.dispose()
    } finally {
      engineRef.current = null
      unreg()
    }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])


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
