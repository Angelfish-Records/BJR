'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

export default function AudioEngine() {
  const p = usePlayer()
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  // Keep volume/mute in sync
  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = Math.max(0, Math.min(1, p.volume))
    a.muted = p.muted
  }, [p.volume, p.muted])

  // When current track changes, set src (placeholder for now) and optionally autoplay.
  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

   const nextSrc = p.current?.src
if (!nextSrc) return

    if (a.src !== nextSrc) {
      a.src = nextSrc
      a.load()
    }

    if (p.status === 'playing') {
      void a.play().catch((err) => {
        p.setBlocked(err instanceof Error ? err.message : 'Playback blocked.')
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.current?.id])

  // Drive play/pause from state
  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    if (p.status === 'playing') {
      void a.play().catch((err) => {
        p.setBlocked(err instanceof Error ? err.message : 'Playback blocked.')
      })
    } else if (p.status === 'paused' || p.status === 'idle') {
      a.pause()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status])

  // Report time + duration back to state
  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const onTime = () => p.setPositionMs(Math.floor(a.currentTime * 1000))
    const onDur = () => {
      const ms = Number.isFinite(a.duration) ? Math.floor(a.duration * 1000) : 0
      if (ms > 0) p.setDurationMs(ms)
    }
    const onEnded = () => p.next()
    const onPlay = () => p.setStatusExternal('playing')
    const onPause = () => p.setStatusExternal(p.status === 'idle' ? 'idle' : 'paused')

    a.addEventListener('timeupdate', onTime)
    a.addEventListener('durationchange', onDur)
    a.addEventListener('ended', onEnded)
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('durationchange', onDur)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
    }
  }, [p])

  // Seeking from UI -> audio element
  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const desired = p.positionMs / 1000
    // Avoid fighting timeupdate: only set if meaningful delta.
    if (Number.isFinite(desired) && Math.abs(a.currentTime - desired) > 0.25) {
      a.currentTime = desired
    }
  }, [p.positionMs])

  return (
    <audio
      ref={audioRef}
      preload="metadata"
      playsInline
      style={{display: 'none'}}
    />
  )
}
