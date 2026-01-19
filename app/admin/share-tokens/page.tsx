// web/app/admin/share-tokens/page.tsx
import 'server-only'
import {redirect} from 'next/navigation'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {ENTITLEMENTS} from '@/lib/vocab'
import {checkAccess} from '@/lib/access'
import {listAlbumsForBrowse} from '@/lib/albums'
import AdminMintShareTokenForm from './AdminMintShareTokenForm'
import AdminEntitlementsPanel from './AdminEntitlementsPanel'

async function getMemberIdByClerkUserId(userId: string): Promise<string | null> {
  if (!userId) return null
  const r = await sql<{id: string}>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  return (r.rows?.[0]?.id as string | undefined) ?? null
}

export default async function Page(props: {searchParams?: Promise<Record<string, string | string[] | undefined>>}) {
  const {userId} = await auth()
  if (!userId) redirect('/home')

  const memberId = await getMemberIdByClerkUserId(userId)
  if (!memberId) {
    return (
      <div style={{padding: 24}}>
        <h1>Admin</h1>
        <p>Signed in, but your member profile is still being created. Refresh in a moment.</p>
      </div>
    )
  }

  const adminDecision = await checkAccess(memberId, {kind: 'global', required: [ENTITLEMENTS.ADMIN]}, {log: false})
  if (!adminDecision.allowed) {
    return (
      <div style={{padding: 24}}>
        <h1>Admin</h1>
        <p>Forbidden.</p>
      </div>
    )
  }

  const sp = (await props.searchParams) ?? {}
  const tab = typeof sp.tab === 'string' ? sp.tab : 'tokens'

  const albums = await listAlbumsForBrowse()

  const tabBtn = (id: string, label: string) => (
    <a
      href={`/admin/share-tokens?tab=${encodeURIComponent(id)}`}
      style={{
        padding: '10px 12px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.14)',
        background: tab === id ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)',
        color: 'rgba(255,255,255,0.92)',
        textDecoration: 'none',
        fontSize: 13,
        opacity: tab === id ? 0.98 : 0.78,
      }}
    >
      {label}
    </a>
  )

  return (
    <div style={{padding: 24, maxWidth: 980}}>
      <h1 style={{fontSize: 22, marginBottom: 10}}>Admin dashboard</h1>

      <div style={{display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap'}}>
        {tabBtn('tokens', 'Share / press tokens')}
        {tabBtn('entitlements', 'Entitlements')}
      </div>

      {tab === 'entitlements' ? (
        <AdminEntitlementsPanel albums={albums} />
      ) : (
        <>
          <h2 style={{fontSize: 16, margin: '0 0 10px'}}>Mint share / press tokens</h2>
          <AdminMintShareTokenForm albums={albums} />
        </>
      )}
    </div>
  )
}
