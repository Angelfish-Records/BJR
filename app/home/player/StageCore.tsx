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
  /** Optional global offset applied in addition to per-track offset */
  offsetMs?: number
  /** If true, clicking a lyric also resumes playback */
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

      // seek should not *force* play unless you asked for it
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

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: variant === 'inline' ? 0 : 18,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.35)',
      }}
    >
      <VisualizerCanvas />
      <LyricsOverlay cues={cues} offsetMs={effectiveOffsetMs} onSeek={onSeek} variant="inline" />

      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(70% 55% at 50% 40%, rgba(0,0,0,0.0), rgba(0,0,0,0.35) 70%), linear-gradient(180deg, rgba(0,0,0,0.30), rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.40))',
          pointerEvents: 'none',
        }}
      />
    </div>
  )
}
