'use client'

import React from 'react'
import {usePlayer} from './PlayerState'

type TokenResponse =
  | {ok: true; token: string; expiresAt: string}
  | {ok: false; blocked: true; action: string; reason: string}

export default function AudioEngine() {
  const p = usePlayer()
  const audioRef = React.useRef<HTMLAudioElement | null>(null)
  const tokenAbortRef = React.useRef<AbortController | null>(null)

  /* ---------------- Volume / mute sync ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    a.volume = Math.max(0, Math.min(1, p.volume))
    a.muted = p.muted
  }, [p.volume, p.muted])

  /* ---------------- Track change -> fetch token + set src ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const playbackId = p.current?.muxPlaybackId
    if (!playbackId) return

    // Cancel any in-flight token request
    tokenAbortRef.current?.abort()
    const ac = new AbortController()
    tokenAbortRef.current = ac

    const load = async () => {
      try {
        const res = await fetch('/api/mux/playback-token', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({playbackId}),
          signal: ac.signal,
        })

        const data = (await res.json()) as TokenResponse
        if (ac.signal.aborted) return

        if (!data.ok) {
          p.setBlocked(data.reason)
          return
        }

        const nextSrc = `https://stream.mux.com/${playbackId}.m3u8?token=${data.token}`

        if (a.src !== nextSrc) {
          a.src = nextSrc
          a.load()
        }

        if (p.status === 'playing') {
          await a.play()
        }
      } catch (err) {
        if (ac.signal.aborted) return
        p.setBlocked(err instanceof Error ? err.message : 'Playback blocked.')
      }
    }

    void load()

    return () => {
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.current?.id])

  /* ---------------- Drive play / pause from state ---------------- */

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

  /* ---------------- Report time / duration back to state ---------------- */

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
    const onPause = () =>
      p.setStatusExternal(p.status === 'idle' ? 'idle' : 'paused')

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

  /* ---------------- Seeking from UI ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const desired = p.positionMs / 1000
    if (
      Number.isFinite(desired) &&
      Math.abs(a.currentTime - desired) > 0.25
    ) {
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
