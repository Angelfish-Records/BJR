'use client'

import React from 'react'
import type {AlbumBrowseItem} from '@/lib/albums'

type Props = {
  albums: AlbumBrowseItem[]
}

type MintResp =
  | {ok: true; token: string; tokenId: string; kind: string; scopeId: string | null; expiresAt: string | null; maxRedemptions: number | null; createdAt: string}
  | {ok: false; error: string}

function fmtLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminMintShareTokenForm({albums}: Props) {
  const [albumId, setAlbumId] = React.useState<string>(() => (albums[0]?.catalogId ?? albums[0]?.id ?? ''))
  const [expiresEnabled, setExpiresEnabled] = React.useState(false)
  const [expiresAtLocal, setExpiresAtLocal] = React.useState<string>(() => fmtLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)))
  const [maxRedemptions, setMaxRedemptions] = React.useState<string>('')

  const [note, setNote] = React.useState<string>('')

  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<MintResp | null>(null)

  const selected = albums.find((a) => (a.catalogId ?? a.id) === albumId)
  const slug = selected?.slug ?? null

  const deepLink =
    result && result.ok
      ? (() => {
          const origin = typeof window !== 'undefined' ? window.location.origin : ''
          if (!origin) return null
          if (slug) return `${origin}/albums/${slug}?st=${encodeURIComponent(result.token)}`
          // fallback if no slug
          return `${origin}/home?st=${encodeURIComponent(result.token)}`
        })()
      : null

  async function onMint() {
    setBusy(true)
    setResult(null)
    try {
      const expiresAt = expiresEnabled ? new Date(expiresAtLocal).toISOString() : null
      const max = maxRedemptions.trim() ? Number(maxRedemptions.trim()) : null

      const resp = await fetch('/api/admin/share-tokens/mint', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          albumId,
          expiresAt,
          maxRedemptions: Number.isFinite(max as number) ? max : null,
          note: note.trim() || null,
        }),
      })

      const json = (await resp.json()) as MintResp
      setResult(json)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'error'
      setResult({ok: false, error: msg})
    } finally {
      setBusy(false)
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text)
  }

  return (
    <div style={{display: 'grid', gap: 12}}>
      <label style={{display: 'grid', gap: 6}}>
        <div style={{fontWeight: 600}}>Album</div>
        <select value={albumId} onChange={(e) => setAlbumId(e.target.value)} style={{padding: 10, borderRadius: 10}}>
          {albums.map((a) => {
            const id = (a.catalogId ?? a.id) as string
            return (
              <option key={id} value={id}>
                {a.title} {a.year ? `(${a.year})` : ''} — {a.slug}
              </option>
            )
          })}
        </select>
      </label>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
        <label style={{display: 'grid', gap: 6}}>
          <div style={{fontWeight: 600}}>Max redemptions (optional)</div>
          <input
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            placeholder="e.g. 25"
            inputMode="numeric"
            style={{padding: 10, borderRadius: 10}}
          />
        </label>

        <label style={{display: 'grid', gap: 6}}>
          <div style={{fontWeight: 600}}>Note (optional)</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. The Spinoff review" style={{padding: 10, borderRadius: 10}} />
        </label>
      </div>

      <label style={{display: 'flex', gap: 10, alignItems: 'center'}}>
        <input type="checkbox" checked={expiresEnabled} onChange={(e) => setExpiresEnabled(e.target.checked)} />
        <span style={{fontWeight: 600}}>Set expiry</span>
      </label>

      {expiresEnabled ? (
        <label style={{display: 'grid', gap: 6}}>
          <div style={{fontWeight: 600}}>Expires at (local time)</div>
          <input
            type="datetime-local"
            value={expiresAtLocal}
            onChange={(e) => setExpiresAtLocal(e.target.value)}
            style={{padding: 10, borderRadius: 10}}
          />
        </label>
      ) : null}

      <button
        type="button"
        onClick={onMint}
        disabled={busy || !albumId}
        style={{padding: '12px 14px', borderRadius: 12, fontWeight: 700}}
      >
        {busy ? 'Minting…' : 'Mint token'}
      </button>

      {result ? (
        <div style={{padding: 12, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12}}>
          {result.ok ? (
            <div style={{display: 'grid', gap: 10}}>
              <div>
                <div style={{fontWeight: 800, marginBottom: 6}}>Token (shown once)</div>
                <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                  <code style={{padding: '6px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)'}}>{result.token}</code>
                  <button type="button" onClick={() => copy(result.token)} style={{padding: '6px 10px', borderRadius: 10}}>
                    Copy token
                  </button>
                </div>
              </div>

              {deepLink ? (
                <div>
                  <div style={{fontWeight: 800, marginBottom: 6}}>Deep link</div>
                  <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                    <code style={{padding: '6px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)'}}>{deepLink}</code>
                    <button type="button" onClick={() => copy(deepLink)} style={{padding: '6px 10px', borderRadius: 10}}>
                      Copy link
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{opacity: 0.8, fontSize: 13}}>
                tokenId: <code>{result.tokenId}</code> • scopeId: <code>{result.scopeId}</code> • expiresAt:{' '}
                <code>{String(result.expiresAt ?? 'null')}</code> • maxRedemptions: <code>{String(result.maxRedemptions ?? 'null')}</code>
              </div>
            </div>
          ) : (
            <div>
              <div style={{fontWeight: 800}}>Error</div>
              <code>{result.error}</code>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
