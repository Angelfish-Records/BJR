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

  // Latched only by real user gesture (window event), so we can retry play after attach.
  const playIntentRef = React.useRef(false)

  // ✅ Track what playbackId is currently attached, so resume doesn't tear down + reset currentTime.
  const attachedPlaybackIdRef = React.useRef<string | null>(null)

  // Cache signed tokens by playbackId to reduce perceived latency.
  const tokenCacheRef = React.useRef(new Map<string, {token: string; expiresAtMs: number}>())

  // Stable ref to player API for event handlers.
  const pRef = React.useRef(p)
  React.useEffect(() => {
    pRef.current = p
  }, [p])

  /* ---------------- Helpers ---------------- */

  const prefetchToken = React.useCallback(async (playbackId: string) => {
    // if cached + valid, do nothing
    const cached = tokenCacheRef.current.get(playbackId)
    if (cached && Date.now() < cached.expiresAtMs - 5000) return

    try {
      const res = await fetch('/api/mux/playback-token', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({playbackId}),
      })
      const data = (await res.json()) as TokenResponse
      if (!res.ok || !data.ok) return
      const expiresAtMs = Date.parse(data.expiresAt)
      if (Number.isFinite(expiresAtMs)) {
        tokenCacheRef.current.set(playbackId, {token: data.token, expiresAtMs})
      }
    } catch {
      // silently ignore; it's just a warmup
    }
  }, [])

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

    // Only load/attach when playback is armed by user intent or state says we should be playing/loading.
    const armed =
      p.status === 'loading' ||
      p.status === 'playing' ||
      playIntentRef.current ||
      p.intent === 'play' ||
      p.reloadNonce > 0

    if (!armed) return

    // ✅ If this exact playbackId is already attached, do NOT tear down + reattach (would reset to 0).
    const alreadyAttached =
      attachedPlaybackIdRef.current === playbackId &&
      (Boolean(a.currentSrc) || Boolean(a.getAttribute('src')) || Boolean(hlsRef.current))

    if (alreadyAttached) return

    const seq = ++loadSeq.current

    // Tear down any existing HLS instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch {}
      hlsRef.current = null
      // ✅ Avoid stale "attached" state across teardown.
      attachedPlaybackIdRef.current = null
    }

    // Cancel any in-flight token request
    tokenAbortRef.current?.abort()
    const ac = new AbortController()
    tokenAbortRef.current = ac

    const attachSrc = (src: string) => {
      pRef.current.setLoadingReasonExternal('attach')

      // Reset element state
      a.pause()
      a.removeAttribute('src')
      a.load()

      if (seq !== loadSeq.current) return

      if (canPlayNativeHls(a)) {
        a.src = src
        a.load()
        // ✅ Mark attached only AFTER we actually attach.
        attachedPlaybackIdRef.current = playbackId
      } else {
        if (!Hls.isSupported()) {
          pRef.current.setBlocked('This browser cannot play HLS (no MSE).')
          return
        }

        const hls = new Hls({enableWorker: true, lowLatencyMode: false})
        hlsRef.current = hls

        hls.on(Hls.Events.ERROR, (_evt, err) => {
          if (err?.fatal) {
            const msg = err?.details ? `HLS fatal: ${err.details}` : 'HLS fatal error.'
            pRef.current.setBlocked(msg)
            try {
              hls.destroy()
            } catch {}
            if (hlsRef.current === hls) hlsRef.current = null
          }
        })

        hls.loadSource(src)
        hls.attachMedia(a)
        // ✅ Mark attached only AFTER we actually attach.
        attachedPlaybackIdRef.current = playbackId
      }

      const tryPlay = () => {
        if (!playIntentRef.current) return
        void a
          .play()
          .then(() => {
            // once the element has accepted play, we can drop the latched gesture
            playIntentRef.current = false
          })
          .catch(() => {
            // ignore; we’ll retry on metadata/canplay
          })
      }

      tryPlay()
      a.addEventListener('loadedmetadata', tryPlay, {once: true})
      a.addEventListener('canplay', tryPlay, {once: true})
    }

    const load = async () => {
      try {
        pRef.current.setLoadingReasonExternal('token')

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
          pRef.current.setBlocked(!data.ok ? data.reason : `Token route failed (${res.status}).`)
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
        pRef.current.setBlocked(err instanceof Error ? err.message : 'Playback blocked.')
      }
    }

    void load()

    return () => {
      ac.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.current?.id, p.current?.muxPlaybackId, p.status, p.intent, p.reloadNonce])

  /* ---------------- Drive play / pause from state ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    if (p.status === 'playing') {
      void a.play().catch((err) => {
        // If we get here without a gesture, we don't want to permanently brick the UI;
        // treat it as blocked, and the Retry button will re-arm via a gesture.
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

    const onTime = () => {
      const ms = Math.floor(a.currentTime * 1000)

      // Don’t fight the scrub: while seeking, ignore timeupdates until we converge.
      const s = pRef.current
      if (s.seeking && s.pendingSeekMs != null) {
        if (Math.abs(ms - s.pendingSeekMs) <= 250) {
          s.clearPendingSeek()
          s.setPositionMs(ms)
        }
        return
      }

      s.setPositionMs(ms)
    }

    const onDur = () => {
      const ms = Number.isFinite(a.duration) ? Math.floor(a.duration * 1000) : 0
      if (ms > 0) pRef.current.setDurationMs(ms)
    }

    const onEnded = () => {
      // express intent so autoplay is allowed if next needs it
      window.dispatchEvent(new Event('af:play-intent'))
      pRef.current.next()
    }

    const onPlaying = () => {
      const s = pRef.current
      s.setStatusExternal('playing')
      s.setLoadingReasonExternal(undefined)
      s.clearError()
      s.clearIntent()
      if (s.current?.id) s.resolvePendingTrack(s.current.id)
    }

    const onPause = () => {
      const s = pRef.current
      // Don’t override blocked/loading transitions with “paused”
      s.setStatusExternal(s.status === 'blocked' ? 'blocked' : 'paused')
      s.setLoadingReasonExternal(undefined)
      s.clearIntent()
    }

    const onWaiting = () => {
      // buffer underrun
      const s = pRef.current
      if (s.status === 'playing' || s.status === 'loading') {
        s.setStatusExternal('loading')
        s.setLoadingReasonExternal('buffering')
      }
    }

    const onCanPlay = () => {
      const s = pRef.current
      // if we were buffering, clear microcopy; playing will come next
      if (s.loadingReason === 'buffering') s.setLoadingReasonExternal(undefined)
    }

    const onSeeked = () => {
      pRef.current.clearPendingSeek()
    }

    const onLoadedMeta = () => {
      const s = pRef.current
      if (s.current?.id) s.resolvePendingTrack(s.current.id)
    }

    const onError = () => {
      pRef.current.setBlocked('Media error while loading/decoding.')
    }

    a.addEventListener('timeupdate', onTime)
    a.addEventListener('durationchange', onDur)
    a.addEventListener('ended', onEnded)
    a.addEventListener('playing', onPlaying)
    a.addEventListener('pause', onPause)
    a.addEventListener('waiting', onWaiting)
    a.addEventListener('canplay', onCanPlay)
    a.addEventListener('seeked', onSeeked)
    a.addEventListener('loadedmetadata', onLoadedMeta)
    a.addEventListener('error', onError)

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('durationchange', onDur)
      a.removeEventListener('ended', onEnded)
      a.removeEventListener('playing', onPlaying)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('waiting', onWaiting)
      a.removeEventListener('canplay', onCanPlay)
      a.removeEventListener('seeked', onSeeked)
      a.removeEventListener('loadedmetadata', onLoadedMeta)
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

  /* ---------------- User-gesture intent bridge ---------------- */

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

    const onPrefetch = (e: Event) => {
      const ce = e as CustomEvent<{playbackId?: string}>
      const playbackId = ce?.detail?.playbackId
      if (playbackId) void prefetchToken(playbackId)
    }

    window.addEventListener('af:play-intent', onPlayIntent)
    window.addEventListener('af:pause-intent', onPauseIntent)
    window.addEventListener('af:prefetch-token', onPrefetch as EventListener)

    return () => {
      window.removeEventListener('af:play-intent', onPlayIntent)
      window.removeEventListener('af:pause-intent', onPauseIntent)
      window.removeEventListener('af:prefetch-token', onPrefetch as EventListener)
    }
  }, [prefetchToken])

  return <audio ref={audioRef} preload="metadata" playsInline style={{display: 'none'}} />
}
