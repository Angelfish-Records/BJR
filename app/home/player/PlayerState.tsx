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


export type PlayerState = {
  status: PlayerStatus
  current?: PlayerTrack
  queue: PlayerTrack[]
  lastError?: string

    // NEW: identifies what the queue represents (album id for now)
  queueContextId?: string

  // UI-facing playback telemetry (real audio engine can own these later)
  positionMs: number
  seekNonce: number

  volume: number // 0..1
  muted: boolean
  repeat: RepeatMode
}

type PlayerActions = {
  play: (track?: PlayerTrack) => void
  pause: () => void
  setPositionMs: (ms: number) => void
  setDurationMs: (ms: number) => void
  setStatusExternal: (s: PlayerStatus) => void


   // CHANGED: add optional contextId
  setQueue: (tracks: PlayerTrack[], opts?: {contextId?: string}) => void
  enqueue: (track: PlayerTrack) => void

  // Transport (stubs now; later: drive the real audio engine)
  next: () => void
  prev: () => void
  
  seek: (ms: number) => void

  // Volume (stubs now; later: drive the real audio element)
  setVolume: (v: number) => void
  toggleMute: () => void

  // Repeat (UI state)
  cycleRepeat: () => void

  // Optional: tick time forward (useful if you want “fake” progress for now)
  tick: (deltaMs: number) => void

  setBlocked: (reason?: string) => void
  clearError: () => void
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

export function PlayerStateProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<PlayerState>({
    status: 'idle',
    current: undefined,
    queue: [],
    lastError: undefined,

    queueContextId: undefined, // NEW

    positionMs: 0,
    seekNonce: 0,
    volume: 0.9,
    muted: false,
    repeat: 'off',
  })

  const api: PlayerState & PlayerActions = React.useMemo(() => {
    return {
      ...state,

      play: (track?: PlayerTrack) => {
        setState((s) => {
          const nextTrack = track ?? s.current ?? s.queue[0]
          if (!nextTrack) return { ...s, status: 'idle', current: undefined, positionMs: 0 }
          return { ...s, current: nextTrack, status: 'loading', lastError: undefined, positionMs: 0 }
        })
      },

      pause: () =>
        setState((s) => ({ ...s, status: s.status === 'playing' ? 'paused' : s.status })),

            setPositionMs: (ms: number) =>
              setState((s) => ({ ...s, positionMs: Math.max(0, ms) })),


      setDurationMs: (ms: number) =>
        setState((s) => {
          if (!s.current) return s
          if (s.current.durationMs === ms) return s
          return {...s, current: {...s.current, durationMs: ms}}
        }),

      setStatusExternal: (st: PlayerStatus) =>
        setState((s) => (s.status === st ? s : {...s, status: st})),

      
      setQueue: (tracks: PlayerTrack[], opts?: {contextId?: string}) =>
          setState((s) => ({
            ...s,
            queue: tracks,
            queueContextId: opts?.contextId ?? s.queueContextId,
            current: s.current ?? tracks[0],
            positionMs: s.current ? s.positionMs : 0,
          })),


      enqueue: (track: PlayerTrack) =>
        setState((s) => ({
          ...s,
          queue: [...s.queue, track],
          current: s.current ?? track,
        })),

      next: () => {
        setState((s) => {
          const cur = s.current
          if (!cur || s.queue.length === 0) return s

          const idx = s.queue.findIndex((t) => t.id === cur.id)
          const at = idx >= 0 ? idx : 0

          // Repeat-one: stay on track
          if (s.repeat === 'one') return { ...s, status: 'loading', positionMs: 0 }

          const nextIdx = at + 1
          const hasNext = nextIdx < s.queue.length

          if (hasNext) {
            return { ...s, current: s.queue[nextIdx], status: 'loading', positionMs: 0 }
          }

          // End of queue
          if (s.repeat === 'all' && s.queue.length > 0) {
            return { ...s, current: s.queue[0], status: 'loading', positionMs: 0 }
          }

          return { ...s, status: 'paused', positionMs: 0 }
        })
      },

      prev: () => {
        setState((s) => {
          const cur = s.current
          if (!cur || s.queue.length === 0) return s

          // “industry standard”: if you’re > ~3s in, restart track
          if (s.positionMs > 3000) return { ...s, positionMs: 0, status: 'loading' }

          const idx = s.queue.findIndex((t) => t.id === cur.id)
          const at = idx >= 0 ? idx : 0
          const prevIdx = at - 1

          if (prevIdx >= 0) {
            return { ...s, current: s.queue[prevIdx], status: 'loading', positionMs: 0 }
          }

          // At start
          if (s.repeat === 'all' && s.queue.length > 0) {
            return { ...s, current: s.queue[s.queue.length - 1], status: 'loading', positionMs: 0 }
          }

          return { ...s, positionMs: 0, status: 'loading' }
        })
      },

      seek: (ms: number) => {
  setState((s) => {
    const dur = s.current?.durationMs ?? 0
    const next = dur > 0 ? clamp(ms, 0, dur) : Math.max(0, ms)
    return { ...s, positionMs: next, seekNonce: s.seekNonce + 1 }
  })
},


      setVolume: (v: number) => setState((s) => ({ ...s, volume: clamp(v, 0, 1) })),

      toggleMute: () => setState((s) => ({ ...s, muted: !s.muted })),

      cycleRepeat: () => setState((s) => ({ ...s, repeat: nextRepeat(s.repeat) })),

      tick: (deltaMs: number) => {
        setState((s) => {
          if (s.status !== 'playing') return s
          const dur = s.current?.durationMs ?? 0
          const nextPos = Math.max(0, s.positionMs + Math.max(0, deltaMs))

          if (dur <= 0) return { ...s, positionMs: nextPos }

          if (nextPos < dur) return { ...s, positionMs: nextPos }

          // Reached end
          if (s.repeat === 'one') return { ...s, positionMs: 0 }
          // advance
          const cur = s.current
          const idx = cur ? s.queue.findIndex((t) => t.id === cur.id) : -1
          const at = idx >= 0 ? idx : 0
          const nextIdx = at + 1

          if (nextIdx < s.queue.length) {
            return { ...s, current: s.queue[nextIdx], positionMs: 0 }
          }
          if (s.repeat === 'all' && s.queue.length > 0) {
            return { ...s, current: s.queue[0], positionMs: 0 }
          }
          return { ...s, status: 'paused', positionMs: dur }
        })
      },

      setBlocked: (reason?: string) =>
        setState((s) => ({
          ...s,
          status: 'blocked',
          lastError: reason ?? 'Playback blocked.',
        })),

      clearError: () => setState((s) => ({ ...s, lastError: undefined })),
    }
  }, [state])

  return <PlayerCtx.Provider value={api}>{props.children}</PlayerCtx.Provider>
}

export function usePlayer() {
  const ctx = React.useContext(PlayerCtx)
  if (!ctx) throw new Error('usePlayer must be used within PlayerStateProvider')
  return ctx
}
