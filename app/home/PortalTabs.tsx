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

  // legacy support: pt used to control tabs
  const legacyPt = (sp.get('pt') ?? '').trim() || null

  const desiredRaw = (sp.get(queryParam) ?? '').trim()
  const desired = desiredRaw || null

  // IMPORTANT: when queryParam is 'p', 'player' is reserved for the player surface
  // and should NOT be interpreted as a portal tab.
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

  // Keep local state aligned with URL
  React.useEffect(() => {
    if (!initial) return
    if (activeId !== initial) setActiveId(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  // On mount: migrate legacy pt -> p, and ensure URL is canonical when we are in portal context.
  React.useEffect(() => {
    if (!initial) return

    const curP = (sp.get(queryParam) ?? '').trim()
    const curPt = (sp.get('pt') ?? '').trim()

    // If we see legacy pt, migrate it (and delete pt).
    // Only do this if p is either missing/invalid or clearly portal-ish (not player).
    if (curPt) {
      const ptCandidate = tabs.some((t) => t.id === curPt) ? curPt : ''
      if (ptCandidate) {
        // Don't stomp p=player; that's the player surface.
        if (!(queryParam === 'p' && curP === 'player')) {
          replaceQuery({[queryParam]: ptCandidate, pt: null, panel: null})
          return
        }
        // If we are on player, just delete pt to stop pollution.
        replaceQuery({pt: null})
        return
      }

      // pt exists but isn't valid; just delete it.
      replaceQuery({pt: null})
      // keep going; we may still want to ensure p
    }

    // Ensure p has a valid tab id *unless* p=player (reserved).
    if (queryParam === 'p' && curP === 'player') return

    if (curP === initial) return
    replaceQuery({[queryParam]: initial, pt: null, panel: null})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null

  const wrap: React.CSSProperties = {display: 'grid', gap: 12, minWidth: 0}

  const tabRow: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    flexWrap: 'nowrap',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    padding: '2px 2px 8px',
    scrollbarWidth: 'none',
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
    color: isActive ? 'rgba(255,255,255,0.78)' : 'rgba(255,255,255,0.46)',
    textDecoration: isActive ? 'underline' : 'none',
    textUnderlineOffset: 6,
  })

  if (!tabs.length) return null

  return (
    <div style={wrap}>
      <style>{`
        .afPortalTabRow::-webkit-scrollbar { display: none; height: 0; }
      `}</style>

      <div className="afPortalTabRow" style={tabRow}>
        {tabs.map((t) => {
          const isActive = t.id === active?.id
          return (
            <button
              key={t.id}
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
