// web/app/home/player/AudioEngine.tsx
'use client'

import React from 'react'
import Hls from 'hls.js'
import {usePlayer} from './PlayerState'
import {muxSignedHlsUrl} from '@/lib/mux'
import {mediaSurface} from './mediaSurface'
import {audioSurface} from './audioSurface'

type TokenResponse =
  | {ok: true; token: string; expiresAt: string | number}
  | {ok: false; blocked: true; action?: 'login' | 'subscribe' | 'buy' | 'wait'; reason: string; code?: string}

function canPlayNativeHls(a: HTMLMediaElement) {
  return a.canPlayType('application/vnd.apple.mpegurl') !== ''
}

export default function AudioEngine() {
  const p = usePlayer()
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const hlsRef = React.useRef<Hls | null>(null)
  const tokenAbortRef = React.useRef<AbortController | null>(null)
  const loadSeq = React.useRef(0)

  // ---- Audio analysis ----
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  type U8AB = Uint8Array<ArrayBuffer>
  const freqDataRef = React.useRef<U8AB | null>(null)
  const timeDataRef = React.useRef<U8AB | null>(null)

  // ---- Playback intent ----
  const playIntentRef = React.useRef(false)
  const playthroughSentRef = React.useRef(new Set<string>()) // key: `${trackId}:${playbackId}`

  // Track attachment bookkeeping
  const attachedKeyRef = React.useRef<string | null>(null)
  const tokenCacheRef = React.useRef(new Map<string, {token: string; expiresAtMs: number}>())
  const blockedNonceRef = React.useRef(new Map<string, number>()) // playbackId -> reloadNonce at time of block

  const pRef = React.useRef(p)
  React.useEffect(() => {
    pRef.current = p
  }, [p])

  /* ---------------- helpers ---------------- */

  const hardStopAndDetach = React.useCallback(() => {
    const a = audioRef.current
    if (!a) return

    try {
      a.pause()
    } catch {}

    // teardown HLS instance
    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch {}
      hlsRef.current = null
    }

    attachedKeyRef.current = null

    try {
      a.removeAttribute('src')
    } catch {}
    try {
      a.load()
    } catch {}
  }, [])

  /* ---------------- AudioContext + analyser (ONCE) ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    let ctx: AudioContext | null = null
    let src: MediaElementAudioSourceNode | null = null
    let analyser: AnalyserNode | null = null

    const ensureAudioGraph = async () => {
      if (audioCtxRef.current) return

      ctx = new AudioContext()
      audioCtxRef.current = ctx

      src = ctx.createMediaElementSource(a)
      analyser = ctx.createAnalyser()

      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8

      src.connect(analyser)
      analyser.connect(ctx.destination)

      analyserRef.current = analyser

      freqDataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)) as U8AB
      timeDataRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize)) as U8AB
    }

    const onUserGesture = async () => {
      await ensureAudioGraph()
      if (audioCtxRef.current?.state === 'suspended') {
        await audioCtxRef.current.resume()
      }
    }

    window.addEventListener('af:play-intent', onUserGesture)
    return () => {
      window.removeEventListener('af:play-intent', onUserGesture)
    }
  }, [])

  /* ---------------- Audio feature pump ---------------- */

  React.useEffect(() => {
    let raf: number | null = null

    const step = () => {
      const analyser = analyserRef.current
      const freq = freqDataRef.current
      const time = timeDataRef.current

      if (!analyser || !freq || !time) {
        raf = requestAnimationFrame(step)
        return
      }

      analyser.getByteFrequencyData(freqDataRef.current!)
      analyser.getByteTimeDomainData(timeDataRef.current!)

      let sum = 0
      for (let i = 0; i < time.length; i++) {
        const v = (time[i]! - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / time.length)

      const n = freq.length
      const bassEnd = Math.floor(n * 0.08)
      const midEnd = Math.floor(n * 0.35)

      let bass = 0
      let mid = 0
      let treble = 0
      for (let i = 0; i < n; i++) {
        const v = freq[i]! / 255
        if (i < bassEnd) bass += v
        else if (i < midEnd) mid += v
        else treble += v
      }

      bass /= bassEnd || 1
      mid /= midEnd - bassEnd || 1
      treble /= n - midEnd || 1

      let weighted = 0
      let total = 0
      for (let i = 0; i < n; i++) {
        const v = freq[i]! / 255
        weighted += i * v
        total += v
      }
      const centroid = total > 0 ? weighted / total / n : 0

      audioSurface.set({
        rms,
        bass,
        mid,
        treble,
        centroid,
        energy: Math.min(1, rms * 2),
      })

      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => {
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  /* ---------------- Volume / mute ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.volume = Math.max(0, Math.min(1, p.volume))
    a.muted = p.muted
  }, [p.volume, p.muted])

  /* ---------------- Track attach (HLS / native) ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    a.crossOrigin = 'anonymous'

    const s = pRef.current
    const playbackId = s.current?.muxPlaybackId
    if (!playbackId) return

    mediaSurface.setTrack(s.current?.id ?? null)

    const armed =
      s.status === 'loading' ||
      s.status === 'playing' ||
      playIntentRef.current ||
      s.intent === 'play' ||
      s.reloadNonce > 0

    if (!armed) return

    const blockedAt = blockedNonceRef.current.get(playbackId)
    if (blockedAt === s.reloadNonce) {
      playIntentRef.current = false

      // ✅ follow-up improvement: ensure nothing continues playing from a prior attachment
      hardStopAndDetach()
      mediaSurface.setStatus('blocked') // optional but consistent

      return
    }



    const attachKey = `${playbackId}:${s.reloadNonce}`
    if (attachedKeyRef.current === attachKey && (a.currentSrc || hlsRef.current)) {
      return
    }

    attachedKeyRef.current = null
    const seq = ++loadSeq.current

    mediaSurface.setStatus('loading')
    pRef.current.setStatusExternal('loading')
    pRef.current.setLoadingReasonExternal('attach')

    if (hlsRef.current) {
      try {
        hlsRef.current.destroy()
      } catch {}
      hlsRef.current = null
    }

    tokenAbortRef.current?.abort()
    const ac = new AbortController()
    tokenAbortRef.current = ac

    const hardResetElement = () => {
      try {
        a.pause()
      } catch {}
      try {
        a.removeAttribute('src')
      } catch {}
      try {
        a.load()
      } catch {}
    }

    const attachSrc = (srcUrl: string) => {
      if (seq !== loadSeq.current) return

      hardResetElement()
      if (seq !== loadSeq.current) return

      if (canPlayNativeHls(a)) {
        a.src = srcUrl
        a.load()
      } else {
        if (!Hls.isSupported()) {
          pRef.current.setBlocked('This browser cannot play HLS.')
          mediaSurface.setStatus('blocked')
          hardStopAndDetach()
          return
        }

        const hls = new Hls({enableWorker: true})
        hlsRef.current = hls

        hls.on(Hls.Events.ERROR, (_e, err) => {
          if (err?.fatal) {
            pRef.current.setBlocked(`HLS fatal: ${err.details ?? 'error'}`)
            mediaSurface.setStatus('blocked')
            hardStopAndDetach()
          }
        })

        hls.loadSource(srcUrl)
        hls.attachMedia(a)
      }

      attachedKeyRef.current = attachKey

      if (playIntentRef.current) {
        void a.play().finally(() => {
          playIntentRef.current = false
        })
      }
    }

    const load = async () => {
      try {
        const cached = tokenCacheRef.current.get(playbackId)
        if (cached && Date.now() < cached.expiresAtMs - 5000) {
          attachSrc(muxSignedHlsUrl(playbackId, cached.token))
          return
        }

        const res = await fetch('/api/mux/token', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            playbackId,
            trackId: s.current?.id,
            albumId: s.queueContextId,          // ✅ NEW (canonical album id)
            albumSlug: s.queueContextSlug,      // existing (human fallback)
            durationMs: s.current?.durationMs ?? s.durationById?.[s.current?.id ?? ''],
          }),
          signal: ac.signal,
        })

        let data: TokenResponse | null = null
        try {
          data = (await res.json()) as TokenResponse
        } catch {
          data = null
        }

        // ----- BLOCKED PATH -----
        if (!res.ok || !data || !('ok' in data) || data.ok !== true) {
          const code = data && 'ok' in data && data.ok === false ? data.code : undefined
          const action = data && 'ok' in data && data.ok === false ? data.action : undefined
          const reason =
            data && 'ok' in data && data.ok === false ? data.reason : `Token error (${res.status})`
          
            // stop the *old* track from continuing
          hardStopAndDetach()

          // your requested semantics: when anon gating hits, empty the queue
          if (code === 'ANON_CAP_REACHED') {
            pRef.current.clearQueue()
          }

          // ✅ Latch using the request we just made (stable), not whatever state is now.
          blockedNonceRef.current.set(playbackId, s.reloadNonce)


          // ✅ Stop any autoplay-bridge retries.
          playIntentRef.current = false

          pRef.current.setBlocked(reason, {code, action: action})
          mediaSurface.setStatus('blocked')
          return
        }

        const expiresAtMs =
          typeof data.expiresAt === 'number' ? data.expiresAt * 1000 : Date.parse(String(data.expiresAt))

        if (Number.isFinite(expiresAtMs)) {
          tokenCacheRef.current.set(playbackId, {token: data.token, expiresAtMs})
        }

        blockedNonceRef.current.delete(playbackId)

        attachSrc(muxSignedHlsUrl(playbackId, data.token))
      } catch {
        // ignore (abort / transient)
      }
    }

    void load()
    return () => ac.abort()
      }, [
      p.current?.id,
      p.current?.muxPlaybackId,
      p.reloadNonce,
      p.intent,      // ✅ triggers attach when user hits play on already-selected preloaded track
      p.status,      // ✅ covers cases where status flips to loading without id changing
      hardStopAndDetach,
    ])


  /* ---------------- Media element -> time + duration + state ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

  const reportPlaythroughComplete = (pct: number) => {
  const trackId = pRef.current.current?.id ?? ''
  const playbackId = pRef.current.current?.muxPlaybackId ?? ''
  if (!trackId || !playbackId) return

  const key = `${trackId}:${playbackId}`
  if (playthroughSentRef.current.has(key)) return
  if (pct < 0.9) return

  playthroughSentRef.current.add(key)

  // fire-and-forget; keepalive helps during navigations/unloads
  fetch('/api/playthrough/complete', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({trackId, playbackId, pct}),
    keepalive: true,
  }).catch(() => {})
}


    const onTime = () => {
      const ms = Math.floor(a.currentTime * 1000)
      mediaSurface.setTime(ms)
      pRef.current.setPositionMs(ms)

      // try to compute duration from best available source
      const curId = pRef.current.current?.id ?? ''
      const durFromState =
        (curId ? pRef.current.durationById[curId] : 0) || pRef.current.current?.durationMs || 0

      const durFromEl = Number.isFinite(a.duration) && a.duration > 0 ? Math.floor(a.duration * 1000) : 0
      const durMs = durFromState || durFromEl

      if (durMs > 0) {
        const pct = ms / durMs
        reportPlaythroughComplete(pct)
      }
    }


    const onLoadedMeta = () => {
      const d = a.duration
      if (Number.isFinite(d) && d > 0) {
        pRef.current.setDurationMs(Math.floor(d * 1000))
      }
    }

    const applyPendingSeek = () => {
      const ms = pRef.current.pendingSeekMs
      if (ms == null) return
      try {
        a.currentTime = Math.max(0, ms / 1000)
      } catch {}
      pRef.current.clearPendingSeek()
    }

    const markPlaying = () => {
      mediaSurface.setStatus('playing')
      pRef.current.setStatusExternal('playing')
      pRef.current.setLoadingReasonExternal(undefined)
      pRef.current.clearIntent()
      applyPendingSeek()
      const curId = pRef.current.current?.id
      if (curId) pRef.current.resolvePendingTrack(curId)
    }

    const markPaused = () => {
      mediaSurface.setStatus('paused')
      pRef.current.setStatusExternal('paused')
      pRef.current.setLoadingReasonExternal(undefined)
      pRef.current.clearIntent()
    }

    const markBuffering = () => {
      const s = pRef.current
      const shouldBePlaying = s.intent === 'play' || s.status === 'playing' || s.status === 'loading'
      if (!shouldBePlaying) return
      mediaSurface.setStatus('loading')
      s.setStatusExternal('loading')
      s.setLoadingReasonExternal('buffering')
    }

    const clearBuffering = () => {
      pRef.current.setLoadingReasonExternal(undefined)
      applyPendingSeek()
    }

    const onEnded = () => {
      reportPlaythroughComplete(1)

      // ✅ Kill any residual buffered tail before we advance.
      hardStopAndDetach()

      // Ensure next track has a user gesture bridge available if needed.
      window.dispatchEvent(new Event('af:play-intent'))
      pRef.current.next()
    }



    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onLoadedMeta)
    a.addEventListener('playing', markPlaying)
    a.addEventListener('pause', markPaused)
    a.addEventListener('waiting', markBuffering)
    a.addEventListener('stalled', markBuffering)
    a.addEventListener('canplay', clearBuffering)
    a.addEventListener('canplaythrough', clearBuffering)
    a.addEventListener('ended', onEnded)

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onLoadedMeta)
      a.removeEventListener('playing', markPlaying)
      a.removeEventListener('pause', markPaused)
      a.removeEventListener('waiting', markBuffering)
      a.removeEventListener('stalled', markBuffering)
      a.removeEventListener('canplay', clearBuffering)
      a.removeEventListener('canplaythrough', clearBuffering)
      a.removeEventListener('ended', onEnded)
    }
  }, [hardStopAndDetach])

  /* ---------------- Seek: PlayerState -> media element ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const ms = p.pendingSeekMs
    if (ms == null) return

    try {
      a.currentTime = Math.max(0, ms / 1000)
    } catch {
      return
    }

    pRef.current.clearPendingSeek()
  }, [p.seekNonce, p.pendingSeekMs])

  /* ---------------- Intent -> media element ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    if (p.intent === 'pause') {
      a.pause()
      pRef.current.clearIntent()
      return
    }

    if (p.intent === 'play') {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }

      void a.play().then(
        () => pRef.current.clearIntent(),
        () => {
          playIntentRef.current = true
        }
      )
    }
  }, [p.intent])

  /* ---------------- User gesture bridge ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const resume = () => {
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume().catch(() => {})
      }
      playIntentRef.current = true
      void a.play().catch(() => {})
    }

    window.addEventListener('af:play-intent', resume)
    return () => window.removeEventListener('af:play-intent', resume)
  }, [])

  return <audio ref={audioRef} crossOrigin="anonymous" preload="metadata" playsInline style={{display: 'none'}} />
}
