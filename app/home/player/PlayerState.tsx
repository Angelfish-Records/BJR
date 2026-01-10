// web/app/home/player/PlayerState.tsx
'use client'

import React from 'react'

import type {PlayerTrack} from '@/lib/types'

type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked'
type RepeatMode = 'off' | 'one' | 'all'
type Intent = 'play' | 'pause' | null
type LoadingReason = 'token' | 'attach' | 'buffering' | undefined

export type QueueContext = {
  contextId?: string
  contextSlug?: string
  contextTitle?: string
  contextArtist?: string
  artworkUrl?: string | null
}

export type PlayerState = {
  status: PlayerStatus
  current?: PlayerTrack
  queue: PlayerTrack[]
  lastError?: string

  // identifies what the queue represents (album-ish context)
  queueContextId?: string
  queueContextSlug?: string
  queueContextTitle?: string
  queueContextArtist?: string
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

  // session cache: durations learned (or primed) during this session
  durationById: Record<string, number>
}

type PlayerActions = {
  // transport-ish
  play: (track?: PlayerTrack) => void
  pause: () => void
  next: () => void
  prev: () => void

  // queue mgmt
  setQueue: (tracks: PlayerTrack[], opts?: QueueContext) => void
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
  if (!cached || cached <= 0) return t
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

function primeDurationById(prev: Record<string, number>, tracks: PlayerTrack[]): Record<string, number> {
  // Only set from Sanity values when present and positive.
  // Never overwrite an existing cached value (keeps “Sanity is canonical” stable).
  let next = prev
  for (const t of tracks) {
    if (!t?.id) continue
    const ms = t.durationMs
    if (typeof ms !== 'number' || !Number.isFinite(ms) || ms <= 0) continue
    if (typeof next[t.id] === 'number' && next[t.id] > 0) continue
    if (next === prev) next = {...prev}
    next[t.id] = ms
  }
  return next
}

export function PlayerStateProvider(props: {children: React.ReactNode}) {
  const [state, setState] = React.useState<PlayerState>({
    status: 'idle',
    current: undefined,
    queue: [],
    lastError: undefined,

    queueContextId: undefined,
    queueContextSlug: undefined,
    queueContextTitle: undefined,
    queueContextArtist: undefined,
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

          // Resume: same track + paused -> keep position, don't force loading/token.
          if (sameTrack && s.status === 'paused') {
            return {
              ...base,
              current: hydrateTrack(s.current!, s.durationById),
              status: 'playing',
              loadingReason: undefined,
            }
          }

          // Already playing/loading same track -> don't clobber position/status.
          if (sameTrack && (s.status === 'playing' || s.status === 'loading')) {
            return {...base, loadingReason: s.loadingReason}
          }

          // New track -> reset position + go loading.
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

          // repeat-one: stay on track, restart
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
          if (nextIdx < s.queue.length) {
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

          // end of queue
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

          // ✅ restart-on-prev ONLY while actually playing (not paused)
          if (s.status === 'playing' && s.positionMs > 3000) {
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

          // at start
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

          // default: restart current
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

      setQueue: (tracks: PlayerTrack[], opts?: QueueContext) =>
        setState((s) => {
          const nextDurationById = primeDurationById(s.durationById, tracks)
          const hydratedQueue = hydrateTracks(tracks, nextDurationById)

          const nextCurrentRaw = s.current ?? hydratedQueue[0]
          const nextCurrent = nextCurrentRaw ? hydrateTrack(nextCurrentRaw, nextDurationById) : undefined

          const slug = typeof opts?.contextSlug === 'string' ? opts.contextSlug.trim() : ''
          const title = typeof opts?.contextTitle === 'string' ? opts.contextTitle.trim() : ''
          const artist = typeof opts?.contextArtist === 'string' ? opts.contextArtist.trim() : ''

          const hasSlug = slug.length > 0
          const hasTitle = title.length > 0
          const hasArtist = artist.length > 0
          const hasArtwork = typeof opts?.artworkUrl !== 'undefined'
          const hasId = typeof opts?.contextId === 'string' && opts.contextId.length > 0

          return {
            ...s,
            durationById: nextDurationById,
            queue: hydratedQueue,

            queueContextId: hasId ? opts!.contextId : s.queueContextId,
            queueContextSlug: hasSlug ? slug : s.queueContextSlug,
            queueContextTitle: hasTitle ? title : s.queueContextTitle,
            queueContextArtist: hasArtist ? artist : s.queueContextArtist,
            queueContextArtworkUrl: hasArtwork ? (opts!.artworkUrl ?? null) : s.queueContextArtworkUrl ?? null,

            current: nextCurrent,
            positionMs: s.current ? s.positionMs : 0,
            selectedTrackId: s.selectedTrackId ?? nextCurrent?.id,
          }
        }),

      enqueue: (track: PlayerTrack) =>
        setState((s) => {
          const nextDurationById = primeDurationById(s.durationById, [track])
          const t = hydrateTrack(track, nextDurationById)
          return {
            ...s,
            durationById: nextDurationById,
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

      // ✅ “Sanity is canonical”
      setDurationMs: (ms: number) =>
        setState((s) => {
          const cur = s.current
          if (!cur) return s
          if (!Number.isFinite(ms) || ms <= 0) return s

          const alreadyCached = typeof s.durationById[cur.id] === 'number' && s.durationById[cur.id] > 0
          const alreadyOnTrack = typeof cur.durationMs === 'number' && cur.durationMs > 0
          if (alreadyCached || alreadyOnTrack) return s

          const nextDurationById = {...s.durationById, [cur.id]: ms}

          const nextCurrent = {...cur, durationMs: ms}
          let changed = false
          const nextQueue = s.queue.map((t) => {
            if (t.id !== cur.id) return t
            if (typeof t.durationMs === 'number' && t.durationMs > 0) return t
            changed = true
            return {...t, durationMs: ms}
          })

          return {
            ...s,
            durationById: nextDurationById,
            current: nextCurrent,
            queue: changed ? nextQueue : s.queue,
          }
        }),

      setStatusExternal: (st: PlayerStatus) => setState((s) => (s.status === st ? s : {...s, status: st})),

      setLoadingReasonExternal: (r?: LoadingReason) =>
        setState((s) => (s.loadingReason === r ? s : {...s, loadingReason: r})),

      /* ---------------- Seeking ---------------- */

      seek: (ms: number) => {
        setState((s) => {
          const curId = s.current?.id ?? ''
          const dur = (curId ? s.durationById[curId] : 0) || s.current?.durationMs || 0
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

          const curId = s.current?.id ?? ''
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
