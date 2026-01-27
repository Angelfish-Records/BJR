// web/app/home/urlState.ts
'use client'

import * as React from 'react'

const QS_EVENT = 'af:qs-change'

function safeGetSearch(): string {
  if (typeof window === 'undefined') return ''
  return window.location.search || ''
}

export function useClientSearchParams(): URLSearchParams {
  const [qs, setQs] = React.useState<string>(() => safeGetSearch())

  React.useEffect(() => {
    const onPop = () => setQs(safeGetSearch())
    const onCustom = () => setQs(safeGetSearch())

    window.addEventListener('popstate', onPop)
    window.addEventListener(QS_EVENT, onCustom as EventListener)
    return () => {
      window.removeEventListener('popstate', onPop)
      window.removeEventListener(QS_EVENT, onCustom as EventListener)
    }
  }, [])

  return React.useMemo(() => new URLSearchParams((qs || '').replace(/^\?/, '')), [qs])
}

export function getAutoplayFlag(sp: URLSearchParams): boolean {
  const v = (sp.get('autoplay') ?? '').trim().toLowerCase()
  return v === '1' || v === 'true' || v === 'yes'
}

/**
 * Patch semantics:
 * - null/undefined/'' => delete
 * - otherwise => set
 * Preserves all other existing keys.
 */
export function replaceQuery(patch: Record<string, string | null | undefined>) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  const params = new URLSearchParams(url.search)

  for (const [k, v] of Object.entries(patch)) {
    const sv = v == null ? '' : String(v)
    if (v == null || sv.trim() === '') params.delete(k)
    else params.set(k, sv)
  }

  const next = params.toString()
  const cur = url.searchParams.toString()
  if (next === cur) return

  url.search = next ? `?${next}` : ''
  window.history.replaceState({}, '', url.toString())
  window.dispatchEvent(new Event(QS_EVENT))
}

/**
 * Convenience: read a query param once, then clear it.
 * Safe even if called repeatedly (it only clears once).
 */
export function useReadOnceParam(key: string): string | null {
  const sp = useClientSearchParams()
  const v = (sp.get(key) ?? '').trim() || null
  const shownRef = React.useRef(false)

  React.useEffect(() => {
    if (!v) return
    if (shownRef.current) return
    shownRef.current = true
    replaceQuery({[key]: null})
  }, [v, key])

  return v
}
