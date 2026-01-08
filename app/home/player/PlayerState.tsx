// web/app/home/player/PlayerState.tsx
'use client'

import React from 'react'

export type PlayerTrack = {
  id: string
  title?: string
  artist?: string
  durationMs?: number
  muxPlaybackId?: string
}

type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked'
type RepeatMode = 'off' | 'one' | 'all'
type Intent = 'play' | 'pause' | null
type LoadingReason = 'token' | 'attach' | 'buffering' | undefined

export type PlayerState = {
  status: PlayerStatus
  current?: PlayerTrack
  queue: PlayerTrack[]
  lastError?: string

  // identifies what the queue represents (album id for now)
  queueContextId?: string
  queueContextArtworkUrl?: string | null

  // Optimistic UI
  intent: Intent
  intentAtMs?: number
  selectedTrackId?: string
  pendingTrackId?: string

  // Seek optimism
  pendingSeekMs?: number
  seeking: boolean

  // Loading micro-feedback
  loadingReason?: LoadingReason

  // Retry hook for AudioEngine
  reloadNonce: number

  // UI-facing playback telemetry
  positionMs: number
  seekNonce: number

  volume: number // 0..1
  muted: boolean
  repeat: RepeatMode

  // ✅ session cache: durations learned from playback metadata
  durationById: Record<string, number>
}

type PlayerActions = {
  // transport-ish
  play: (track?: PlayerTrack) => void
  pause: () => void
  next: () => void
  prev: () => void

  // queue mgmt
  setQueue: (tracks: PlayerTrack[], opts?: {contextId?: string; artworkUrl?: string | null}) => void
  enqueue: (track: PlayerTrack) => void

  // telemetry
  setPositionMs: (ms: number) => void
  setDurationMs: (ms: number) => void

  // external status updates from engine
  setStatusExternal: (s: PlayerStatus) => void
  setLoadingReasonExternal: (r?: LoadingReason) => void

  // intents + optimistic selection
  setIntent: (i: Intent) => void
  clearIntent: () => void
  selectTrack: (id?: string) => void
  setPendingTrackId: (id?: string) => void
  resolvePendingTrack: (id: string) => void

  // seeking
  seek: (ms: number) => void
  clearPendingSeek: () => void

  // volume
  setVolume: (v: number) => void
  toggleMute: () => void

  // repeat
  cycleRepeat: () => void

  // optional: fake tick
  tick: (deltaMs: number) => void

  // errors
  setBlocked: (reason?: string) => void
  clearError: () => void

  // retry
  bumpReload: () => void
}

const PlayerCtx = React.createContext<(PlayerState & PlayerActions) | null>(null)

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n))
}

function nextRepeat(r: RepeatMode): RepeatMode {
  if (r === 'off') return 'all'
  if (r === 'all') return 'one'
  return 'off'
}

function hydrateTrack(t: PlayerTrack, durationById: Record<string, number>): PlayerTrack {
  const cached = durationById[t.id]
  if (!cached) return t
  if (t.durationMs === cached) return t
  return {...t, durationMs: cached}
}

function hydrateTracks(ts: PlayerTrack[], durationById: Record<string, number>) {
  let changed = false
  const next = ts.map((t) => {
    const ht = hydrateTrack(t, durationById)
    if (ht !== t) changed = true
    return ht
  })
  return changed ? next : ts
}

