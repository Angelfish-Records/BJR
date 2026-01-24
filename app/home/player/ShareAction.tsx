// web/app/home/player/ShareAction.tsx
'use client'

import React from 'react'
import {
  buildShareTarget,
  getShareIntents,
  performShare,
  type ShareIntent,
  type ShareTarget,
} from '@/lib/share'

function CopyFallbackModal(props: {url: string; onClose: () => void}) {
  const ref = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.select()
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={props.onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        zIndex: 9999,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(520px, 100%)',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(20,20,20,0.92)',
          padding: 14,
        }}
      >
        <div style={{fontSize: 13, opacity: 0.9, marginBottom: 10}}>Copy link</div>
        <input
          ref={ref}
          readOnly
          value={props.url}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.16)',
            background: 'rgba(255,255,255,0.06)',
            color: 'white',
            fontSize: 12,
          }}
        />
        <div style={{display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12}}>
          <button
            onClick={props.onClose}
            style={{
              borderRadius: 12,
              padding: '8px 12px',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'transparent',
              color: 'white',
              fontSize: 12,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function IntentSheet(props: {
  target: ShareTarget
  onClose: () => void
  onCopy: () => void
  onNative: () => void
}) {
  const intents = React.useMemo(() => getShareIntents(props.target), [props.target])

  const tryOpenIntent = React.useCallback(
    async (it: ShareIntent) => {
      // Best-effort attempt to open app.
      // If nothing happens (no visibility change), fall back to native share/copy.
      let hidden = false
      const onVis = () => {
        if (document.hidden) hidden = true
      }
      document.addEventListener('visibilitychange', onVis, {passive: true})

      try {
        // Use location assign; window.open often blocked.
        window.location.href = it.href
      } catch {
        // ignore
      }

      await new Promise((r) => setTimeout(r, 700))
      document.removeEventListener('visibilitychange', onVis)

      if (!hidden) {
        // App didn’t open; try native share (then copy fallback inside that flow).
        props.onNative()
      } else {
        // If app opened, close sheet; user will come back when done.
        props.onClose()
      }
    },
    [props]
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        e.preventDefault()
        props.onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          borderRadius: 18,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(20,20,20,0.92)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          padding: 10,
          boxShadow: '0 18px 55px rgba(0,0,0,0.45)',
        }}
      >
        <div style={{padding: '8px 10px', fontSize: 12, opacity: 0.85}}>Share</div>

        <div style={{display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8, padding: 10}}>
          {intents.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => void tryOpenIntent(it)}
              style={{
                borderRadius: 14,
                padding: '10px 12px',
                border: '1px solid rgba(255,255,255,0.14)',
                background: 'rgba(255,255,255,0.06)',
                color: 'white',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{fontSize: 12, opacity: 0.92}}>{it.label}</div>
              {it.note ? <div style={{fontSize: 11, opacity: 0.55, marginTop: 2}}>{it.note}</div> : null}
            </button>
          ))}
        </div>

        <div style={{display: 'flex', gap: 8, padding: 10}}>
          <button
            type="button"
            onClick={props.onNative}
            style={{
              flex: 1,
              borderRadius: 14,
              padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'rgba(255,255,255,0.10)',
              color: 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            More…
          </button>
          <button
            type="button"
            onClick={props.onCopy}
            style={{
              flex: 1,
              borderRadius: 14,
              padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.14)',
              background: 'transparent',
              color: 'white',
              cursor: 'pointer',
              fontSize: 12,
            }}
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  )
}

export function useShareAction() {
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null)
  const [sheetTarget, setSheetTarget] = React.useState<ShareTarget | null>(null)

  const share = React.useCallback(async (target: ShareTarget) => {
    const res = await performShare(target)
    if (!res.ok && res.reason === 'clipboard_unavailable') setFallbackUrl(res.url)
    return res
  }, [])

  const openIntentSheet = React.useCallback((target: ShareTarget) => {
    setSheetTarget(target)
  }, [])

  const closeIntentSheet = React.useCallback(() => setSheetTarget(null), [])

  const doCopy = React.useCallback(async () => {
    const t = sheetTarget
    if (!t) return
    closeIntentSheet()
    const res = await performShare({...t, url: t.url} as ShareTarget) // performShare already falls back to copy
    if (!res.ok && res.reason === 'clipboard_unavailable') setFallbackUrl(res.url)
  }, [sheetTarget, closeIntentSheet])

  const doNative = React.useCallback(async () => {
    const t = sheetTarget
    if (!t) return
    // Keep sheet open until native share succeeds/cancels; but closing first avoids weird stacking.
    closeIntentSheet()
    const res = await performShare(t)
    if (!res.ok && res.reason === 'clipboard_unavailable') setFallbackUrl(res.url)
  }, [sheetTarget, closeIntentSheet])

  const fallbackModal = fallbackUrl ? <CopyFallbackModal url={fallbackUrl} onClose={() => setFallbackUrl(null)} /> : null
  const intentSheet = sheetTarget ? (
    <IntentSheet target={sheetTarget} onClose={closeIntentSheet} onCopy={() => void doCopy()} onNative={() => void doNative()} />
  ) : null

  return {share, openIntentSheet, intentSheet, fallbackModal}
}

// Convenience builder for UI callers (album/track/post)
export function useShareBuilders() {
  return React.useMemo(() => {
    return {
      album: (album: {slug: string; title: string; artistName?: string; id?: string}) =>
        buildShareTarget({type: 'album', methodHint: 'native', album}),
      track: (album: {slug: string; title: string; artistName?: string; id?: string}, track: {id: string; title: string}) =>
        buildShareTarget({type: 'track', methodHint: 'native', album, track}),
      post: (post: {slug: string; title?: string; id?: string}, authorName?: string) =>
        buildShareTarget({type: 'post', methodHint: 'native', post, authorName}),
    }
  }, [])
}
