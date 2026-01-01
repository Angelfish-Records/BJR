import 'server-only'
import {findAnyEntitlement} from './entitlements'
import {logMemberEvent} from './events'

export type AccessCheck =
  | {kind: 'global'; required: string[]}
  | {kind: 'track'; trackId: string; required: string[]}

export type AccessDecision =
  | {allowed: true; matched: {entitlementKey: string; scopeId: string | null; grantedAt: string; expiresAt: string | null}}
  | {allowed: false; reason: 'NO_ENTITLEMENT'}

export async function checkAccess(
  memberId: string,
  check: AccessCheck,
  opts?: {log?: boolean; action?: string}
): Promise<AccessDecision> {
  const scopeId = check.kind === 'track' ? check.trackId : null
  const action = opts?.action ?? 'access_check'
  const shouldLog = opts?.log ?? false

  const matched = await findAnyEntitlement(memberId, check.required, scopeId, {
    allowGlobalFallback: true,
  })

  if (matched) {
    if (shouldLog) {
      await logMemberEvent({
        memberId,
        eventType: 'access_allowed',
        source: 'server',
        payload: {
          action,
          resource: {kind: check.kind, id: scopeId},
          required_entitlements: check.required,
          matched_entitlement: {key: matched.entitlementKey, scope_id: matched.scopeId},
        },
      })
    }
    return {allowed: true, matched}
  }

  if (shouldLog) {
    await logMemberEvent({
      memberId,
      eventType: 'access_denied',
      source: 'server',
      payload: {
        action,
        resource: {kind: check.kind, id: scopeId},
        required_entitlements: check.required,
        reason: 'NO_ENTITLEMENT',
      },
    })
  }

  return {allowed: false, reason: 'NO_ENTITLEMENT'}
}
