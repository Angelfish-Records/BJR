// web/lib/access.ts
import 'server-only'
import {findAnyEntitlement} from './entitlements'
import {logAccessDecision} from './events'
import {ACCESS_ACTIONS, SCOPE_CATALOG} from './vocab'

/**
 * ACCESS CONTRACT (do not violate):
 * - Access decisions depend only on derived entitlements (member_entitlements_current).
 * - Access does NOT inspect payment providers, identity providers, raw analytics, or events.
 * - Facts -> derived entitlements -> access decisions.
 *
 * This function is the canonical gate. Everything else should call this, not reimplement logic.
 */

export type AccessCheck =
  | {kind: 'global'; required: string[]; scopeId?: string | null} // default: 'catalog'
  | {kind: 'album'; albumScopeId: string; required: string[]}

export type AccessDecision =
  | {
      allowed: true
      matched: {
        entitlementKey: string
        scopeId: string | null
        grantedAt: string
        expiresAt: string | null
      }
      correlationId: string | null
    }
  | {allowed: false; reason: 'NO_ENTITLEMENT'; correlationId: string | null}

export async function checkAccess(
  memberId: string,
  check: AccessCheck,
  opts?: {
    log?: boolean
    action?: string
    correlationId?: string | null
  }
): Promise<AccessDecision> {
  const scopeId =
    check.kind === 'album'
      ? check.albumScopeId
      : (check.scopeId ?? SCOPE_CATALOG) // explicit: global means "catalog", not null

  const action = opts?.action ?? ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE
  const shouldLog = opts?.log ?? false
  const correlationId = opts?.correlationId ?? null

  const matched = await findAnyEntitlement(memberId, check.required, scopeId, {
    allowGlobalFallback: true,
    allowCatalogFallback: true,
    catalogScopeId: SCOPE_CATALOG,
  })

  if (matched) {
    if (shouldLog) {
      await logAccessDecision({
        memberId,
        allowed: true,
        action,
        resource: {kind: check.kind, id: scopeId},
        requiredEntitlements: check.required,
        matchedEntitlement: {key: matched.entitlementKey, scope_id: matched.scopeId},
        correlationId,
      })
    }
    return {allowed: true, matched, correlationId}
  }

  if (shouldLog) {
    await logAccessDecision({
      memberId,
      allowed: false,
      action,
      resource: {kind: check.kind, id: scopeId},
      requiredEntitlements: check.required,
      reason: 'NO_ENTITLEMENT',
      correlationId,
    })
  }

  return {allowed: false, reason: 'NO_ENTITLEMENT', correlationId}
}
