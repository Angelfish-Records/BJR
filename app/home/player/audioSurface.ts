'use client'

export type AudioFeatures = {
  rms: number
  bass: number
  mid: number
  treble: number
  centroid: number
  energy: number
}

class AudioSurface {
  private features: AudioFeatures = {
    rms: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    centroid: 0,
    energy: 0,
  }

  set(next: Partial<AudioFeatures>) {
    Object.assign(this.features, next)
  }

  get(): AudioFeatures {
    return this.features
  }
}

export const audioSurface = new AudioSurface()
