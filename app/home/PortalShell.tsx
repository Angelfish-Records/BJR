'use client'

import React from 'react'
import {useRouter, useSearchParams} from 'next/navigation'

export type PortalPanelSpec = {
  id: string
  label: string
  content: React.ReactNode
}

type DockRenderer = React.ReactNode | ((activePanelId: string) => React.ReactNode)

type Props = {
  panels: PortalPanelSpec[]
  defaultPanelId?: string
  dock?: DockRenderer
  /** If true, mirrors selected panel into ?panel= */
  syncToQueryParam?: boolean
  onPanelChange?: (panelId: string) => void
}

export default function PortalShell(props: Props) {
  const {panels, defaultPanelId, dock, syncToQueryParam = true, onPanelChange} = props

  const router = useRouter()
  const sp = useSearchParams()

  const panelFromQuery = sp.get('panel')
  const initial =
    (syncToQueryParam ? panelFromQuery : null) ??
    defaultPanelId ??
    panels[0]?.id ??
    'portal'

  const [active, setActive] = React.useState<string>(initial)

  // Keep local state in sync with back/forward (?panel= changes).
  React.useEffect(() => {
    if (!syncToQueryParam) return
    const q = sp.get('panel')
    if (q && q !== active) setActive(q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp, syncToQueryParam])

  // Notify parent whenever active changes (covers click, mount, and back/forward).
  React.useEffect(() => {
    onPanelChange?.(active)
  }, [active, onPanelChange])

  const setPanel = (id: string) => {
    setActive(id)
    if (!syncToQueryParam) return
    const params = new URLSearchParams(sp.toString())
    params.set('panel', id)
    router.replace(`?${params.toString()}`, {scroll: false})
  }

  const dockNode = typeof dock === 'function' ? dock(active) : dock

  return (
    <div style={{display: 'grid', gap: 14, minWidth: 0}}>
      <div
        style={{
          display: 'flex',
          gap: 10,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-start',
          padding: '2px 2px 10px',
        }}
      >
        {panels.map((p) => {
          const isActive = p.id === active
          return (
            <button
              key={p.id}
              onClick={() => setPanel(p.id)}
              type="button"
              style={{
                appearance: 'none',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: isActive
                  ? 'color-mix(in srgb, var(--accent) 18%, rgba(255,255,255,0.06))'
                  : 'rgba(255,255,255,0.04)',
                color: 'rgba(255,255,255,0.90)',
                padding: '8px 12px',
                fontSize: 13,
                cursor: 'pointer',
                opacity: isActive ? 0.98 : 0.78,
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>

      <div style={{display: 'grid', gap: 14, minWidth: 0}}>
        {panels.map((p) => (
          <div key={p.id} hidden={p.id !== active} style={{minWidth: 0}}>
            {p.content}
          </div>
        ))}
      </div>

      {dockNode ? (
        <div
          style={{
            position: 'sticky',
            bottom: 12,
            zIndex: 5,
            borderRadius: 18,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'rgba(0,0,0,0.35)',
            backdropFilter: 'blur(10px)',
            padding: 12,
          }}
        >
          {dockNode}
        </div>
      ) : null}
    </div>
  )
}
