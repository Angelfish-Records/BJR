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
  queryParam?: string // default: 'pt'
}) {
  const {tabs, defaultTabId = null, queryParam = 'pt'} = props
  const sp = useClientSearchParams()

  const firstId = tabs[0]?.id ?? null

  const desiredIdRaw = (sp.get(queryParam) ?? '').trim()
  const desiredId = desiredIdRaw || null

  const validId = desiredId && tabs.some((t) => t.id === desiredId) ? desiredId : null
  const initial = validId ?? (defaultTabId && tabs.some((t) => t.id === defaultTabId) ? defaultTabId : null) ?? firstId

  const [activeId, setActiveId] = React.useState<string | null>(initial)

  // Keep local state aligned with URL
  React.useEffect(() => {
    if (!initial) return
    if (activeId !== initial) setActiveId(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial])

  // Ensure URL has a valid pt once mounted (without Next navigation)
  React.useEffect(() => {
    if (!initial) return
    const cur = (sp.get(queryParam) ?? '').trim()
    if (cur === initial) return
    replaceQuery({[queryParam]: initial})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const active = tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null

  const wrap: React.CSSProperties = {
    display: 'grid',
    gap: 12,
    minWidth: 0,
  }

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

  const divider: React.CSSProperties = {
    height: 1,
    background: 'rgba(255,255,255,0.06)',
    marginTop: 2,
  }

  const content: React.CSSProperties = {
    minWidth: 0,
  }

  if (!tabs.length) return null

  return (
    <div style={wrap}>
      <div style={tabRow}>
        <style>{`
          /* hide scrollbar in webkit */
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
                  replaceQuery({[queryParam]: t.id})
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
      </div>

      <div style={divider} />

      <div style={content}>{active?.content}</div>
    </div>
  )
}
