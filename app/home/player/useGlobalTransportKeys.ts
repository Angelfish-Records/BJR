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

    const shouldIgnore = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return true
      if (isTypingTarget(e.target)) return true
      return false
    }

    const blurInteractiveFocus = () => {
      const ae = document.activeElement as HTMLElement | null
      if (!ae) return
      // don’t blur typing targets (OTP/input etc.)
      if (isTypingTarget(ae)) return

      // If focus is on a control, spacebar will “press” it unless we blur.
      const interactive =
        ae.tagName === 'BUTTON' ||
        ae.tagName === 'A' ||
        ae.getAttribute('role') === 'button' ||
        ae.tabIndex >= 0

      if (interactive) ae.blur()
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnore(e)) return

      // prevent scroll + prevent “button press” behaviour
      e.preventDefault()
      e.stopPropagation()

      // optional: avoid repeats if key held down
      if (e.repeat) return

      blurInteractiveFocus()

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

    const onKeyUp = (e: KeyboardEvent) => {
      // keyup is where browsers often fire the “click” for spacebar on focused buttons
      if (shouldIgnore(e)) return
      e.preventDefault()
      e.stopPropagation()
    }

    window.addEventListener('keydown', onKeyDown, {capture: true})
    window.addEventListener('keyup', onKeyUp, {capture: true})
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [enabled])
}
