// web/lib/accessOracle.ts
import 'server-only'
import {checkAccess} from '@/lib/access'
import {getAlbumPolicyByAlbumId, isEmbargoed, type TierName} from '@/lib/albumPolicy'
import {listCurrentEntitlementKeys} from '@/lib/entitlements'
import {ACCESS_ACTIONS, ENTITLEMENTS, SCOPE_CATALOG, type AccessAction} from '@/lib/vocab'

export type AccessOracleCode =
  | 'OK'
  | 'AUTH_REQUIRED'
  | 'PROVISIONING'
  | 'INVALID_REQUEST'
  | 'EMBARGO'
  | 'TIER_REQUIRED'
  | 'ENTITLEMENT_REQUIRED'

export type AccessOracleAction = 'login' | 'subscribe' | 'buy' | 'wait' | null

export type AlbumPlaybackOracleDecision =
  | {
      ok: true
      allowed: true
      code: 'OK'
      action: null
      albumId: string
      albumScopeId: string
      embargoed: boolean
      releaseAt: string | null
      requiredTier: TierName | null
      correlationId: string
    }
  | {
      ok: true
      allowed: false
      code: Exclude<AccessOracleCode, 'OK'>
      action: AccessOracleAction
      reason: string
      albumId: string
      albumScopeId: string
      embargoed: boolean
      releaseAt: string | null
      requiredTier: TierName | null
      correlationId: string
    }

function tierKey(t: TierName): string {
  if (t === 'partner') return ENTITLEMENTS.TIER_PARTNER
  if (t === 'patron') return ENTITLEMENTS.TIER_PATRON
  return ENTITLEMENTS.TIER_FRIEND
}

function tierAtOrAbove(min: TierName): string[] {
  const order: TierName[] = ['friend', 'patron', 'partner']
  const idx = order.indexOf(min)
  const allowed = idx >= 0 ? order.slice(idx) : order
  return allowed.map(tierKey)
}

function safeParseReleaseAt(releaseAt: string | null | undefined): string | null {
  const s = typeof releaseAt === 'string' ? releaseAt.trim() : ''
  if (!s) return null
  const t = Date.parse(s)
  if (!Number.isFinite(t)) return null
  return s
}

function normalizeAlbumId(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  while (s.startsWith('alb:')) s = s.slice(4)
  return s.trim()
}

export async function decideAlbumPlaybackAccess(params: {
  memberId: string
  albumId: string
  correlationId: string
  action?: AccessAction | string
}): Promise<AlbumPlaybackOracleDecision> {
  const albumId = normalizeAlbumId(params.albumId)
  const correlationId = params.correlationId
  const action = params.action ?? ACCESS_ACTIONS.ACCESS_CHECK

  if (!albumId) {
    return {
      ok: true,
      allowed: false,
      code: 'INVALID_REQUEST',
      action: null,
      reason: 'Missing albumId.',
      albumId: '',
      albumScopeId: '',
      embargoed: false,
      releaseAt: null,
      requiredTier: null,
      correlationId,
    }
  }

  const albumScopeId = albumId === SCOPE_CATALOG ? SCOPE_CATALOG : `alb:${albumId}`

  const policy = await getAlbumPolicyByAlbumId(albumId)
  const releaseAt = safeParseReleaseAt(policy?.releaseAt ?? null)
  const embargoed = isEmbargoed(policy)

  // Load entitlement keys once (used for tier checks)
  const keys = await listCurrentEntitlementKeys(params.memberId)
  const keySet = new Set(keys)

  // ---- Embargo gate ----
  if (embargoed) {
    // 1) explicit override (share/press links etc.)
    const override = await checkAccess(
      params.memberId,
      {kind: 'album', albumScopeId, required: [ENTITLEMENTS.ALBUM_SHARE_GRANT]},
      {log: true, action, correlationId}
    )

    if (!override.allowed) {
      // 2) early-access tiers during embargo (if enabled)
      if (policy?.earlyAccessEnabled && Array.isArray(policy.earlyAccessTiers) && policy.earlyAccessTiers.length > 0) {
        const allowedTierKeys = policy.earlyAccessTiers.map(tierKey)
        const ok = allowedTierKeys.some((k) => keySet.has(k))
        if (!ok) {
          return {
            ok: true,
            allowed: false,
            code: 'EMBARGO',
            action: 'subscribe',
            reason: 'This album is not released yet. Upgrade for early access.',
            albumId,
            albumScopeId,
            embargoed: true,
            releaseAt,
            requiredTier: null,
            correlationId,
          }
        }
        // allowed by early-access tier -> continue
      } else {
        return {
          ok: true,
          allowed: false,
          code: 'EMBARGO',
          action: 'wait',
          reason: 'This album is not released yet.',
          albumId,
          albumScopeId,
          embargoed: true,
          releaseAt,
          requiredTier: null,
          correlationId,
        }
      }
    }
    // override allowed -> continue
  }

  // ---- Min tier for playback (post-release or embargo bypass) ----
  if (policy?.minTierForPlayback) {
    const requiredTierKeys = tierAtOrAbove(policy.minTierForPlayback)
    const ok = requiredTierKeys.some((k) => keySet.has(k))
    if (!ok) {
      return {
        ok: true,
        allowed: false,
        code: 'TIER_REQUIRED',
        action: 'subscribe',
        reason: `This album requires ${policy.minTierForPlayback} tier or higher.`,
        albumId,
        albumScopeId,
        embargoed,
        releaseAt,
        requiredTier: policy.minTierForPlayback,
        correlationId,
      }
    }
  }

  // ---- Entitlement gate (play_album) ----
  const decision = await checkAccess(
    params.memberId,
    albumScopeId === SCOPE_CATALOG
      ? {kind: 'global', scopeId: SCOPE_CATALOG, required: [ENTITLEMENTS.PLAY_ALBUM]}
      : {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]},
    {log: true, action, correlationId}
  )

  if (!decision.allowed) {
    return {
      ok: true,
      allowed: false,
      code: 'ENTITLEMENT_REQUIRED',
      action: 'subscribe',
      reason: 'You do not have access to play this album.',
      albumId,
      albumScopeId,
      embargoed,
      releaseAt,
      requiredTier: policy?.minTierForPlayback ?? null,
      correlationId,
    }
  }

  return {
    ok: true,
    allowed: true,
    code: 'OK',
    action: null,
    albumId,
    albumScopeId,
    embargoed,
    releaseAt,
    requiredTier: policy?.minTierForPlayback ?? null,
    correlationId,
  }
}
