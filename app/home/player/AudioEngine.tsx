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
  return a.canPlayType('application/vnd.apple.mpegurl') !== ''
}

export default function AudioEngine() {
  const p = usePlayer()
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const hlsRef = React.useRef<Hls | null>(null)
  const tokenAbortRef = React.useRef<AbortController | null>(null)
  const loadSeq = React.useRef(0)

  // When user clicks play, we latch intent so we can retry once media is attached.
  const playIntentRef = React.useRef(false)

  // Cache signed tokens by playbackId to reduce perceived latency when switching around.
  const tokenCacheRef = React.useRef(new Map<string, {token: string; expiresAtMs: number}>())

  // Keep a stable ref to player API for event handlers.
  const pRef = React.useRef(p)
  React.useEffect(() => {
    pRef.current = p
  }, [p])

  /* ---------------- Volume / mute sync ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = Math.max(0, Math.min(1, p.volume))
    a.muted = p.muted
  }, [p.volume, p.muted])

  /* ---------------- Track change -> token + attach media ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const playbackId = p.current?.muxPlaybackId
    if (!playbackId) return

    // Mark as loading whenever we switch tracks.
    p.setStatusExternal('loading')

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

    const attachSrc = (src: string) => {
      // Reset element state
      a.pause()
      a.removeAttribute('src')
      a.load()

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

      // Retry play after attach if user has expressed intent.
      const tryPlay = () => {
  if (!playIntentRef.current) return
  void a.play()
    .then(() => {
      playIntentRef.current = false
    })
    .catch(() => {
      // ignore; keep intent latched for next event
    })
}

      tryPlay()
a.addEventListener('loadedmetadata', tryPlay, {once: true})
a.addEventListener('canplay', tryPlay, {once: true})
    }

    const load = async () => {
      try {
        // 1) Use cached token if still valid
        const cached = tokenCacheRef.current.get(playbackId)
        if (cached && Date.now() < cached.expiresAtMs - 5000) {
          const src = muxSignedHlsUrl(playbackId, cached.token)
          if (ac.signal.aborted) return
          if (seq !== loadSeq.current) return
          attachSrc(src)
          return
        }

        // 2) Otherwise fetch a fresh token
        const res = await fetch('/api/mux/playback-token', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({playbackId}),
          signal: ac.signal,
        })

        if (ac.signal.aborted) return
        if (seq !== loadSeq.current) return

        const data = (await res.json()) as TokenResponse

        if (ac.signal.aborted) return
        if (seq !== loadSeq.current) return

        if (!res.ok || !data.ok) {
          p.setBlocked(!data.ok ? data.reason : `Token route failed (${res.status}).`)
          return
        }

        const expiresAtMs = Date.parse(data.expiresAt)
        if (Number.isFinite(expiresAtMs)) {
          tokenCacheRef.current.set(playbackId, {token: data.token, expiresAtMs})
        }

        const src = muxSignedHlsUrl(playbackId, data.token)
        attachSrc(src)
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

    const onTime = () => pRef.current.setPositionMs(Math.floor(a.currentTime * 1000))
    const onDur = () => {
      const ms = Number.isFinite(a.duration) ? Math.floor(a.duration * 1000) : 0
      if (ms > 0) pRef.current.setDurationMs(ms)
    }
    const onEnded = () => {
      // Keep queue advancing. We also express intent so autoplay is allowed if next needs it.
      window.dispatchEvent(new Event('af:play-intent'))
      pRef.current.next()
    }

    const onPlaying = () => {
      pRef.current.setStatusExternal('playing')
    }

    const onPause = () => {
      // Don’t override blocked/loading transitions with “paused”
      const s = pRef.current.status
      pRef.current.setStatusExternal(s === 'blocked' ? 'blocked' : 'paused')
    }

    const onError = () => {
      pRef.current.setBlocked('Media error while loading/decoding.')
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
  }, [])

  /* ---------------- Seeking from UI ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const desired = p.positionMs / 1000
    if (!Number.isFinite(a.duration) || a.duration <= 0) return
    if (Number.isFinite(desired)) a.currentTime = desired
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.seekNonce])

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

  /* ---------------- User-gesture play/pause intent ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const onPlayIntent = () => {
  playIntentRef.current = true
  void a.play().catch(() => {
    // ignore; we’ll retry after attach/loadedmetadata/canplay
  })
}


    const onPauseIntent = () => {
      playIntentRef.current = false
      a.pause()
    }

    window.addEventListener('af:play-intent', onPlayIntent)
    window.addEventListener('af:pause-intent', onPauseIntent)

    return () => {
      window.removeEventListener('af:play-intent', onPlayIntent)
      window.removeEventListener('af:pause-intent', onPauseIntent)
    }
  }, [])

  return <audio ref={audioRef} preload="metadata" playsInline style={{display: 'none'}} />
}
