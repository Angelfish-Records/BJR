// web/app/home/player/StageInline.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'
import {usePlayer} from './PlayerState'
import StageCore from './StageCore'


function lockBodyScroll(lock: boolean) {
  if (typeof document === 'undefined') return
  const el = document.documentElement
  const body = document.body
  if (lock) {
    el.style.overflow = 'hidden'
    body.style.overflow = 'hidden'
    body.style.touchAction = 'none'
  } else {
    el.style.overflow = ''
    body.style.overflow = ''
    body.style.touchAction = ''
  }
}

import type {LyricCue} from './stage/LyricsOverlay'

type CuesByTrackId = Record<string, LyricCue[]>

export default function StageInline(props: {height?: number; cuesByTrackId?: CuesByTrackId}) {
  const {height = 300, cuesByTrackId} = props
  const p = usePlayer()

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    lockBodyScroll(open)
    return () => lockBodyScroll(false)
  }, [open])

    // Optional: try Fullscreen API when opening (best-effort only)
  const tryRequestFullscreen = React.useCallback(async () => {
    if (typeof document === 'undefined') return
    const el = document.getElementById('af-stage-overlay')
    if (!el) return

    // requestFullscreen lives on Element in modern DOM lib, but we keep it defensive.
    if (!('requestFullscreen' in el)) return

    const requestFullscreen = (el as Element).requestFullscreen
    if (typeof requestFullscreen !== 'function') return

    try {
      await requestFullscreen.call(el)
    } catch {
      // ignore; overlay is the baseline
    }
  }, [])


  const overlay =
    mounted && open
      ? createPortal(
          <div
            id="af-stage-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Stage"
            onMouseDown={(e) => {
              // click outside content closes
              if (e.target === e.currentTarget) setOpen(false)
            }}
            style={{
              position: 'fixed',
              inset: 0,
              width: '100vw',
              height: '100dvh',
              zIndex: 200000,
              background: 'rgba(0,0,0,0.80)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              padding: `calc(14px + env(safe-area-inset-top, 0px)) 14px calc(14px + env(safe-area-inset-bottom, 0px)) 14px`,
              display: 'grid',
              gridTemplateRows: 'auto 1fr',
              gap: 10,
            }}
          >
            <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12}}>
              <div style={{minWidth: 0}}>
                <div style={{fontSize: 12, opacity: 0.7}}>Stage</div>
                <div style={{fontSize: 14, fontWeight: 650, opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                  {p.current?.title ?? p.current?.id ?? 'Nothing playing'}
                </div>
              </div>

              <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                <button
                  type="button"
                  onClick={() => void tryRequestFullscreen()}
                  style={{
                    borderRadius: 12,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.92)',
                    padding: '10px 12px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  Fullscreen
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.14)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.92)',
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: '38px',
                  }}
                >
                  ×
                </button>
              </div>
            </div>

            <div style={{position: 'relative', minHeight: 0}}>
              <StageCore variant="fullscreen" cuesByTrackId={cuesByTrackId} />
            </div>
          </div>,
          document.body
        )
      : null

  return (
    <>
      {/* Inline card (always visible) */}
      <div
        style={{
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(255,255,255,0.05)',
          overflow: 'hidden',
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 12px 10px 12px'}}>
          <div style={{minWidth: 0}}>
            <div style={{fontSize: 12, opacity: 0.7}}>Stage</div>
            <div style={{fontSize: 13, fontWeight: 650, opacity: 0.92, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
              {p.current?.title ?? p.current?.id ?? 'Nothing playing'}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.92)',
              padding: '10px 12px',
              fontSize: 12,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            Open
          </button>
        </div>

        <div style={{height, position: 'relative'}}>
          <StageCore variant="inline" cuesByTrackId={cuesByTrackId} />
        </div>
      </div>

      {overlay}
    </>
  )
}
