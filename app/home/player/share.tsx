// web/app/home/player/share.tsx
'use client'

import React from 'react'
import {buildShareTarget, performShare, type ShareTarget, type ShareMethod} from '@/lib/share'

type CopyResult =
  | {ok: true}
  | {ok: false; reason: 'clipboard_unavailable' | 'failed'}

export function extractAlbumSlugFromPath(pathname: string): string | null {
  // expects /albums/:slug
  const m = pathname.match(/^\/albums\/([^/]+)/)
  if (!m) return null
  const raw = m[1] ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function getLocationParts(): {origin: string; pathname: string; href: string} | null {
  if (typeof window === 'undefined') return null
  return {origin: window.location.origin, pathname: window.location.pathname, href: window.location.href}
}

export async function copyText(text: string): Promise<CopyResult> {
  try {
    if (typeof navigator === 'undefined') return {ok: false, reason: 'clipboard_unavailable'}
    if (!navigator.clipboard?.writeText) return {ok: false, reason: 'clipboard_unavailable'}
    await navigator.clipboard.writeText(text)
    return {ok: true}
  } catch {
    return {ok: false, reason: 'failed'}
  }
}

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
        zIndex: 100000,
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
            type="button"
            onClick={props.onClose}
            style={{
              borderRadius: 12,
              padding: '8px 12px',
              border: '1px solid rgba(255,255,255,0.16)',
              background: 'transparent',
              color: 'white',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function useShareUX() {
  const [fallbackUrl, setFallbackUrl] = React.useState<string | null>(null)

  const shareTarget = React.useCallback(async (target: ShareTarget) => {
    const res = await performShare(target)
    if (!res.ok && res.reason === 'clipboard_unavailable') setFallbackUrl(res.url)
    return res
  }, [])

  const copyUrl = React.useCallback(async (url: string) => {
    const res = await copyText(url)
    if (!res.ok && res.reason === 'clipboard_unavailable') setFallbackUrl(url)
    return res
  }, [])

  const fallbackModal = fallbackUrl ? (
    <CopyFallbackModal url={fallbackUrl} onClose={() => setFallbackUrl(null)} />
  ) : null

  return {shareTarget, copyUrl, fallbackModal}
}

export function buildAlbumShareFromContext(params: {
  albumSlug: string
  albumTitle: string
  artistName?: string
  albumId?: string
  methodHint?: ShareMethod
  origin?: string
}) {
  return buildShareTarget({
    type: 'album',
    methodHint: params.methodHint ?? 'native',
    origin: params.origin,
    album: {
      slug: params.albumSlug,
      title: params.albumTitle,
      artistName: params.artistName,
      id: params.albumId,
    },
  })
}

export function buildTrackShareFromContext(params: {
  albumSlug: string
  albumTitle: string
  artistName?: string
  albumId?: string
  trackId: string
  trackTitle: string
  methodHint?: ShareMethod
  origin?: string
}) {
  return buildShareTarget({
    type: 'track',
    methodHint: params.methodHint ?? 'native',
    origin: params.origin,
    album: {
      slug: params.albumSlug,
      title: params.albumTitle,
      artistName: params.artistName,
      id: params.albumId,
    },
    track: {
      id: params.trackId,
      title: params.trackTitle,
    },
  })
}

export function bestEffortAlbumSlug(): {origin: string; slug: string | null; href: string} | null {
  const loc = getLocationParts()
  if (!loc) return null
  return {origin: loc.origin, slug: extractAlbumSlugFromPath(loc.pathname), href: loc.href}
}
