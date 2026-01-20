// web/app/api/access/check/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {cookies} from 'next/headers'
import {auth} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'
import {checkAccess} from '@/lib/access'
import {ACCESS_ACTIONS, ENTITLEMENTS} from '@/lib/vocab'
import {ensureAnonId, persistAnonId} from '@/lib/anon'
import {countAnonDistinctCompletedTracks, newCorrelationId} from '@/lib/events'
import {redeemShareTokenForMember, validateShareToken} from '@/lib/shareTokens'
import {getAlbumPolicyByAlbumId, isEmbargoed, type TierName} from '@/lib/albumPolicy'
import {listCurrentEntitlementKeys} from '@/lib/entitlements'

const ANON_DISTINCT_TRACK_CAP = 3
const ANON_WINDOW_DAYS = 30

type Action = 'login' | 'subscribe' | 'buy' | 'wait' | null

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

function baseJson<T extends Record<string, unknown>>(body: T, opts: {correlationId: string; status?: number}) {
  const res = NextResponse.json(body, {status: opts.status ?? 200})
  res.headers.set('x-correlation-id', opts.correlationId)
  return res
}

function anonJson<T extends Record<string, unknown>>(
  anon: {anonId: string; isNew: boolean},
  body: T,
  opts: {correlationId: string; status?: number}
) {
  const res = NextResponse.json(body, {status: opts.status ?? 200})
  res.headers.set('x-correlation-id', opts.correlationId)
  if (anon.isNew) persistAnonId(res, anon.anonId) // ✅ persist THE SAME anonId we used for logic
  return res
}

