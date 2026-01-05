'use client'

import React from 'react'

export type PlayerTrack = {
  id: string
  title?: string
  artist?: string
  durationMs?: number
}

type PlayerStatus = 'idle' | 'playing' | 'paused' | 'blocked'

export type PlayerState = {
  status: PlayerStatus
  current?: PlayerTrack
  queue: PlayerTrack[]
  lastError?: string
}

type PlayerActions = {
  play: (track?: PlayerTrack) => void
  pause: () => void
  setQueue: (tracks: PlayerTrack[]) => void
  enqueue: (track: PlayerTrack) => void
  setBlocked: (reason?: string) => void
  clearError: () => void
}

const PlayerCtx = React.createContext<(PlayerState & PlayerActions) | null>(null)

export function PlayerStateProvider(props: {children: React.ReactNode}) {
  const [state, setState] = React.useState<PlayerState>({
    status: 'idle',
    current: undefined,
    queue: [],
    lastError: undefined,
  })

  const api: PlayerState & PlayerActions = React.useMemo(() => {
    return {
      ...state,
      play: (track?: PlayerTrack) => {
        setState((s) => {
          const nextTrack = track ?? s.current ?? s.queue[0]
          if (!nextTrack) return {...s, status: 'idle'}
          return {...s, current: nextTrack, status: 'playing', lastError: undefined}
        })
      },
      pause: () => setState((s) => ({...s, status: s.status === 'playing' ? 'paused' : s.status})),
      setQueue: (tracks: PlayerTrack[]) =>
        setState((s) => ({
          ...s,
          queue: tracks,
          current: s.current ?? tracks[0],
        })),
      enqueue: (track: PlayerTrack) =>
        setState((s) => ({
          ...s,
          queue: [...s.queue, track],
          current: s.current ?? track,
        })),
      setBlocked: (reason?: string) =>
        setState((s) => ({
          ...s,
          status: 'blocked',
          lastError: reason ?? 'Playback blocked.',
        })),
      clearError: () => setState((s) => ({...s, lastError: undefined})),
    }  
  }, [state])

  return <PlayerCtx.Provider value={api}>{props.children}</PlayerCtx.Provider>
}

export function usePlayer() {
  const ctx = React.useContext(PlayerCtx)
  if (!ctx) throw new Error('usePlayer must be used within PlayerStateProvider')
  return ctx
}
