// web/app/home/player/ShareMenu.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'

function useAnchorPosition(open: boolean, anchorRef: React.RefObject<HTMLElement>) {
  const [pos, setPos] = React.useState<{x: number; y: number} | null>(null)

  React.useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    const el = anchorRef.current
    if (!el) return

    const compute = () => {
      const r = el.getBoundingClientRect()
      setPos({x: r.left + r.width / 2, y: r.bottom + 8})
    }

    compute()
    window.addEventListener('scroll', compute, true)
    window.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('scroll', compute, true)
      window.removeEventListener('resize', compute)
    }
  }, [open, anchorRef])

  return pos
}

export function ShareMenu(props: {
  open: boolean
  anchorRef: React.RefObject<HTMLElement>
  onClose: () => void
  items: Array<{label: string; onClick: () => void; disabled?: boolean}>
}) {
  const {open, anchorRef, onClose, items} = props
  const pos = useAnchorPosition(open, anchorRef)

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !pos) return null

  return createPortal(
    <>
      {/* click-catcher */}
      <div
        onMouseDown={(e) => {
          e.preventDefault()
          onClose()
        }}
        style={{position: 'fixed', inset: 0, zIndex: 100000}}
      />
      <div
        role="menu"
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          transform: 'translateX(-50%)',
          width: 220,
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(0,0,0,0.70)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          boxShadow: '0 18px 55px rgba(0,0,0,0.45)',
          padding: 6,
          zIndex: 100001,
        }}
      >
        {items.map((it) => (
          <button
            key={it.label}
            type="button"
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              if (it.disabled) return
              it.onClick()
              onClose()
            }}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '10px 10px',
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.00)',
              background: 'transparent',
              color: 'rgba(255,255,255,0.92)',
              cursor: it.disabled ? 'default' : 'pointer',
              opacity: it.disabled ? 0.45 : 0.92,
              fontSize: 12,
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.07)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </>,
    document.body
  )
}
