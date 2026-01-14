import 'server-only'
import {redirect} from 'next/navigation'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {ENTITLEMENTS} from '@/lib/vocab'
import {checkAccess} from '@/lib/access'
import {listAlbumsForBrowse} from '@/lib/albums'
import AdminMintShareTokenForm from './AdminMintShareTokenForm'

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

export default async function Page() {
  const {userId} = await auth()
  if (!userId) redirect('/home') // or your preferred sign-in entry

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

  const albums = await listAlbumsForBrowse()

  return (
    <div style={{padding: 24, maxWidth: 900}}>
      <h1 style={{fontSize: 22, marginBottom: 12}}>Mint share / press tokens</h1>
      <AdminMintShareTokenForm albums={albums} />
    </div>
  )
}
