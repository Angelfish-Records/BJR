// web/app/admin/share-tokens/AdminEntitlementsPanel.tsx
'use client'

import React from 'react'

type MemberRow = {id: string; email: string; clerk_user_id: string | null; created_at: string}
type GrantRow = {
  id: string
  entitlement_key: string
  scope_id: string | null
  scope_meta: unknown
  expires_at: string | null
  revoked_at: string | null
  created_at: string
  granted_by: string | null
  grant_reason: string | null
  grant_source: string | null
}

type AlbumForScope = {id: string; slug: string; title: string}

export default function AdminEntitlementsPanel(props: {albums: AlbumForScope[]}) {
  const {albums} = props

  const [q, setQ] = React.useState('')
  const [members, setMembers] = React.useState<MemberRow[]>([])
  const [selected, setSelected] = React.useState<MemberRow | null>(null)

  const [grants, setGrants] = React.useState<GrantRow[]>([])
  const [current, setCurrent] = React.useState<Array<{entitlement_key: string; scope_id: string | null}>>([])

  const [key, setKey] = React.useState('')
  const [scopeId, setScopeId] = React.useState<string>('')
  const [reason, setReason] = React.useState('admin_ui')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function runSearch() {
    setError(null)
    const res = await fetch(`/api/admin/members/search?q=${encodeURIComponent(q.trim())}`)
    const json = await res.json()
    if (!res.ok || !json?.ok) {
      setError(json?.error ?? 'Search failed')
      return
    }
    setMembers(Array.isArray(json.members) ? json.members : [])
  }

  async function loadMember(memberId: string) {
    setError(null)
    const res = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}/entitlements`)
    const json = await res.json()
    if (!res.ok || !json?.ok) {
      setError(json?.error ?? 'Load failed')
      return
    }
    setGrants(Array.isArray(json.grants) ? json.grants : [])
    setCurrent(Array.isArray(json.current) ? json.current : [])
  }

  async function grant() {
    if (!selected) return
    if (!key.trim()) return

    setBusy('grant')
    setError(null)
    try {
      const res = await fetch('/api/admin/entitlements/grant', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          memberId: selected.id,
          key: key.trim(),
          scopeId: scopeId.trim() || null,
          reason: reason.trim() || 'admin_ui',
        }),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'Grant failed')
      await loadMember(selected.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grant failed')
    } finally {
      setBusy(null)
    }
  }

  async function revoke(grantId: string) {
    if (!selected) return
    setBusy(`revoke:${grantId}`)
    setError(null)
    try {
      const res = await fetch('/api/admin/entitlements/revoke', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({grantId, reason: reason.trim() || 'admin_ui'}),
      })
      const json = await res.json()
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? 'Revoke failed')
      await loadMember(selected.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revoke failed')
    } finally {
      setBusy(null)
    }
  }

  const albumScopeButtons = (
    <div style={{display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8}}>
      <button
        type="button"
        onClick={() => setScopeId('catalog')}
        style={{padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)'}}
      >
        scope: catalog
      </button>
      {albums.slice(0, 6).map((a) => (
        <button
          key={a.slug}
          type="button"
          onClick={() => setScopeId(`alb:${a.id}`)}
          style={{padding: '8px 10px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.9)'}}
          title={a.title}
        >
          alb:{a.id}
        </button>
      ))}
    </div>
  )

  return (
    <div style={{display: 'grid', gap: 14}}>
      <div style={{display: 'grid', gap: 10}}>
        <div style={{display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center'}}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search member email prefix…"
            style={{flex: '1 1 320px', padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.22)', color: 'rgba(255,255,255,0.92)'}}
          />
          <button
            type="button"
            onClick={runSearch}
            style={{padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.92)'}}
          >
            Search
          </button>
        </div>

        {members.length > 0 && (
          <div style={{display: 'grid', gap: 8}}>
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={async () => {
                  setSelected(m)
                  await loadMember(m.id)
                }}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(255,255,255,0.14)',
                  background: selected?.id === m.id ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
                  color: 'rgba(255,255,255,0.92)',
                }}
              >
                <div style={{fontSize: 13, opacity: 0.95}}>{m.email}</div>
                <div style={{fontSize: 12, opacity: 0.65}}>member_id: {m.id}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div style={{padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.22)', color: '#ffb4b4'}}>
          {error}
        </div>
      )}

      {selected && (
        <div style={{display: 'grid', gap: 12}}>
          <div style={{padding: 12, borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)'}}>
            <div style={{fontSize: 13, opacity: 0.95}}>Selected: {selected.email}</div>

            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10}}>
              <div style={{display: 'grid', gap: 8}}>
                <div style={{fontSize: 12, opacity: 0.7}}>Grant entitlement</div>
                <input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="entitlement_key (e.g. tier_patron, play_album)"
                  style={{padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.22)', color: 'rgba(255,255,255,0.92)'}}
                />
                <input
                  value={scopeId}
                  onChange={(e) => setScopeId(e.target.value)}
                  placeholder="scope_id (optional): catalog OR alb:<albumId>"
                  style={{padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.22)', color: 'rgba(255,255,255,0.92)'}}
                />
                {albumScopeButtons}
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="reason"
                  style={{padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(0,0,0,0.22)', color: 'rgba(255,255,255,0.92)'}}
                />
                <button
                  type="button"
                  onClick={grant}
                  disabled={busy === 'grant'}
                  style={{padding: '10px 12px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.92)', opacity: busy === 'grant' ? 0.6 : 1}}
                >
                  Grant
                </button>
              </div>

              <div style={{display: 'grid', gap: 8}}>
                <div style={{fontSize: 12, opacity: 0.7}}>Effective entitlements (derived)</div>
                <div style={{display: 'grid', gap: 6}}>
                  {current.map((c, i) => (
                    <div key={i} style={{fontSize: 12, opacity: 0.9}}>
                      <span style={{opacity: 0.85}}>{c.entitlement_key}</span>
                      {c.scope_id ? <span style={{opacity: 0.6}}> — {c.scope_id}</span> : null}
                    </div>
                  ))}
                  {!current.length ? <div style={{fontSize: 12, opacity: 0.6}}>None.</div> : null}
                </div>
              </div>
            </div>
          </div>

          <div style={{padding: 12, borderRadius: 14, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.04)'}}>
            <div style={{fontSize: 12, opacity: 0.7, marginBottom: 8}}>Grants (raw history)</div>
            <div style={{display: 'grid', gap: 8}}>
              {grants.map((g) => {
                const active = !g.revoked_at && (!g.expires_at || new Date(g.expires_at).getTime() > Date.now())
                return (
                  <div key={g.id} style={{display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between'}}>
                    <div style={{minWidth: 0}}>
                      <div style={{fontSize: 12, opacity: 0.92}}>
                        {g.entitlement_key}
                        {g.scope_id ? <span style={{opacity: 0.65}}> — {g.scope_id}</span> : null}
                      </div>
                      <div style={{fontSize: 11, opacity: 0.55}}>
                        {active ? 'active' : 'inactive'} · {g.id}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!active || busy === `revoke:${g.id}`}
                      onClick={() => revoke(g.id)}
                      style={{
                        padding: '8px 10px',
                        borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(0,0,0,0.18)',
                        color: 'rgba(255,255,255,0.92)',
                        opacity: !active ? 0.35 : busy === `revoke:${g.id}` ? 0.6 : 0.9,
                        cursor: !active ? 'default' : 'pointer',
                        flex: '0 0 auto',
                      }}
                    >
                      Revoke
                    </button>
                  </div>
                )
              })}
              {!grants.length ? <div style={{fontSize: 12, opacity: 0.6}}>No grants.</div> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
