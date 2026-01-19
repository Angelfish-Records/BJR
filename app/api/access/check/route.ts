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

const ANON_COOKIE = 'af_anon'
const ANON_COOKIE_MAX_AGE = 60 * 60 * 24 * 365 // 1y

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

type Action = 'login' | 'subscribe' | 'buy' | 'wait' | null

type JsonOpts = {
  correlationId: string
  anon?: {id: string; shouldSetCookie: boolean} | null
  status?: number
}

/**
 * Canonical JSON responder:
 * - always sets x-correlation-id for client tracing
 * - optionally persists anon cookie for stable caps + analytics
 */
function json<T extends Record<string, unknown>>(body: T, opts: JsonOpts) {
  const res = NextResponse.json(body, {status: opts.status ?? 200})
  res.headers.set('x-correlation-id', opts.correlationId)

  if (opts.anon?.shouldSetCookie) {
    res.cookies.set(ANON_COOKIE, opts.anon.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: ANON_COOKIE_MAX_AGE,
    })
  }

  return res
}

function getOrMintAnon(req: NextRequest): {id: string; shouldSetCookie: boolean} {
  const cookieVal = (req.cookies.get(ANON_COOKIE)?.value ?? '').trim()
  if (cookieVal) return {id: cookieVal, shouldSetCookie: false}
  return {id: crypto.randomUUID(), shouldSetCookie: true}
}

export async function GET(req: NextRequest) {
  const correlationId = newCorrelationId()
  const {userId} = await auth()

  const url = new URL(req.url)
  const rawAlbumId = (url.searchParams.get('albumId') ?? '').trim()
  const albumId = normalizeAlbumId(rawAlbumId)
  const st = (url.searchParams.get('st') ?? url.searchParams.get('share') ?? '').trim()

  if (!albumId) {
    return json(
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
      {correlationId, anon: null}
    )
  }

  const albumScopeId = `alb:${albumId}`

  // ---- Unauthed: always establish anon identity for coherent caps/analytics ----
  if (!userId) {
    const anon = getOrMintAnon(req)

    // --- allow press/share token access without auth ---
    if (st) {
      const policy = await getAlbumPolicyByAlbumId(albumId)
      const releaseAt = policy?.releaseAt ?? null
      const embargoed = isEmbargoed(policy)

      const v = await validateShareToken({
        token: st,
        expectedScopeId: albumScopeId,
        anonId: anon.id,
        resourceKind: 'album',
        resourceId: albumScopeId,
        action: 'access',
      })

      if (!v.ok) {
        return json(
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
          {correlationId, anon}
        )
      }

      // share token grants access (bypasses tier + PLAY_ALBUM entitlements for anon users)
      return json(
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
        {correlationId, anon}
      )
    }

    // no token: must auth (still set anon cookie so later mux/token + playthrough are coherent)
    return json(
      {
        ok: true,
        allowed: false,
        embargoed: false,
        releaseAt: null,
        code: 'AUTH_REQUIRED',
        action: 'login' as const,
        reason: 'Sign in required',
        correlationId,
        redeemed: null,
      },
      {correlationId, anon}
    )
  }

  // ---- Authed: resolve member ----
  const memberId = await getMemberIdByClerkUserId(userId)
  if (!memberId) {
    return json(
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
      {correlationId, anon: null}
    )
  }

  // --- admin debug override (real endpoint, session-only) ---
  const dbg = await readAdminDebugCookie()
  if (dbg && memberId) {
    const isAdmin = (await checkAccess(memberId, {kind: 'global', required: [ENTITLEMENTS.ADMIN]}, {log: false})).allowed
    if (isAdmin) {
      const force = (dbg.force ?? 'none').toString()
      if (force === 'AUTH_REQUIRED') {
        return json(
          {
            ok: true,
            allowed: false,
            embargoed: false,
            releaseAt: null,
            code: 'AUTH_REQUIRED',
            action: 'login',
            reason: 'Sign in required',
            correlationId,
            redeemed: null,
          },
          {correlationId, anon: null}
        )
      }
      if (force === 'ENTITLEMENT_REQUIRED') {
        return json(
          {
            ok: true,
            allowed: false,
            embargoed: false,
            releaseAt: null,
            code: 'ENTITLEMENT_REQUIRED',
            action: 'subscribe',
            reason: 'Entitlement required',
            correlationId,
            redeemed: null,
          },
          {correlationId, anon: null}
        )
      }
      if (force === 'ANON_CAP_REACHED') {
        return json(
          {
            ok: true,
            allowed: false,
            embargoed: false,
            releaseAt: null,
            code: 'ANON_CAP_REACHED',
            action: 'login',
            reason: 'Anon cap reached',
            correlationId,
            redeemed: null,
          },
          {correlationId, anon: null}
        )
      }
      if (force === 'EMBARGOED') {
        return json(
          {
            ok: true,
            allowed: false,
            embargoed: true,
            releaseAt: new Date().toISOString(),
            code: 'EMBARGOED',
            action: 'wait',
            reason: 'Embargoed',
            correlationId,
            redeemed: null,
          },
          {correlationId, anon: null}
        )
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

  // 3) Embargo gate: allow if share-grant OR early access tier qualifies.
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
          return json(
            {
              ok: true,
              allowed: false,
              embargoed: true,
              releaseAt,
              code: 'EMBARGO',
              action: 'subscribe' satisfies Action,
              reason: 'This album is not released yet. Upgrade for early access.',
              correlationId,
              redeemed,
            },
            {correlationId, anon: null}
          )
        }
        // early access qualifies -> continue
      } else {
        return json(
          {
            ok: true,
            allowed: false,
            embargoed: true,
            releaseAt,
            code: 'EMBARGO',
            action: 'wait' satisfies Action,
            reason: 'This album is not released yet.',
            correlationId,
            redeemed,
          },
          {correlationId, anon: null}
        )
      }
    }
    // override allowed -> continue
  }

  // 4) Post-release (or embargo bypassed): min tier gate
  if (policy?.minTierForPlayback) {
    const keys = await listCurrentEntitlementKeys(memberId)
    const s = new Set(keys)
    const requiredTierKeys = tierAtOrAbove(policy.minTierForPlayback)
    const ok = requiredTierKeys.some((k) => s.has(k))
    if (!ok) {
      return json(
        {
          ok: true,
          allowed: false,
          embargoed: false,
          releaseAt,
          code: 'TIER_REQUIRED',
          action: 'subscribe' satisfies Action,
          reason: `This album requires ${policy.minTierForPlayback} tier or higher.`,
          correlationId,
          redeemed,
        },
        {correlationId, anon: null}
      )
    }
  }

  // 5) Final entitlement gate: PLAY_ALBUM
  const decision = await checkAccess(
    memberId,
    {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]},
    {log: true, action: ACCESS_ACTIONS.ACCESS_CHECK, correlationId}
  )

  return json(
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
    {correlationId, anon: null}
  )
}