export function PlayerStateProvider(props: {children: React.ReactNode}) {
  const [state, setState] = React.useState<PlayerState>({
    status: 'idle',
    current: undefined,
    queue: [],
    lastError: undefined,

    queueContextId: undefined,
    queueContextArtworkUrl: null,

    intent: null,
    intentAtMs: undefined,
    selectedTrackId: undefined,
    pendingTrackId: undefined,

    pendingSeekMs: undefined,
    seeking: false,

    loadingReason: undefined,
    reloadNonce: 0,

    positionMs: 0,
    seekNonce: 0,

    volume: 0.9,
    muted: false,
    repeat: 'off',

    durationById: {},
  })

  const api: PlayerState & PlayerActions = React.useMemo(() => {
    return {
      ...state,

      /* ---------------- Intent ---------------- */

      setIntent: (i: Intent) =>
        setState((s) => ({
          ...s,
          intent: i,
          intentAtMs: i ? Date.now() : undefined,
        })),

      clearIntent: () =>
        setState((s) => (s.intent ? {...s, intent: null, intentAtMs: undefined} : s)),

      /* ---------------- Selection / pending track ---------------- */

      selectTrack: (id?: string) =>
        setState((s) => ({
          ...s,
          selectedTrackId: id,
        })),

      setPendingTrackId: (id?: string) =>
        setState((s) => ({
          ...s,
          pendingTrackId: id,
        })),

      resolvePendingTrack: (id: string) =>
        setState((s) => {
          if (s.pendingTrackId !== id) return s
          return {...s, pendingTrackId: undefined}
        }),

      /* ---------------- Transport ---------------- */

      play: (track?: PlayerTrack) => {
        setState((s) => {
          const rawNext = track ?? s.current ?? s.queue[0]
          if (!rawNext) {
            return {
              ...s,
              status: 'idle',
              current: undefined,
              positionMs: 0,
              intent: 'play',
              intentAtMs: Date.now(),
              lastError: undefined,
              loadingReason: undefined,
              pendingTrackId: undefined,
            }
          }

          const nextTrack = hydrateTrack(rawNext, s.durationById)
          const sameTrack = Boolean(s.current && s.current.id === nextTrack.id)

          const base = {
            ...s,
            intent: 'play' as const,
            intentAtMs: Date.now(),
            lastError: undefined,
            selectedTrackId: nextTrack.id,
            pendingTrackId: nextTrack.id,
          }

          // resume (same track + paused)
          if (sameTrack && s.status === 'paused') {
            return {
              ...base,
              current: hydrateTrack(s.current!, s.durationById),
              status: 'playing',
              loadingReason: undefined,
            }
          }

          // already playing/loading same track: don’t clobber
          if (sameTrack && (s.status === 'playing' || s.status === 'loading')) {
            return {...base, loadingReason: s.loadingReason}
          }

          // new track
          return {
            ...base,
            current: nextTrack,
            status: 'loading',
            loadingReason: 'token',
            positionMs: 0,
          }
        })
      },

      pause: () =>
        setState((s) => ({
          ...s,
          intent: 'pause',
          intentAtMs: Date.now(),
          status: s.status === 'playing' ? 'paused' : s.status,
        })),

      next: () => {
        setState((s) => {
          const cur = s.current
          if (!cur || s.queue.length === 0) return s

          const idx = s.queue.findIndex((t) => t.id === cur.id)
          const at = idx >= 0 ? idx : 0

          if (s.repeat === 'one') {
            return {
              ...s,
              status: 'loading',
              loadingReason: 'attach',
              positionMs: 0,
              intent: 'play',
              intentAtMs: Date.now(),
              pendingTrackId: cur.id,
              selectedTrackId: cur.id,
            }
          }

          const nextIdx = at + 1
          const hasNext = nextIdx < s.queue.length

          if (hasNext) {
            const t = hydrateTrack(s.queue[nextIdx], s.durationById)
            return {
              ...s,
              current: t,
              status: 'loading',
              loadingReason: 'token',
              positionMs: 0,
              intent: 'play',
              intentAtMs: Date.now(),
              pendingTrackId: t.id,
              selectedTrackId: t.id,
            }
          }

          if (s.repeat === 'all' && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[0], s.durationById)
            return {
              ...s,
              current: t,
              status: 'loading',
              loadingReason: 'token',
              positionMs: 0,
              intent: 'play',
              intentAtMs: Date.now(),
              pendingTrackId: t.id,
              selectedTrackId: t.id,
            }
          }

          return {
            ...s,
            status: 'paused',
            loadingReason: undefined,
            positionMs: 0,
            intent: 'pause',
            intentAtMs: Date.now(),
            pendingTrackId: undefined,
          }
        })
      },

      prev: () => {
        setState((s) => {
          const cur = s.current
          if (!cur || s.queue.length === 0) return s

          if (s.positionMs > 3000) {
            return {
              ...s,
              positionMs: 0,
              status: 'loading',
              loadingReason: 'attach',
              intent: 'play',
              intentAtMs: Date.now(),
              pendingTrackId: cur.id,
              selectedTrackId: cur.id,
            }
          }

          const idx = s.queue.findIndex((t) => t.id === cur.id)
          const at = idx >= 0 ? idx : 0
          const prevIdx = at - 1

          if (prevIdx >= 0) {
            const t = hydrateTrack(s.queue[prevIdx], s.durationById)
            return {
              ...s,
              current: t,
              status: 'loading',
              loadingReason: 'token',
              positionMs: 0,
              intent: 'play',
              intentAtMs: Date.now(),
              pendingTrackId: t.id,
              selectedTrackId: t.id,
            }
          }

          if (s.repeat === 'all' && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[s.queue.length - 1], s.durationById)
            return {
              ...s,
              current: t,
              status: 'loading',
              loadingReason: 'token',
              positionMs: 0,
              intent: 'play',
              intentAtMs: Date.now(),
              pendingTrackId: t.id,
              selectedTrackId: t.id,
            }
          }

          return {
            ...s,
            positionMs: 0,
            status: 'loading',
            loadingReason: 'attach',
            intent: 'play',
            intentAtMs: Date.now(),
            pendingTrackId: cur.id,
            selectedTrackId: cur.id,
          }
        })
      },

      /* ---------------- Queue ---------------- */

      setQueue: (tracks: PlayerTrack[], opts?: {contextId?: string; artworkUrl?: string | null}) =>
        setState((s) => {
          const nextContextId = opts?.contextId ?? s.queueContextId
          const nextArtworkUrl =
            opts && 'artworkUrl' in opts ? (opts.artworkUrl ?? null) : s.queueContextArtworkUrl ?? null

          const hydratedQueue = hydrateTracks(tracks, s.durationById)

          const nextCurrentRaw = s.current ?? hydratedQueue[0]
          const nextCurrent = nextCurrentRaw ? hydrateTrack(nextCurrentRaw, s.durationById) : undefined

          return {
            ...s,
            queue: hydratedQueue,
            queueContextId: nextContextId,
            queueContextArtworkUrl: nextArtworkUrl,
            current: nextCurrent,
            positionMs: s.current ? s.positionMs : 0,
            selectedTrackId: s.selectedTrackId ?? nextCurrent?.id,
          }
        }),

      enqueue: (track: PlayerTrack) =>
        setState((s) => {
          const t = hydrateTrack(track, s.durationById)
          return {
            ...s,
            queue: [...s.queue, t],
            current: s.current ?? t,
            selectedTrackId: s.selectedTrackId ?? t.id,
          }
        }),

      /* ---------------- Telemetry ---------------- */

      setPositionMs: (ms: number) =>
        setState((s) => ({
          ...s,
          positionMs: Math.max(0, ms),
        })),

      // ✅ store duration in cache + reflect it in current + queue entries
      setDurationMs: (ms: number) =>
        setState((s) => {
          const cur = s.current
          if (!cur) return s
          if (!Number.isFinite(ms) || ms <= 0) return s

          const prev = s.durationById[cur.id]
          const same = prev === ms || cur.durationMs === ms
          if (same) return s

          const nextDurationById = {...s.durationById, [cur.id]: ms}
          const nextCurrent = {...cur, durationMs: ms}

          // update any matching track in queue too
          let changed = false
          const nextQueue = s.queue.map((t) => {
            if (t.id !== cur.id) return t
            if (t.durationMs === ms) return t
            changed = true
            return {...t, durationMs: ms}
          })

          return {
            ...s,
            current: nextCurrent,
            queue: changed ? nextQueue : s.queue,
            durationById: nextDurationById,
          }
        }),

      setStatusExternal: (st: PlayerStatus) =>
        setState((s) => (s.status === st ? s : {...s, status: st})),

      setLoadingReasonExternal: (r?: LoadingReason) =>
        setState((s) => (s.loadingReason === r ? s : {...s, loadingReason: r})),

      /* ---------------- Seeking ---------------- */

      seek: (ms: number) => {
        setState((s) => {
          const dur = s.current?.durationMs ?? s.durationById[s.current?.id ?? ''] ?? 0
          const next = dur > 0 ? clamp(ms, 0, dur) : Math.max(0, ms)
          return {
            ...s,
            positionMs: next,
            pendingSeekMs: next,
            seeking: true,
            seekNonce: s.seekNonce + 1,
          }
        })
      },

      clearPendingSeek: () =>
        setState((s) => {
          if (!s.seeking && s.pendingSeekMs == null) return s
          return {...s, seeking: false, pendingSeekMs: undefined}
        }),

      /* ---------------- Volume ---------------- */

      setVolume: (v: number) => setState((s) => ({...s, volume: clamp(v, 0, 1)})),
      toggleMute: () => setState((s) => ({...s, muted: !s.muted})),

      /* ---------------- Repeat ---------------- */

      cycleRepeat: () => setState((s) => ({...s, repeat: nextRepeat(s.repeat)})),

      /* ---------------- Optional fake tick ---------------- */

      tick: (deltaMs: number) => {
        setState((s) => {
          if (s.status !== 'playing') return s
          const curId = s.current?.id
          const dur = (curId ? s.durationById[curId] : 0) || s.current?.durationMs || 0
          const nextPos = Math.max(0, s.positionMs + Math.max(0, deltaMs))

          if (dur <= 0) return {...s, positionMs: nextPos}
          if (nextPos < dur) return {...s, positionMs: nextPos}

          if (s.repeat === 'one') return {...s, positionMs: 0}

          const cur = s.current
          const idx = cur ? s.queue.findIndex((t) => t.id === cur.id) : -1
          const at = idx >= 0 ? idx : 0
          const nextIdx = at + 1

          if (nextIdx < s.queue.length) {
            const t = hydrateTrack(s.queue[nextIdx], s.durationById)
            return {...s, current: t, positionMs: 0, selectedTrackId: t.id, pendingTrackId: t.id}
          }
          if (s.repeat === 'all' && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[0], s.durationById)
            return {...s, current: t, positionMs: 0, selectedTrackId: t.id, pendingTrackId: t.id}
          }
          return {...s, status: 'paused', positionMs: dur}
        })
      },

      /* ---------------- Errors / blocked ---------------- */

      setBlocked: (reason?: string) =>
        setState((s) => ({
          ...s,
          status: 'blocked',
          lastError: reason ?? 'Playback blocked.',
          loadingReason: undefined,
          intent: null,
          intentAtMs: undefined,
        })),

      clearError: () => setState((s) => ({...s, lastError: undefined})),

      /* ---------------- Retry ---------------- */

      bumpReload: () =>
        setState((s) => {
          if (!s.current?.muxPlaybackId) return {...s, reloadNonce: s.reloadNonce + 1}
          return {
            ...s,
            reloadNonce: s.reloadNonce + 1,
            status: 'loading',
            loadingReason: 'token',
            lastError: undefined,
            intent: 'play',
            intentAtMs: Date.now(),
            pendingTrackId: s.current.id,
            selectedTrackId: s.current.id,
          }
        }),
    }
  }, [state])

  return <PlayerCtx.Provider value={api}>{props.children}</PlayerCtx.Provider>
}

export function usePlayer() {
  const ctx = React.useContext(PlayerCtx)
  if (!ctx) throw new Error('usePlayer must be used within PlayerStateProvider')
  return ctx
}
