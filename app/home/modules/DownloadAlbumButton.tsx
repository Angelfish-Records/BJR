// web/app/home/modules/DownloadAlbumButton.tsx
'use client'

import React from 'react'

type Props = {
  albumSlug: string
  assetId?: string // default: bundle_zip
  label?: string
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
}

type DownloadResponse =
  | {
      ok: true
      url: string
      albumSlug: string
      asset: {id: string; label: string; filename: string}
    }
  | {ok: false; error?: string}

export default function DownloadAlbumButton(props: Props) {
  const {
    albumSlug,
    assetId = 'bundle_zip',
    label = 'Download',
    disabled,
    className,
    style,
  } = props

  const [busy, setBusy] = React.useState(false)
  const [err, setErr] = React.useState<string | null>(null)

  const onClick = async () => {
    if (busy || disabled) return
    setBusy(true)
    setErr(null)

    try {
      const res = await fetch('/api/downloads/album', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({albumSlug, assetId}),
      })

      const data = (await res.json().catch(() => null)) as DownloadResponse | null

      if (!res.ok || !data || data.ok !== true || !('url' in data) || !data.url) {
        const msg =
          data && data.ok === false && data.error ? data.error : 'Could not start download.'
        setErr(msg)
        return
      }

      // Use assign so it behaves like a direct download nav.
      window.location.assign(data.url)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Network error.'
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={className} style={style}>
      <button
        type="button"
        onClick={onClick}
        disabled={busy || disabled}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.04)',
          padding: '8px 12px',
          fontSize: 13,
          cursor: busy || disabled ? 'not-allowed' : 'pointer',
          opacity: busy || disabled ? 0.55 : 0.9,
        }}
      >
        {busy ? 'Preparing download…' : label}
      </button>

      {err ? (
        <div style={{marginTop: 10, fontSize: 12, opacity: 0.75, lineHeight: 1.45}}>
          {err}
        </div>
      ) : null}
    </div>
  )
}
