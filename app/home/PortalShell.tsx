  // web/app/home/PortalShell.tsx
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

    const initialPanelRef = React.useRef<string | null>(null)

  if (initialPanelRef.current === null) {
    const fromQuery = syncToQueryParam ? sp.get('panel') : null
    initialPanelRef.current =
      fromQuery ?? defaultPanelId ?? panels[0]?.id ?? 'portal'
  }

  const [active, setActive] = React.useState<string>(initialPanelRef.current)

  const PANEL_ICONS: Record<string, React.ReactNode> = {
  portal: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
  player: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="9,7 19,12 9,17" />
    </svg>
  ),
}

    // Keep local state in sync with back/forward (?panel= changes).
    React.useEffect(() => {
      if (!syncToQueryParam) return
      const q = sp.get('panel')
      if (!q) return
      if (q === active) return
      if (!panels.some((p) => p.id === q)) return
      setActive(q)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sp, syncToQueryParam])

    // Notify parent whenever active changes (covers click, mount, and back/forward).
    React.useEffect(() => {
      onPanelChange?.(active)
    }, [active, onPanelChange])

    const setPanel = (id: string) => {
      if (!panels.some((p) => p.id === id)) return
      setActive(id)

      if (!syncToQueryParam) return
      const params = new URLSearchParams(sp.toString())
      params.set('panel', id)
      router.replace(`?${params.toString()}`, {scroll: false})
    }

    const dockNode = typeof dock === 'function' ? dock(active) : dock

    return (
  <div
    className="portalShell"
    style={{
      display: 'grid',
      gap: 14,
      minWidth: 0,

      // Key: let this component behave like a "frame"
      // so its own content scrolls instead of changing its outer height.
      height: '100%',
      minHeight: 0,

      // Key: split into (main) + (dock)
      gridTemplateRows: dockNode ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
      alignContent: 'start',
    }}
  >
    {/* Rail + Content */}
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '56px minmax(0, 1fr)',
        gap: 14,
        alignItems: 'start',
        minWidth: 0,

        // Key: allow children to shrink and enable inner scrolling
        minHeight: 0,
      }}
    >
      {/* Left rail */}
      <nav
        aria-label="Portal navigation"
        style={{
          position: 'sticky',
          top: 12,
          display: 'grid',
          gap: 10,
          justifyItems: 'center',
          paddingTop: 2,
          alignSelf: 'start',
        }}
      >
        {panels.map((p) => {
          const isActive = p.id === active
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPanel(p.id)}
              title={p.label}
              aria-current={isActive ? 'page' : undefined}
              style={{
                width: 46,
                height: 46,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.14)',
                background: isActive
                  ? 'color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.06))'
                  : 'rgba(255,255,255,0.04)',
                boxShadow: isActive
                  ? '0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent), 0 14px 30px rgba(0,0,0,0.22)'
                  : '0 12px 26px rgba(0,0,0,0.18)',
                color: 'rgba(255,255,255,0.90)',
                cursor: 'pointer',
                opacity: isActive ? 0.98 : 0.78,
                display: 'grid',
                placeItems: 'center',
                userSelect: 'none',
              }}
            >
              <span
                aria-hidden
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  color: 'rgba(255,255,255,0.92)',
                }}
              >
                {PANEL_ICONS[p.id] ?? p.label.slice(0, 1)}
              </span>
            </button>
          )
        })}
      </nav>

      {/* Panel content */}
      <div
        style={{
          display: 'grid',
          gap: 14,
          minWidth: 0,
          overflowX: 'hidden',

          // Key: this becomes the scroll container
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
        }}
      >
        {panels.map((p) => (
          <div key={p.id} hidden={p.id !== active} style={{minWidth: 0, overflowX: 'hidden'}}>
            {p.content}
          </div>
        ))}
      </div>
    </div>

    {/* Dock (unchanged) */}
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
