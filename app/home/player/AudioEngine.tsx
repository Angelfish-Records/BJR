// web/app/home/player/AudioEngine.tsx
'use client'

import React from 'react'
import Hls from 'hls.js'
import {usePlayer} from './PlayerState'
import {muxSignedHlsUrl} from '@/lib/mux'
import {mediaSurface} from './mediaSurface'
import {audioSurface} from './audioSurface'

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

  // ---- Audio analysis ----
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const analyserRef = React.useRef<AnalyserNode | null>(null)
  const freqDataRef = React.useRef<Uint8Array<ArrayBufferLike> | null>(null)
  const timeDataRef = React.useRef<Uint8Array<ArrayBufferLike> | null>(null)

  // ---- Playback intent ----
  const playIntentRef = React.useRef(false)
  const attachedPlaybackIdRef = React.useRef<string | null>(null)

  const tokenCacheRef = React.useRef(new Map<string, {token: string; expiresAtMs: number}>())

  const pRef = React.useRef(p)
  React.useEffect(() => {
    pRef.current = p
  }, [p])

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
    freqDataRef.current = new Uint8Array(analyser.frequencyBinCount)
    timeDataRef.current = new Uint8Array(analyser.fftSize)
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

      analyser.getByteFrequencyData(freq as unknown as Uint8Array<ArrayBuffer>)
      analyser.getByteTimeDomainData(time as unknown as Uint8Array<ArrayBuffer>)


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

  const alreadyAttached =
    attachedPlaybackIdRef.current === playbackId &&
    (Boolean(a.currentSrc) || Boolean(hlsRef.current))

  if (alreadyAttached) return

  const seq = ++loadSeq.current

  if (hlsRef.current) {
    try {
      hlsRef.current.destroy()
    } catch {}
    hlsRef.current = null
    attachedPlaybackIdRef.current = null
  }

  tokenAbortRef.current?.abort()
  const ac = new AbortController()
  tokenAbortRef.current = ac

  const attachSrc = (src: string) => {
    a.pause()
    a.removeAttribute('src')
    a.load()

    if (seq !== loadSeq.current) return

    if (canPlayNativeHls(a)) {
      a.src = src
      a.load()
      attachedPlaybackIdRef.current = playbackId
    } else {
      if (!Hls.isSupported()) {
        pRef.current.setBlocked('This browser cannot play HLS.')
        return
      }

      const hls = new Hls({enableWorker: true})
      hlsRef.current = hls

      hls.on(Hls.Events.ERROR, (_e, err) => {
        if (err?.fatal) {
          pRef.current.setBlocked(`HLS fatal: ${err.details ?? 'error'}`)
          try {
            hls.destroy()
          } catch {}
        }
      })

      hls.loadSource(src)
      hls.attachMedia(a)
      attachedPlaybackIdRef.current = playbackId
    }

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

      const res = await fetch('/api/mux/playback-token', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({playbackId}),
        signal: ac.signal,
      })

      const data = (await res.json()) as TokenResponse
      if (!res.ok || !data.ok) {
        pRef.current.setBlocked(!data.ok ? data.reason : 'Token error')
        return
      }

      const expiresAtMs = Date.parse(data.expiresAt)
      if (Number.isFinite(expiresAtMs)) {
        tokenCacheRef.current.set(playbackId, {token: data.token, expiresAtMs})
      }

      attachSrc(muxSignedHlsUrl(playbackId, data.token))
    } catch {}
  }

  void load()
  return () => ac.abort()
}, [p.current?.id, p.current?.muxPlaybackId, p.status, p.intent, p.reloadNonce])


  /* ---------------- Time + state reporting ---------------- */

  React.useEffect(() => {
    const a = audioRef.current
    if (!a) return

    const onTime = () => {
      const ms = Math.floor(a.currentTime * 1000)
      mediaSurface.setTime(ms)
      pRef.current.setPositionMs(ms)
    }

    const onEnded = () => {
      window.dispatchEvent(new Event('af:play-intent'))
      pRef.current.next()
    }

    a.addEventListener('timeupdate', onTime)
    a.addEventListener('ended', onEnded)

    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('ended', onEnded)
    }
  }, [])

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

  return <audio ref={audioRef} preload="metadata" playsInline style={{display: 'none'}} />
}
