// web/app/home/player/AudioEngine.tsx
'use client'

import React from 'react'
import Hls from 'hls.js'
import {usePlayer} from './PlayerState'
import {muxSignedHlsUrl} from '@/lib/mux'

type TokenResponse =
  | {ok: true; token: string; expiresAt: string}
  | {ok: false; blocked: true; action: string; reason: string}

function canPlayNativeHls(a: HTMLMediaElement) {
  // Safari/iOS will usually return "probably" or "maybe"
  return a.canPlayType('application/vnd.apple.mpegurl') !== ''
}

export default function AudioEngine() {
  const p = usePlayer()
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const hlsRef = React.useRef<Hls | null>(null)
  const tokenAbortRef = React.useRef<AbortController | null>(null)
  const loadSeq = React.useRef(0)

  /* ---------------- Volume / mute sync ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = Math.max(0, Math.min(1, p.volume))
    a.muted = p.muted
  }, [p.volume, p.muted])

  /* ---------------- Track change -> fetch token + attach media ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const playbackId = p.current?.muxPlaybackId
    if (!playbackId) return

    const seq = ++loadSeq.current 

    // Tear down any existing HLS instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch {}
      hlsRef.current = null
    }
    
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

    if (ac.signal.aborted) return
    if (seq !== loadSeq.current) return

    // Read body safely (even on non-200)
    const data = (await res.json()) as TokenResponse

    if (ac.signal.aborted) return
    if (seq !== loadSeq.current) return

    if (!res.ok || !data.ok) {
      p.setBlocked(!data.ok ? data.reason : `Token route failed (${res.status}).`)
      return
    }

    const src = muxSignedHlsUrl(playbackId, data.token)

    // Reset element state
    a.pause()
    a.removeAttribute('src')
    a.load()

    // 🔐 SECOND GUARD — right before attaching
    if (seq !== loadSeq.current) return

    if (canPlayNativeHls(a)) {
      a.src = src
      a.load()
    } else {
      if (!Hls.isSupported()) {
        p.setBlocked('This browser cannot play HLS (no MSE).')
        return
      }

      const hls = new Hls({enableWorker: true, lowLatencyMode: false})
      hlsRef.current = hls

      hls.on(Hls.Events.ERROR, (_evt, err) => {
        // Only hard-block on fatal errors; many are recoverable noise
        if (err?.fatal) {
          const msg = err?.details ? `HLS fatal: ${err.details}` : 'HLS fatal error.'
          p.setBlocked(msg)
          try {
            hls.destroy()
          } catch {}
          if (hlsRef.current === hls) hlsRef.current = null
        }
      })

      hls.loadSource(src)
      hls.attachMedia(a)
    }

    if (p.status === 'playing') {
      await a.play()
    }
  } catch (err) {
    if (ac.signal.aborted) return
    if (seq !== loadSeq.current) return
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

    const onPlaying = () => {
  p.setStatusExternal('playing')
}
   const onPause = () => p.setStatusExternal('paused')


    const onError = () => {
      // HTMLMediaElement errors are often opaque, but still better than silence
      p.setBlocked('Media error while loading/decoding.')
    }

    a.addEventListener('timeupdate', onTime)
    a.addEventListener('durationchange', onDur)
    a.addEventListener('ended', onEnded)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('pause', onPause)
    a.addEventListener('error', onError)

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('durationchange', onDur)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('error', onError)
    }
  }, [p])

  /* ---------------- Seeking from UI ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const desired = p.positionMs / 1000
    if (Number.isFinite(desired) && Math.abs(a.currentTime - desired) > 0.25) {
      a.currentTime = desired
    }
  }, [p.positionMs])

  /* ---------------- Cleanup ---------------- */

  React.useEffect(() => {
    return () => {
      tokenAbortRef.current?.abort()
      if (hlsRef.current) {
        try {
          hlsRef.current.destroy()
        } catch {}
        hlsRef.current = null
      }
    }
  }, [])

  return <audio ref={audioRef} preload="metadata" playsInline style={{display: 'none'}} />
}
