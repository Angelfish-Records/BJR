// web/app/home/PortalTabs.tsx
'use client'

import React from 'react'
import {useClientSearchParams, replaceQuery} from './urlState'

export type PortalTabSpec = {
  id: string
  title: string
  locked?: boolean
  lockedHint?: string | null
  content: React.ReactNode
}

export default function PortalTabs(props: {
  tabs: PortalTabSpec[]
  defaultTabId?: string | null
  queryParam?: string // default: 'p' in new world
}) {
  const {tabs, defaultTabId = null, queryParam = 'p'} = props
  const sp = useClientSearchParams()

  const firstId = tabs[0]?.id ?? null
  const legacyPt = (sp.get('pt') ?? '').trim() || null
  const desiredRaw = (sp.get(queryParam) ?? '').trim()
  const desired = desiredRaw || null
  const isReservedSurface = queryParam === 'p' && desired === 'player'

  const validDesired =
    !isReservedSurface && desired && tabs.some((t) => t.id === desired) ? desired : null

  const validLegacy =
    legacyPt && tabs.some((t) => t.id === legacyPt) ? legacyPt : null

  const initial =
    validDesired ??
    validLegacy ??
    (defaultTabId && tabs.some((t) => t.id === defaultTabId) ? defaultTabId : null) ??
    firstId

  const [activeId, setActiveId] = React.useState<string | null>(initial)

  React.useEffect(() => {
    if (!initial) return
    if (activeId !== initial) setActiveId(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  React.useEffect(() => {
    if (!initial) return

    const curP = (sp.get(queryParam) ?? '').trim()
    const curPt = (sp.get('pt') ?? '').trim()

    if (curPt) {
      const ptCandidate = tabs.some((t) => t.id === curPt) ? curPt : ''
      if (ptCandidate) {
        if (!(queryParam === 'p' && curP === 'player')) {
          replaceQuery({[queryParam]: ptCandidate, pt: null, panel: null})
          return
        }
        replaceQuery({pt: null})
        return
      }
      replaceQuery({pt: null})
    }

    if (queryParam === 'p' && curP === 'player') return
    if (curP === initial) return
    replaceQuery({[queryParam]: initial, pt: null, panel: null})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null

  const wrap: React.CSSProperties = {display: 'grid', gap: 12, minWidth: 0}

  // ✅ refs to measure active tab + position indicator
  const rowRef = React.useRef<HTMLDivElement | null>(null)
  const btnRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map())

  const [indicator, setIndicator] = React.useState<{x: number; w: number} | null>(null)

  const measure = React.useCallback(() => {
    const row = rowRef.current
    const id = active?.id
    if (!row || !id) return
    const btn = btnRefs.current.get(id) ?? null
    if (!btn) return

    // offsetLeft/offsetWidth are perfect here because the indicator lives in the same scrolling box.
    setIndicator({x: btn.offsetLeft, w: btn.offsetWidth})
  }, [active?.id])

  React.useLayoutEffect(() => {
    measure()
  }, [measure, tabs.length])

  React.useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  const tabRow: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '2px 2px 10px', // 👈 room for the rail/indicator
    scrollbarWidth: 'none',
    minWidth: 0,
  }

  const tabBtn = (isActive: boolean): React.CSSProperties => ({
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    fontSize: 12,
    letterSpacing: 0.2,
    lineHeight: 1.2,
    color: isActive ? 'rgba(255,255,255,0.80)' : 'rgba(255,255,255,0.46)',
    textDecoration: 'none', // ✅ kill legacy underline
  })

  if (!tabs.length) return null

  return (
    <div style={wrap}>
      <style>{`
        .afPortalTabRow::-webkit-scrollbar { display: none; height: 0; }
      `}</style>

      <div
        ref={rowRef}
        className="afPortalTabRow"
        style={tabRow}
        onScroll={() => {
          // If a user scrolls the tab row, indicator remains aligned (same scroll context),
          // but this keeps it robust if fonts/layout shift during scroll.
          measure()
        }}
      >
        {/* ✅ Rail (continuous line under the tab row) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 2,
            height: 1,
            background: 'rgba(255,255,255,0.16)',
            pointerEvents: 'none',
          }}
        />

        {/* ✅ Active indicator (animated slide + width) */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: 2,
            height: 2,
            borderRadius: 999,
            background: 'rgba(255,255,255,0.90)',
            pointerEvents: 'none',
            transform: `translateX(${indicator?.x ?? 0}px)`,
            width: indicator?.w ?? 0,
            transition: 'transform 220ms ease, width 220ms ease',
            opacity: indicator ? 1 : 0,
          }}
        />

        {tabs.map((t) => {
          const isActive = t.id === active?.id
          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) btnRefs.current.set(t.id, el)
                else btnRefs.current.delete(t.id)
              }}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              aria-label={t.title}
              onClick={() => {
                setActiveId(t.id)
                replaceQuery({[queryParam]: t.id, pt: null, panel: null})
              }}
              style={tabBtn(isActive)}
              title={t.locked ? (t.lockedHint ?? 'Locked') : t.title}
            >
              {t.title}
              {t.locked ? <span aria-hidden style={{marginLeft: 6, opacity: 0.65}}>🔒</span> : null}
            </button>
          )
        })}
      </div>

      <div style={{minWidth: 0}}>{active?.content}</div>
    </div>
  )
}
