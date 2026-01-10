// web/app/home/PortalShell.tsx
'use client'

import React from 'react'
import {createPortal} from 'react-dom'
import {useRouter, useSearchParams} from 'next/navigation'

export type PortalPanelSpec = {
  id: string
  label: string
  content: React.ReactNode
}

type HeaderCtx = {
  activePanelId: string
  setPanel: (id: string) => void
  panels: PortalPanelSpec[]
}

type HeaderRenderer = React.ReactNode | ((ctx: HeaderCtx) => React.ReactNode)

type Props = {
  panels: PortalPanelSpec[]
  defaultPanelId?: string
  /** If true, mirrors selected panel into ?panel= */
  syncToQueryParam?: boolean
  onPanelChange?: (panelId: string) => void

  /**
   * Optional controlled mode:
   * if provided, PortalShell will render this as the active panel
   * and will not own its own active state.
   */
  activePanelId?: string

  /** Optional header row UI. */
  header?: HeaderRenderer

  /**
   * Optional DOM id to portal header into (lets header span main+sidebar layout).
   * If not found, header renders inline at top of PortalShell.
   */
  headerPortalId?: string
}

export default function PortalShell(props: Props) {
  const {
    panels,
    defaultPanelId,
    syncToQueryParam = true,
    onPanelChange,
    activePanelId: controlledActive,
    header,
    headerPortalId = 'af-portal-topbar-slot',
  } = props

  const router = useRouter()
  const sp = useSearchParams()

  const panelIds = React.useMemo(() => new Set(panels.map((p) => p.id)), [panels])

  const isControlled = typeof controlledActive === 'string' && controlledActive.length > 0

  const [uncontrolledActive, setUncontrolledActive] = React.useState<string>(() => {
    const fromQuery = syncToQueryParam ? sp.get('panel') : null
    const initial = fromQuery ?? defaultPanelId ?? panels[0]?.id ?? 'portal'
    return panelIds.has(initial) ? initial : (panels[0]?.id ?? 'portal')
  })

  const active = isControlled ? (controlledActive as string) : uncontrolledActive

  // Ensure we never sit on an invalid panel if panels change.
  React.useEffect(() => {
    if (panelIds.has(active)) return
    const fallback = defaultPanelId && panelIds.has(defaultPanelId) ? defaultPanelId : panels[0]?.id
    if (!fallback) return
    if (!isControlled) setUncontrolledActive(fallback)
    onPanelChange?.(fallback)
    // In controlled mode, parent must respond.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelIds, panels, defaultPanelId])

  const setPanel = React.useCallback(
    (id: string) => {
      if (!panelIds.has(id)) return

      if (isControlled) {
        // Controlled: parent owns state; URL mirroring handled by effect below.
        onPanelChange?.(id)
        return
      }

      setUncontrolledActive(id)
      onPanelChange?.(id)

      if (!syncToQueryParam) return
      const params = new URLSearchParams(sp.toString())
      params.set('panel', id)
      router.replace(`?${params.toString()}`, {scroll: false})
    },
    [isControlled, onPanelChange, panelIds, router, sp, syncToQueryParam]
  )

  // Uncontrolled: respond to back/forward (?panel= changes) without creating loops.
  React.useEffect(() => {
    if (!syncToQueryParam) return
    if (isControlled) return

    const q = sp.get('panel')
    if (!q) return
    if (!panelIds.has(q)) return
    if (q === active) return

    setUncontrolledActive(q)
    onPanelChange?.(q)
  }, [active, isControlled, onPanelChange, panelIds, sp, syncToQueryParam])

  // Controlled: mirror active into URL (single direction).
  React.useEffect(() => {
    if (!syncToQueryParam) return
    if (!isControlled) return

    const current = sp.get('panel')
    if (current === active) return

    const params = new URLSearchParams(sp.toString())
    params.set('panel', active)
    router.replace(`?${params.toString()}`, {scroll: false})
  }, [active, isControlled, router, sp, syncToQueryParam])

  // Header node (rendered inline or portaled)
  const headerNode =
    typeof header === 'function'
      ? header({activePanelId: active, setPanel, panels})
      : header ?? null

  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const headerPortalEl =
    mounted && headerPortalId ? document.getElementById(headerPortalId) : null

  const DOCK_H = 84 // mini player padding space

  return (
    <div
      className="portalShell"
      style={{
        display: 'grid',
        gap: 14,
        minWidth: 0,
        alignContent: 'start',
        paddingBottom: `calc(${DOCK_H}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {/* If we can portal into the grid-wide slot, do that. Otherwise render inline. */}
      {headerNode
        ? headerPortalEl
          ? createPortal(headerNode, headerPortalEl)
          : headerNode
        : null}

      <div style={{display: 'grid', minWidth: 0}}>
        {panels.map((p) => (
          <div key={p.id} hidden={p.id !== active} style={{minWidth: 0}}>
            {p.content}
          </div>
        ))}
      </div>
    </div>
  )
}
