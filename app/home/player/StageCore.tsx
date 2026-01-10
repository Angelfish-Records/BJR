// web/app/home/player/StageCore.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import VisualizerCanvas from './VisualizerCanvas'
import LyricsOverlay, {type LyricCue} from './stage/LyricsOverlay'
import {mediaSurface} from './mediaSurface'

type CuesByTrackId = Record<string, LyricCue[]>
type OffsetByTrackId = Record<string, number>

export default function StageCore(props: {
  variant: 'inline' | 'fullscreen'
  cuesByTrackId?: CuesByTrackId
  offsetByTrackId?: OffsetByTrackId
  offsetMs?: number
  autoResumeOnSeek?: boolean
}) {
  const {variant, cuesByTrackId, offsetByTrackId, offsetMs: globalOffsetMs = 0, autoResumeOnSeek = false} = props
  const p = usePlayer()

  const [surfaceTrackId, setSurfaceTrackId] = React.useState<string | null>(() => mediaSurface.getTrackId())

  React.useEffect(() => {
    const unsub = mediaSurface.subscribe((e) => {
      if (e.type === 'track') setSurfaceTrackId(e.id)
    })
    return unsub
  }, [])

  const trackId = surfaceTrackId ?? p.current?.id ?? null

  const cues: LyricCue[] | null = React.useMemo(() => {
    if (!trackId) return null
    const xs = cuesByTrackId?.[trackId]
    return Array.isArray(xs) && xs.length ? xs : null
  }, [cuesByTrackId, trackId])

  const trackOffsetMs = React.useMemo(() => {
    if (!trackId) return 0
    const v = offsetByTrackId?.[trackId]
    return typeof v === 'number' && Number.isFinite(v) ? v : 0
  }, [offsetByTrackId, trackId])

  const effectiveOffsetMs = trackOffsetMs + globalOffsetMs

  const onSeek = React.useCallback(
    (tMs: number) => {
      const ms = Math.max(0, Math.floor(tMs))
      p.seek(ms)

      if (autoResumeOnSeek) {
        const t = p.current ?? p.queue[0]
        if (!t) return
        p.setIntent('play')
        p.play(t)
        window.dispatchEvent(new Event('af:play-intent'))
      }
    },
    [autoResumeOnSeek, p]
  )

  const lyricsVariant = variant === 'inline' ? 'inline' : 'stage'

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: variant === 'inline' ? 18 : 18,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.35)',
        isolation: 'isolate', // ✅ force a stacking context so zIndex is deterministic
      }}
    >
      {/* Layer 0: canvas */}
      <div style={{position: 'absolute', inset: 0, zIndex: 0}}>
        <VisualizerCanvas />
      </div>

      {/* Layer 1: tint/vignette BEHIND lyrics */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          background:
            'radial-gradient(70% 55% at 50% 40%, rgba(0,0,0,0.0), rgba(0,0,0,0.35) 70%), linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.40))',
          pointerEvents: 'none',
        }}
      />

      {/* Layer 2: lyrics always on top */}
      <div style={{position: 'absolute', inset: 0, zIndex: 2}}>
        <LyricsOverlay cues={cues} offsetMs={effectiveOffsetMs} onSeek={onSeek} variant={lyricsVariant} />
      </div>
    </div>
  )
}
