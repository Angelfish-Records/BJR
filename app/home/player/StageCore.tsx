// web/app/home/player/StageCore.tsx
'use client'

import React from 'react'
import {usePlayer} from './PlayerState'
import VisualizerCanvas from './VisualizerCanvas'
import LyricsOverlay, {type LyricCue} from './stage/LyricsOverlay'
import {mediaSurface} from './mediaSurface'

type CuesByTrackId = Record<string, LyricCue[]>
type OffsetByTrackId = Record<string, number>

function pickKeyWithCues(
  cuesByTrackId: CuesByTrackId | undefined,
  keys: Array<string | null | undefined>
) {
  if (!cuesByTrackId) return (keys.find(Boolean) as string | null) ?? null
  for (const k of keys) {
    if (!k) continue
    const xs = cuesByTrackId[k]
    if (Array.isArray(xs) && xs.length) return k
  }
  return (keys.find(Boolean) as string | null) ?? null
}

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

  // Prefer player id, but fall back to surface id, and finally muxPlaybackId.
  // Critically: choose the first key that actually exists in cuesByTrackId (if provided).
    const playerTrackId = p.current?.id ?? null
    const playerMuxId = p.current?.muxPlaybackId ?? null

    const trackId = React.useMemo(() => {
      return pickKeyWithCues(cuesByTrackId, [playerTrackId, surfaceTrackId, playerMuxId])
    }, [cuesByTrackId, playerTrackId, playerMuxId, surfaceTrackId])

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
        borderRadius: 18,
        overflow: 'hidden',
        background: 'rgba(0,0,0,0.35)',
        isolation: 'isolate',
      }}
    >
      <div style={{position: 'absolute', inset: 0, zIndex: 0}}>
        <VisualizerCanvas />
      </div>

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

      <div style={{position: 'absolute', inset: 0, zIndex: 2}}>
        <LyricsOverlay cues={cues} offsetMs={effectiveOffsetMs} onSeek={onSeek} variant={lyricsVariant} />
      </div>
    </div>
  )
}
