'use client'

import React from 'react'
import type {AlbumBrowseItem} from '@/lib/albums'

type Props = {albums: AlbumBrowseItem[]}

type MintOk = {
  ok: true
  token: string
  tokenId: string
}

type MintErr = {ok: false; error: string}

type MintResp = MintOk | MintErr

function fmtLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function AdminMintShareTokenForm({albums}: Props) {
  const mintable = React.useMemo(() => albums.filter((a) => !!a.catalogId), [albums])
  const hasUnmintable = React.useMemo(() => albums.some((a) => !a.catalogId), [albums])

  const [albumCatalogId, setAlbumCatalogId] = React.useState<string>(() => (mintable[0]?.catalogId ?? '') as string)

  const [expiresEnabled, setExpiresEnabled] = React.useState(false)
  const [expiresAtLocal, setExpiresAtLocal] = React.useState<string>(() =>
    fmtLocalInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  )

  const [maxRedemptions, setMaxRedemptions] = React.useState<string>('')
  const [note, setNote] = React.useState<string>('')

  const [busy, setBusy] = React.useState(false)
  const [result, setResult] = React.useState<MintResp | null>(null)

  const selected = React.useMemo(
    () => mintable.find((a) => (a.catalogId as string) === albumCatalogId) ?? null,
    [mintable, albumCatalogId]
  )

  const deepLink = React.useMemo(() => {
    if (!result?.ok) return null
    if (typeof window === 'undefined') return null
    const slug = selected?.slug
    if (!slug) return null
    const u = new URL(`/albums/${encodeURIComponent(slug)}`, window.location.origin)
    u.searchParams.set('st', result.token)
    return u.toString()
  }, [result, selected?.slug])

  async function onMint() {
    setBusy(true)
    setResult(null)

    try {
      if (!albumCatalogId) {
        setResult({ok: false, error: 'No catalogId selected (album must have catalogId).'})
        return
      }

      const expiresAt = expiresEnabled ? new Date(expiresAtLocal).toISOString() : null

      const rawMax = maxRedemptions.trim()
      const n = rawMax ? Number(rawMax) : null
      const max =
        n != null && Number.isFinite(n) && n > 0 ? Math.floor(n) : null

      const resp = await fetch('/api/admin/share-tokens/mint', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          albumId: albumCatalogId, // ✅ ALWAYS catalogId
          expiresAt,
          maxRedemptions: max,
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

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // ignore
    }
  }

  if (!mintable.length) {
    return (
      <div style={{padding: 12, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12}}>
        <div style={{fontWeight: 800, marginBottom: 6}}>No mintable albums</div>
        <div style={{opacity: 0.85}}>
          No albums have <code>catalogId</code> set. Add a <code>catalogId</code> in Sanity before minting press tokens.
        </div>
      </div>
    )
  }

  return (
    <div style={{display: 'grid', gap: 12}}>
      <label style={{display: 'grid', gap: 6}}>
        <div style={{fontWeight: 700}}>Album</div>
        <select
          value={albumCatalogId}
          onChange={(e) => setAlbumCatalogId(e.target.value)}
          style={{padding: 10, borderRadius: 10}}
        >
          {mintable.map((a) => (
            <option key={a.catalogId as string} value={a.catalogId as string}>
              {a.title} {a.year ? `(${a.year})` : ''} — {a.slug}
            </option>
          ))}
        </select>

        {hasUnmintable ? (
          <div style={{opacity: 0.75, fontSize: 13}}>
            Some albums are hidden because they have no <code>catalogId</code> (we avoid minting broken-scope tokens).
          </div>
        ) : null}
      </label>

      <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
        <label style={{display: 'grid', gap: 6}}>
          <div style={{fontWeight: 700}}>Max redemptions (optional)</div>
          <input
            value={maxRedemptions}
            onChange={(e) => setMaxRedemptions(e.target.value)}
            placeholder="e.g. 25"
            inputMode="numeric"
            style={{padding: 10, borderRadius: 10}}
          />
        </label>

        <label style={{display: 'grid', gap: 6}}>
          <div style={{fontWeight: 700}}>Note (optional)</div>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. RNZ review"
            style={{padding: 10, borderRadius: 10}}
          />
        </label>
      </div>

      <label style={{display: 'flex', gap: 10, alignItems: 'center'}}>
        <input type="checkbox" checked={expiresEnabled} onChange={(e) => setExpiresEnabled(e.target.checked)} />
        <span style={{fontWeight: 700}}>Set expiry</span>
      </label>

      {expiresEnabled ? (
        <label style={{display: 'grid', gap: 6}}>
          <div style={{fontWeight: 700}}>Expires at (local time)</div>
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
        disabled={busy || !albumCatalogId}
        style={{padding: '12px 14px', borderRadius: 12, fontWeight: 800}}
      >
        {busy ? 'Minting…' : 'Mint token'}
      </button>

      {result ? (
        <div style={{padding: 12, border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12}}>
          {result.ok ? (
            <div style={{display: 'grid', gap: 10}}>
              <div>
                <div style={{fontWeight: 800, marginBottom: 6}}>Token</div>
                <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                  <code style={{padding: '6px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)'}}>
                    {result.token}
                  </code>
                  <button type="button" onClick={() => copy(result.token)} style={{padding: '6px 10px', borderRadius: 10}}>
                    Copy token
                  </button>
                </div>
              </div>

              {deepLink ? (
                <div>
                  <div style={{fontWeight: 800, marginBottom: 6}}>Deep link</div>
                  <div style={{display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap'}}>
                    <code style={{padding: '6px 8px', borderRadius: 10, background: 'rgba(255,255,255,0.06)'}}>
                      {deepLink}
                    </code>
                    <button type="button" onClick={() => copy(deepLink)} style={{padding: '6px 10px', borderRadius: 10}}>
                      Copy link
                    </button>
                  </div>
                </div>
              ) : null}

              <div style={{opacity: 0.8, fontSize: 13}}>
                catalogId: <code>{albumCatalogId}</code> • tokenId: <code>{result.tokenId}</code>
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
