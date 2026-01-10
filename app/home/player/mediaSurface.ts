'use client'

export type MediaStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'blocked'
export type StageVariant = 'inline' | 'fullscreen'

export type MediaEvent =
  | {type: 'time'; ms: number}
  | {type: 'status'; status: MediaStatus}
  | {type: 'track'; id: string | null}
  | {type: 'stage'; variant: StageVariant | null}

type Listener = (e: MediaEvent) => void

class MediaSurface {
  private listeners = new Set<Listener>()
  private lastTimeMs = 0
  private lastStatus: MediaStatus = 'idle'
  private lastTrackId: string | null = null

  // Stage “authority”
  private inlineCount = 0
  private fullscreenCount = 0
  private activeStage: StageVariant | null = null

  subscribe(fn: Listener) {
    this.listeners.add(fn)
    fn({type: 'time', ms: this.lastTimeMs})
    fn({type: 'status', status: this.lastStatus})
    fn({type: 'track', id: this.lastTrackId})
    fn({type: 'stage', variant: this.activeStage})

    return () => {
      this.listeners.delete(fn)
    }
  }

  /* ---------------- media state ---------------- */

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

  /* ---------------- stage authority ---------------- */

  private recomputeStage() {
    const next: StageVariant | null = this.fullscreenCount > 0 ? 'fullscreen' : this.inlineCount > 0 ? 'inline' : null
    if (next === this.activeStage) return
    this.activeStage = next
    for (const fn of this.listeners) fn({type: 'stage', variant: next})
  }

  registerStage(variant: StageVariant) {
    if (variant === 'fullscreen') this.fullscreenCount++
    else this.inlineCount++
    this.recomputeStage()

    return () => {
      if (variant === 'fullscreen') this.fullscreenCount = Math.max(0, this.fullscreenCount - 1)
      else this.inlineCount = Math.max(0, this.inlineCount - 1)
      this.recomputeStage()
    }
  }

  getStageVariant(): StageVariant | null {
    return this.activeStage
  }
}

export const mediaSurface = new MediaSurface()
