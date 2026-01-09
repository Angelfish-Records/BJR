// web/app/home/player/mediaSurface.ts
'use client'

export type MediaStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked'

export type MediaEvent =
  | {type: 'time'; ms: number}
  | {type: 'status'; status: MediaStatus}
  | {type: 'track'; id: string | null}

type Listener = (e: MediaEvent) => void

class MediaSurface {
  private listeners = new Set<Listener>()
  private lastTimeMs = 0
  private lastStatus: MediaStatus = 'idle'
  private lastTrackId: string | null = null

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn({type: 'time', ms: this.lastTimeMs})
    fn({type: 'status', status: this.lastStatus})
    fn({type: 'track', id: this.lastTrackId})
    return () => {
      this.listeners.delete(fn)
    }}

  setTime(ms: number) {
    this.lastTimeMs = ms
    for (const fn of this.listeners) fn({type: 'time', ms})
  }

  setStatus(status: MediaStatus) {
    this.lastStatus = status
    for (const fn of this.listeners) fn({type: 'status', status})
  }

  setTrack(id: string | null) {
    this.lastTrackId = id
    for (const fn of this.listeners) fn({type: 'track', id})
  }

  getTimeMs() {
    return this.lastTimeMs
  }

  getStatus() {
    return this.lastStatus
  }

  getTrackId() {
    return this.lastTrackId
  }
}

export const mediaSurface = new MediaSurface()
