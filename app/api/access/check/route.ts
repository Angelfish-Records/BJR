// web/app/api/access/check/route.ts
import {NextRequest, NextResponse} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {checkAccess} from '@/lib/access'
import {ACCESS_ACTIONS, ENTITLEMENTS} from '@/lib/vocab'
import {newCorrelationId} from '@/lib/events'

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

export async function GET(req: NextRequest) {
  const correlationId = newCorrelationId()
  const {userId} = await auth()

  const url = new URL(req.url)

  const albumId = (url.searchParams.get('albumId') ?? '').trim()

  const albumScopeId = albumId ? `alb:${albumId}` : null

  if (!userId) {
    return NextResponse.json({ok: true, allowed: false, reason: 'AUTH_REQUIRED', correlationId})
  }

  const memberId = await getMemberIdByClerkUserId(userId)
  if (!memberId) {
    return NextResponse.json({ok: true, allowed: false, reason: 'PROVISIONING', correlationId})
  }

  const decision = await checkAccess(
    memberId,
    albumScopeId
      ? {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]}
      : {kind: 'global', required: [ENTITLEMENTS.PLAY_ALBUM]},
    {log: true, action: ACCESS_ACTIONS.ACCESS_CHECK, correlationId}
  )

  return NextResponse.json({
    ok: true,
    allowed: decision.allowed,
    reason: decision.allowed ? null : decision.reason,
    correlationId,
  })
}
