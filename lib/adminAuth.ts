// web/lib/adminAuth.ts
import 'server-only'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {checkAccess} from '@/lib/access'
import {ENTITLEMENTS} from '@/lib/vocab'

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

export async function requireAdminMemberId(): Promise<string> {
  const {userId} = await auth()
  if (!userId) throw new Error('Unauthorized')

  const memberId = await getMemberIdByClerkUserId(userId)
  if (!memberId) throw new Error('Unauthorized')

  const decision = await checkAccess(
    memberId,
    {kind: 'global', required: [ENTITLEMENTS.ADMIN]},
    {log: false}
  )
  if (!decision.allowed) throw new Error('Forbidden')

  return memberId
}
