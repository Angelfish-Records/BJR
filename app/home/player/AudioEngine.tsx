// web/app/home/player/AudioEngine.tsx
'use client'

import React from 'react'
import Hls from 'hls.js'
import {usePlayer} from './PlayerState'
import {muxSignedHlsUrl} from '@/lib/mux'
import {mediaSurface} from './mediaSurface'
import {audioSurface} from './audioSurface'

type BlockCode =
  | 'AUTH_REQUIRED'
  | 'ANON_CAP_REACHED'
  | 'ENTITLEMENT_REQUIRED'
  | 'EMBARGO'
  | 'TIER_REQUIRED'
  | 'INVALID_REQUEST'
  | 'PROVISIONING'
  | 'CAP_REACHED'

type BlockAction = 'login' | 'subscribe' | 'buy' | 'wait'

type TokenResponse =
  | {ok: true; token: string; expiresAt: string | number}
  | {ok: false; blocked: true; action?: BlockAction; reason: string; code?: BlockCode}

function canPlayNativeHls(a: HTMLMediaElement) {
  return a.canPlayType('application/vnd.apple.mpegurl') !== ''
}

export default function AudioEngine() {
  const p = usePlayer()
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const hlsRef = React.useRef<Hls | null>(null)
  const tokenAbortRef = React.useRef<AbortController | null>(null)
  const loadSeq = React.useRef(0)

  const srcNodeRef = React.useRef<MediaElementAudioSourceNode | null>(null)

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

    // stop any in-flight token request
    try {
      tokenAbortRef.current?.abort()
    } catch {}
    tokenAbortRef.current = null

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

  // ---- Final unmount cleanup (tab-lifetime leaks: AudioContext + WebAudio graph + HLS) ----
React.useEffect(() => {
  // Snapshot ref values NOW so cleanup doesn’t read mutable .current later.
  const a = audioRef.current
  const hls = hlsRef.current
  const analyser = analyserRef.current
  const srcNode = srcNodeRef.current
  const ctx = audioCtxRef.current

  const tokenCache = tokenCacheRef.current
  const blockedNonce = blockedNonceRef.current
  const playthroughSent = playthroughSentRef.current

  const tokenAbort = tokenAbortRef.current

  return () => {
    // stop any in-flight token request
    try {
      tokenAbort?.abort()
    } catch {}
    tokenAbortRef.current = null

    // teardown HLS instance
    if (hls) {
      try {
        hls.destroy()
      } catch {}
    }
    hlsRef.current = null

    // hard-stop media element
    if (a) {
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

    // disconnect WebAudio graph
    try {
      analyser?.disconnect()
    } catch {}
    analyserRef.current = null

    try {
      srcNode?.disconnect()
    } catch {}
    srcNodeRef.current = null

    // release typed arrays
    freqDataRef.current = null
    timeDataRef.current = null

    // close AudioContext
    audioCtxRef.current = null
    if (ctx) {
      ctx.close().catch(() => {})
    }

    // clear caches (use snapshots)
    tokenCache.clear()
    blockedNonce.clear()
    playthroughSent.clear()

    // neutralize surfaces (optional)
    try {
      audioSurface.set({rms: 0, bass: 0, mid: 0, treble: 0, centroid: 0, energy: 0})
    } catch {}
    try {
      mediaSurface.setStatus('idle')
    } catch {}
  }
}, [])


  /* ---------------- NEW: global "blocked means SILENCE" invariant ---------------- */
  React.useEffect(() => {
    // If UI is blocked for ANY reason (token gate, access-check, etc),
    // guarantee the media element is not still running behind the blur.
    if (p.status !== 'blocked') return

    playIntentRef.current = false
    hardStopAndDetach()
    mediaSurface.setStatus('blocked')
  }, [p.status, hardStopAndDetach])

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
      srcNodeRef.current = src
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
  let to: number | null = null

  const tick = () => {
    const analyser = analyserRef.current
    const freq = freqDataRef.current
    const time = timeDataRef.current

    const st = pRef.current.status
    const active = st === 'playing' || st === 'loading'

    // If we have no analyser yet, poll slowly until user gesture creates it.
    if (!analyser || !freq || !time) {
      to = window.setTimeout(tick, 250)
      return
    }

    // If not active, don’t burn RAF. Keep visuals softly alive at low rate.
    if (!active) {
      analyser.getByteTimeDomainData(time)
      let sum = 0
      for (let i = 0; i < time.length; i++) {
        const v = (time[i]! - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / time.length)
      audioSurface.set({
        rms,
        bass: 0,
        mid: 0,
        treble: 0,
        centroid: 0,
        energy: Math.min(1, rms * 1.2),
      })
      to = window.setTimeout(tick, 180) // ~5.5 fps
      return
    }

    // Active: full-rate RAF
    analyser.getByteFrequencyData(freq)
    analyser.getByteTimeDomainData(time)

    let sum = 0
    for (let i = 0; i < time.length; i++) {
      const v = (time[i]! - 128) / 128
      sum += v * v
    }
    const rms = Math.sqrt(sum / time.length)

    const n = freq.length
    const bassEnd = Math.floor(n * 0.08)
    const midEnd = Math.floor(n * 0.35)

    let bass = 0, mid = 0, treble = 0
    for (let i = 0; i < n; i++) {
      const v = freq[i]! / 255
      if (i < bassEnd) bass += v
      else if (i < midEnd) mid += v
      else treble += v
    }

    bass /= bassEnd || 1
    mid /= (midEnd - bassEnd) || 1
    treble /= (n - midEnd) || 1

    let weighted = 0, total = 0
    for (let i = 0; i < n; i++) {
      const v = freq[i]! / 255
      weighted += i * v
      total += v
    }
    const centroid = total > 0 ? weighted / total / n : 0

    audioSurface.set({
      rms, bass, mid, treble, centroid,
      energy: Math.min(1, rms * 2),
    })

    raf = window.requestAnimationFrame(tick)
  }

  raf = window.requestAnimationFrame(tick)
  return () => {
    if (raf) window.cancelAnimationFrame(raf)
    if (to) window.clearTimeout(to)
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

    // If we're blocked, never attach.
    if (s.status === 'blocked') return

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
      hardStopAndDetach()
      mediaSurface.setStatus('blocked')
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

        // Pull st/share from current URL if present (client-side only)
        let st: string | null = null
        try {
          const sp = new URLSearchParams(window.location.search)
          st = (sp.get('st') ?? sp.get('share') ?? '').trim() || null
        } catch {
          st = null
        }

        const res = await fetch('/api/mux/token', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            playbackId,
            trackId: s.current?.id,
            albumId: s.queueContextId,
            albumSlug: s.queueContextSlug,
            durationMs: s.current?.durationMs ?? s.durationById?.[s.current?.id ?? ''],
            ...(st ? {st} : {}),
          }),
          signal: ac.signal,
        })

        const corr = res.headers.get('x-correlation-id') ?? null

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

          // Always stop the media element.
          hardStopAndDetach()

          // IMPORTANT: do NOT clear queue here.
          // We want the *blocked* (next) track to remain selected so auth can resume cleanly.

          blockedNonceRef.current.set(playbackId, s.reloadNonce)
          playIntentRef.current = false

          pRef.current.setBlocked(reason, {code, action, correlationId: corr})
          mediaSurface.setStatus('blocked')
          return
        }

        const expiresAtMs =
          typeof data.expiresAt === 'number' ? data.expiresAt * 1000 : Date.parse(String(data.expiresAt))

        if (Number.isFinite(expiresAtMs)) {
          tokenCacheRef.current.set(playbackId, {token: data.token, expiresAtMs})
        }

        blockedNonceRef.current.delete(playbackId)

        // NEW: token success implies we’re no longer blocked
        pRef.current.clearBlocked()

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
    p.intent,
    p.status,
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
      // If we’re blocked, don’t let media events resurrect UI state.
      if (pRef.current.status === 'blocked') {
        hardStopAndDetach()
        mediaSurface.setStatus('blocked')
        return
      }

      mediaSurface.setStatus('playing')
      pRef.current.setStatusExternal('playing')
      pRef.current.setLoadingReasonExternal(undefined)
      pRef.current.clearIntent()
      applyPendingSeek()
      const curId = pRef.current.current?.id
      if (curId) pRef.current.resolvePendingTrack(curId)
    }

    const markPaused = () => {
      if (pRef.current.status === 'blocked') return
      mediaSurface.setStatus('paused')
      pRef.current.setStatusExternal('paused')
      pRef.current.setLoadingReasonExternal(undefined)
      pRef.current.clearIntent()
    }

    const markBuffering = () => {
      const s = pRef.current
      if (s.status === 'blocked') return
      const shouldBePlaying = s.intent === 'play' || s.status === 'playing' || s.status === 'loading'
      if (!shouldBePlaying) return
      mediaSurface.setStatus('loading')
      s.setStatusExternal('loading')
      s.setLoadingReasonExternal('buffering')
    }

    const clearBuffering = () => {
      if (pRef.current.status === 'blocked') return
      pRef.current.setLoadingReasonExternal(undefined)
      applyPendingSeek()
    }

    const onEnded = () => {
      reportPlaythroughComplete(1)
      hardStopAndDetach()
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

    if (p.status === 'blocked') {
      // A final guard: blocked means no play/pause intent should do anything.
      playIntentRef.current = false
      return
    }

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
  }, [p.intent, p.status])

  /* ---------------- User gesture bridge ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const resume = () => {
      if (pRef.current.status === 'blocked') return

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

