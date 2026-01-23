// web/app/home/player/useGlobalTransportKeys.ts
'use client'

import * as React from 'react'
import type {PlayerTrack} from '@/lib/types'

export type GlobalTransportPlayer = {
  status: string
  intent?: string | null
  current?: PlayerTrack | null
  queue: PlayerTrack[]
  play: (track?: PlayerTrack) => void
  pause: () => void
}

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}

export function useGlobalTransportKeys(p: GlobalTransportPlayer, opts?: {enabled?: boolean}) {
  const enabled = opts?.enabled ?? true

  const pRef = React.useRef<GlobalTransportPlayer>(p)
  React.useEffect(() => {
    pRef.current = p
  }, [p])

  React.useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      // Space toggles play/pause
      if (e.code !== 'Space') return
      if (e.repeat) return

      // Don't hijack typing / OTP / inputs
      if (isTypingTarget(e.target)) return

      // Prevent scroll
      e.preventDefault()

      const ps = pRef.current
      const playingish = ps.status === 'playing' || ps.status === 'loading' || ps.intent === 'play'

      if (playingish) {
        window.dispatchEvent(new Event('af:pause-intent'))
        ps.pause()
        return
      }

      const t = ps.current ?? ps.queue[0]
      if (!t) return
      window.dispatchEvent(new Event('af:play-intent'))
      ps.play(t)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}