export async function GET(req: NextRequest) {
  const correlationId = newCorrelationId()
  const {userId} = await auth()

  const url = new URL(req.url)
  const rawAlbumId = (url.searchParams.get('albumId') ?? '').trim()
  const albumId = normalizeAlbumId(rawAlbumId)
  const st = (url.searchParams.get('st') ?? url.searchParams.get('share') ?? '').trim()

  if (!albumId) {
    return baseJson(
      {
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt: null,
        code: 'INVALID_REQUEST',
        action: null,
        reason: 'Missing albumId',
        correlationId,
        redeemed: null,
      },
      {correlationId}
    )
  }

  const albumScopeId = `alb:${albumId}`

  // ---- Unauthed: anon sampling + optional share-token capability ----
  if (!userId) {
    const anon = ensureAnonId(req) // ✅ mint once; persist later via anonJson()

    const policy = await getAlbumPolicyByAlbumId(albumId)
    const releaseAt = policy?.releaseAt ?? null
    const embargoed = isEmbargoed(policy)

    if (embargoed && !st) {
      return anonJson(
        anon,
        {
          ok: true,
          allowed: false,
          embargoed: true,
          releaseAt,
          code: 'EMBARGO',
          action: 'wait' satisfies Action,
          reason: 'This album is not released yet.',
          correlationId,
          redeemed: null,
        },
        {correlationId}
      )
    }

    if (st) {
      const v = await validateShareToken({
        token: st,
        expectedScopeId: albumScopeId,
        anonId: anon.anonId,
        resourceKind: 'album',
        resourceId: albumScopeId,
        action: 'access',
      })

      if (!v.ok) {
        return anonJson(
          anon,
          {
            ok: true,
            allowed: false,
            embargoed,
            releaseAt,
            code: v.code,
            action: 'login' as const,
            reason: v.code === 'CAP_REACHED' ? 'Share link cap reached.' : 'Invalid or expired share token.',
            correlationId,
            redeemed: {ok: false, code: v.code},
          },
          {correlationId}
        )
      }

      return anonJson(
        anon,
        {
          ok: true,
          allowed: true,
          embargoed: false,
          releaseAt,
          code: null,
          action: null,
          reason: null,
          correlationId,
          redeemed: {ok: true},
        },
        {correlationId}
      )
    }

    const distinctCompleted = await countAnonDistinctCompletedTracks({anonId: anon.anonId, sinceDays: ANON_WINDOW_DAYS})
    if (distinctCompleted >= ANON_DISTINCT_TRACK_CAP) {
      return anonJson(
        anon,
        {
          ok: true,
          allowed: false,
          embargoed: false,
          releaseAt,
          code: 'ANON_CAP_REACHED',
          action: 'login' as const,
          reason: 'Anonymous listening limit reached. Please log in to continue.',
          correlationId,
          redeemed: null,
          cap: {used: distinctCompleted, max: ANON_DISTINCT_TRACK_CAP, windowDays: ANON_WINDOW_DAYS},
        },
        {correlationId}
      )
    }

    return anonJson(
      anon,
      {
        ok: true,
        allowed: true,
        embargoed: false,
        releaseAt,
        code: null,
        action: null,
        reason: null,
        correlationId,
        redeemed: null,
        cap: {used: distinctCompleted, max: ANON_DISTINCT_TRACK_CAP, windowDays: ANON_WINDOW_DAYS},
      },
      {correlationId}
    )
  }

  // ---- Authed: resolve member ----
  const memberId = await getMemberIdByClerkUserId(userId)
  if (!memberId) {
    return baseJson(
      {
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt: null,
        code: 'PROVISIONING',
        action: 'wait' satisfies Action,
        reason: 'Member profile is still being created',
        correlationId,
        redeemed: null,
      },
      {correlationId}
    )
  }

  const dbg = await readAdminDebugCookie()
  if (dbg) {
    const isAdmin = (await checkAccess(memberId, {kind: 'global', required: [ENTITLEMENTS.ADMIN]}, {log: false})).allowed
    if (isAdmin) {
      const force = (dbg.force ?? 'none').toString()

      if (force === 'AUTH_REQUIRED') {
        return baseJson(
          {ok: true, allowed: false, embargoed: false, releaseAt: null, code: 'AUTH_REQUIRED', action: 'login', reason: 'Sign in required', correlationId, redeemed: null},
          {correlationId}
        )
      }
      if (force === 'ENTITLEMENT_REQUIRED') {
        return baseJson(
          {ok: true, allowed: false, embargoed: false, releaseAt: null, code: 'ENTITLEMENT_REQUIRED', action: 'subscribe', reason: 'Entitlement required', correlationId, redeemed: null},
          {correlationId}
        )
      }
      if (force === 'ANON_CAP_REACHED') {
        return baseJson(
          {ok: true, allowed: false, embargoed: false, releaseAt: null, code: 'ANON_CAP_REACHED', action: 'login', reason: 'Anon cap reached', correlationId, redeemed: null},
          {correlationId}
        )
      }
      if (force === 'EMBARGOED') {
        return baseJson(
          {ok: true, allowed: false, embargoed: true, releaseAt: new Date().toISOString(), code: 'EMBARGOED', action: 'wait', reason: 'Embargoed', correlationId, redeemed: null},
          {correlationId}
        )
      }
    }
  }

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

  const policy = await getAlbumPolicyByAlbumId(albumId)
  const releaseAt = policy?.releaseAt ?? null
  const embargoed = isEmbargoed(policy)

  if (embargoed) {
    const override = await checkAccess(
      memberId,
      {kind: 'album', albumScopeId, required: [ENTITLEMENTS.ALBUM_SHARE_GRANT]},
      {log: true, action: ACCESS_ACTIONS.ACCESS_CHECK, correlationId}
    )

    if (!override.allowed) {
      if (policy?.earlyAccessEnabled && policy.earlyAccessTiers.length > 0) {
        const keys = await listCurrentEntitlementKeys(memberId)
        const s = new Set(keys)
        const allowedTierKeys = policy.earlyAccessTiers.map((t) => `tier_${t}`)
        const ok = allowedTierKeys.some((k) => s.has(k))
        if (!ok) {
          return baseJson(
            {ok: true, allowed: false, embargoed: true, releaseAt, code: 'EMBARGO', action: 'subscribe' satisfies Action, reason: 'This album is not released yet. Upgrade for early access.', correlationId, redeemed},
            {correlationId}
          )
        }
      } else {
        return baseJson(
          {ok: true, allowed: false, embargoed: true, releaseAt, code: 'EMBARGO', action: 'wait' satisfies Action, reason: 'This album is not released yet.', correlationId, redeemed},
          {correlationId}
        )
      }
    }
  }

  if (policy?.minTierForPlayback) {
    const keys = await listCurrentEntitlementKeys(memberId)
    const s = new Set(keys)
    const requiredTierKeys = tierAtOrAbove(policy.minTierForPlayback)
    const ok = requiredTierKeys.some((k) => s.has(k))
    if (!ok) {
      return baseJson(
        {ok: true, allowed: false, embargoed: false, releaseAt, code: 'TIER_REQUIRED', action: 'subscribe' satisfies Action, reason: `This album requires ${policy.minTierForPlayback} tier or higher.`, correlationId, redeemed},
        {correlationId}
      )
    }
  }

  const decision = await checkAccess(
    memberId,
    {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]},
    {log: true, action: ACCESS_ACTIONS.ACCESS_CHECK, correlationId}
  )

  return baseJson(
    {
      ok: true,
      allowed: decision.allowed,
      embargoed: embargoed && !decision.allowed,
      releaseAt,
      code: decision.allowed ? null : 'NO_ENTITLEMENT',
      action: decision.allowed ? null : ('subscribe' satisfies Action),
      reason: decision.allowed ? null : decision.reason,
      correlationId,
      redeemed,
    },
    {correlationId}
  )
}