// web/app/api/access/check/route.ts
import {NextRequest, NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {checkAccess} from '@/lib/access'
import {ACCESS_ACTIONS, ENTITLEMENTS} from '@/lib/vocab'
import {newCorrelationId} from '@/lib/events'
import crypto from 'crypto'
import {redeemShareTokenForMember, validateShareToken} from '@/lib/shareTokens'
import {getAlbumPolicyByAlbumId, isEmbargoed, type TierName} from '@/lib/albumPolicy'
import {listCurrentEntitlementKeys} from '@/lib/entitlements'


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

function tierAtOrAbove(min: TierName) {
  const order: TierName[] = ['friend', 'patron', 'partner']
  const idx = order.indexOf(min)
  const allowed = idx >= 0 ? order.slice(idx) : order
  return allowed.map((t) => `tier_${t}`)
}

function normalizeAlbumId(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  // Strip *all* leading alb: prefixes (defensive)
  while (s.startsWith('alb:')) s = s.slice(4)
  return s.trim()
}

async function readAdminDebugCookie(): Promise<{tier?: string; force?: string} | null> {
  if (process.env.NEXT_PUBLIC_ADMIN_DEBUG !== '1') return null

  const c = await cookies()
  const raw = c.get('af_dbg')?.value ?? ''
  if (!raw) return null

  try {
    const o = JSON.parse(raw) as {tier?: string; force?: string}
    return o && typeof o === 'object' ? o : null
  } catch {
    return null
  }
}

type Action = 'login' | 'subscribe' | 'buy' | 'wait' | null

export async function GET(req: NextRequest) {
  const correlationId = newCorrelationId()
  const {userId} = await auth()

  const url = new URL(req.url)
  const rawAlbumId = (url.searchParams.get('albumId') ?? '').trim()
  const albumId = normalizeAlbumId(rawAlbumId)
  const st = (url.searchParams.get('st') ?? url.searchParams.get('share') ?? '').trim()

  if (!albumId) {
    return NextResponse.json({
      ok: true,
      allowed: false,
      embargoed: false,
      releaseAt: null,
      code: 'INVALID_REQUEST',
      action: null,
      reason: 'Missing albumId',
      correlationId,
      redeemed: null,
    })
  }

  const albumScopeId = `alb:${albumId}`

    // --- allow press token access without auth ---
  if (!userId) {
    if (st) {
      const anonId =
        (req.cookies.get('af_anon')?.value ?? '').trim() ||
        crypto.randomUUID() // you can also set this as a cookie in a middleware later

      const policy = await getAlbumPolicyByAlbumId(albumId)
      const releaseAt = policy?.releaseAt ?? null
      const embargoed = isEmbargoed(policy)

      const v = await validateShareToken({
        token: st,
        expectedScopeId: albumScopeId,
        anonId,
        resourceKind: 'album',
        resourceId: albumScopeId,
        action: 'access',
      })

      if (!v.ok) {
          console.log('[access/check] share token reject', { //temp - remove after debugging
          rawAlbumId,
          albumId,
          expectedScopeId: albumScopeId,
          code: v.code,
        }) // temp - remove to here
        return NextResponse.json({
          ok: true,
          allowed: false,
          embargoed,
          releaseAt,
          code: v.code,
          action: 'login' as const,
          reason: 'Invalid or expired share token.',
          correlationId,
          redeemed: {ok: false, code: v.code},
        })
      }

      // share token grants access (bypasses tier + PLAY_ALBUM entitlements for anon users)
      return NextResponse.json({
        ok: true,
        allowed: true,
        embargoed: false,
        releaseAt,
        code: null,
        action: null,
        reason: null,
        correlationId,
        redeemed: {ok: true},
      })
    }

    return NextResponse.json({
      ok: true,
      allowed: false,
      embargoed: false,
      releaseAt: null,
      code: 'AUTH_REQUIRED',
      action: 'login',
      reason: 'Sign in required',
      correlationId,
      redeemed: null,
    })
  }

  const memberId = await getMemberIdByClerkUserId(userId)
  if (!memberId) {
    return NextResponse.json({
      ok: true,
      allowed: false,
      embargoed: false,
      releaseAt: null,
      code: 'PROVISIONING',
      action: 'wait' satisfies Action,
      reason: 'Member profile is still being created',
      correlationId,
      redeemed: null,
    })
  }

  // --- admin debug override (real endpoint, session-only) ---
const dbg = await readAdminDebugCookie()
if (dbg && memberId) {
  const isAdmin = (await checkAccess(memberId, {kind:'global', required:[ENTITLEMENTS.ADMIN]}, {log:false})).allowed
  if (isAdmin) {
    const force = (dbg.force ?? 'none').toString()
    if (force === 'AUTH_REQUIRED') {
      return NextResponse.json({
        ok: true, allowed: false, embargoed: false, releaseAt: null,
        code: 'AUTH_REQUIRED', action: 'login', reason: 'Sign in required',
        correlationId, redeemed: null,
      })
    }
    if (force === 'ENTITLEMENT_REQUIRED') {
      return NextResponse.json({
        ok: true, allowed: false, embargoed: false, releaseAt: null,
        code: 'ENTITLEMENT_REQUIRED', action: 'subscribe', reason: 'Entitlement required',
        correlationId, redeemed: null,
      })
    }
    if (force === 'ANON_CAP_REACHED') {
      return NextResponse.json({
        ok: true, allowed: false, embargoed: false, releaseAt: null,
        code: 'ANON_CAP_REACHED', action: 'login', reason: 'Anon cap reached',
        correlationId, redeemed: null,
      })
    }
    if (force === 'EMBARGOED') {
      return NextResponse.json({
        ok: true, allowed: false, embargoed: true, releaseAt: new Date().toISOString(),
        code: 'EMBARGOED', action: 'wait', reason: 'Embargoed',
        correlationId, redeemed: null,
      })
    }
  }
}


  // 1) If a share token is present, redeem it first (grants entitlements).
  let redeemed: {ok: boolean; code?: string} | null = null
  if (st) {
    const r = await redeemShareTokenForMember({
      token: st,
      memberId,
      expectedScopeId: albumScopeId,
      resourceKind: 'album',
      resourceId: albumScopeId,
      action: 'redeem',
    })
    redeemed = r.ok ? {ok: true} : {ok: false, code: r.code}
  }

  // 2) Policy from Sanity
  const policy = await getAlbumPolicyByAlbumId(albumId)
  const releaseAt = policy?.releaseAt ?? null
  const embargoed = isEmbargoed(policy)

  // 3) If embargoed, only allow if (a) ALBUM_SHARE_GRANT present OR (b) early access tier qualifies.
  if (embargoed) {
    const override = await checkAccess(
      memberId,
      {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]},
      {log: true, action: ACCESS_ACTIONS.ACCESS_CHECK, correlationId}
    )

    if (!override.allowed) {
      if (policy?.earlyAccessEnabled && policy.earlyAccessTiers.length > 0) {
        const keys = await listCurrentEntitlementKeys(memberId)
        const s = new Set(keys)
        const allowedTierKeys = policy.earlyAccessTiers.map((t) => `tier_${t}`)
        const ok = allowedTierKeys.some((k) => s.has(k))
        if (!ok) {
          return NextResponse.json({
            ok: true,
            allowed: false,
            embargoed: true,
            releaseAt,
            code: 'EMBARGO',
            action: 'subscribe' satisfies Action,
            reason: 'This album is not released yet. Upgrade for early access.',
            correlationId,
            redeemed,
          })
        }
        // early access qualifies -> continue
      } else {
        return NextResponse.json({
          ok: true,
          allowed: false,
          embargoed: true,
          releaseAt,
          code: 'EMBARGO',
          action: 'wait' satisfies Action,
          reason: 'This album is not released yet.',
          correlationId,
          redeemed,
        })
      }
    }
    // override allowed -> continue
  }

  // 4) Post-release (or embargo bypassed): min tier gate if configured
  if (policy?.minTierForPlayback) {
    const keys = await listCurrentEntitlementKeys(memberId)
    const s = new Set(keys)
    const requiredTierKeys = tierAtOrAbove(policy.minTierForPlayback)
    const ok = requiredTierKeys.some((k) => s.has(k))
    if (!ok) {
      return NextResponse.json({
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt,
        code: 'TIER_REQUIRED',
        action: 'subscribe' satisfies Action,
        reason: `This album requires ${policy.minTierForPlayback} tier or higher.`,
        correlationId,
        redeemed,
      })
    }
  }

  // 5) Final entitlement gate: PLAY_ALBUM (scoped to album; allow global fallback inside your entitlements layer)
  const decision = await checkAccess(
    memberId,
    {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]},
    {log: true, action: ACCESS_ACTIONS.ACCESS_CHECK, correlationId}
  )

  return NextResponse.json({
    ok: true,
    allowed: decision.allowed,
    embargoed: embargoed && !decision.allowed, // informational; if they’re allowed, embargo is effectively bypassed
    releaseAt,
    code: decision.allowed ? null : 'NO_ENTITLEMENT',
    action: decision.allowed ? null : ('subscribe' satisfies Action),
    reason: decision.allowed ? null : decision.reason,
    correlationId,
    redeemed,
  })
}
