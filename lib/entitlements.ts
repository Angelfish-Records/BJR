// web/lib/entitlements.ts
import 'server-only'
import {sql} from '@vercel/postgres'

export type EntitlementScopeId = string
export type EntitlementKey = string

export type EntitlementMatch = {
  entitlementKey: string
  scopeId: string | null
  grantedAt: string
  expiresAt: string | null
}

export type HasEntitlementOptions = {
  allowGlobalFallback?: boolean
  allowCatalogFallback?: boolean
  catalogScopeId?: string // default 'catalog'
}

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)

function normCatalog(opts: HasEntitlementOptions) {
  return {
    allowGlobalFallback: opts.allowGlobalFallback ?? true,
    allowCatalogFallback: opts.allowCatalogFallback ?? true,
    catalogScopeId: (opts.catalogScopeId ?? 'catalog').trim() || 'catalog',
  }
}

/**
 * Returns the matched entitlement row (if any) so callers can log/inspect *why* access was granted.
 */
export async function findEntitlement(
  memberId: string,
  entitlementKey: EntitlementKey,
  scopeId?: EntitlementScopeId | null,
  opts: HasEntitlementOptions = {}
): Promise<EntitlementMatch | null> {
  if (!uuidOk(memberId)) return null
  const {allowGlobalFallback, allowCatalogFallback, catalogScopeId} = normCatalog(opts)

  const res = await sql`
    select entitlement_key, scope_id, granted_at, expires_at
    from member_entitlements_current
    where member_id = ${memberId}::uuid
      and entitlement_key = ${entitlementKey}
      and (
        (${scopeId ?? null}::text is null and scope_id is null)
        or (${scopeId ?? null}::text is not null and (
              scope_id = ${scopeId ?? null}::text
              or (${allowCatalogFallback}::boolean and scope_id = ${catalogScopeId}::text)
              or (${allowGlobalFallback}::boolean and scope_id is null)
           ))
      )
    order by
      case
        when scope_id = ${scopeId ?? null}::text then 0
        when scope_id = ${catalogScopeId}::text then 1
        else 2
      end,
      granted_at desc
    limit 1
  `

  const row = res.rows[0]
  if (!row) return null

  return {
    entitlementKey: row.entitlement_key as string,
    scopeId: (row.scope_id as string | null) ?? null,
    grantedAt: row.granted_at as string,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

export async function hasEntitlement(
  memberId: string,
  entitlementKey: EntitlementKey,
  scopeId?: EntitlementScopeId | null,
  opts: HasEntitlementOptions = {}
): Promise<boolean> {
  return (await findEntitlement(memberId, entitlementKey, scopeId, opts)) !== null
}

/**
 * Single-query “any of these keys” check that also returns the matching entitlement.
 */
export async function findAnyEntitlement(
  memberId: string,
  entitlementKeys: EntitlementKey[],
  scopeId?: EntitlementScopeId | null,
  opts: HasEntitlementOptions = {}
): Promise<EntitlementMatch | null> {
  if (!uuidOk(memberId)) return null
  if (entitlementKeys.length === 0) return null
  const {allowGlobalFallback, allowCatalogFallback, catalogScopeId} = normCatalog(opts)

  const keysJson = JSON.stringify(entitlementKeys)

  const res = await sql`
    with keys as (
      select jsonb_array_elements_text(${keysJson}::jsonb) as ent_key
    )
    select mec.entitlement_key, mec.scope_id, mec.granted_at, mec.expires_at
    from member_entitlements_current mec
    join keys k on k.ent_key = mec.entitlement_key
    where mec.member_id = ${memberId}::uuid
      and (
        (${scopeId ?? null}::text is null and mec.scope_id is null)
        or (${scopeId ?? null}::text is not null and (
              mec.scope_id = ${scopeId ?? null}::text
              or (${allowCatalogFallback}::boolean and mec.scope_id = ${catalogScopeId}::text)
              or (${allowGlobalFallback}::boolean and mec.scope_id is null)
           ))
      )
    order by
      case
        when mec.scope_id = ${scopeId ?? null}::text then 0
        when mec.scope_id = ${catalogScopeId}::text then 1
        else 2
      end,
      mec.granted_at desc
    limit 1
  `

  const row = res.rows[0]
  if (!row) return null

  return {
    entitlementKey: row.entitlement_key as string,
    scopeId: (row.scope_id as string | null) ?? null,
    grantedAt: row.granted_at as string,
    expiresAt: (row.expires_at as string | null) ?? null,
  }
}

export async function hasAnyEntitlement(
  memberId: string,
  entitlementKeys: EntitlementKey[],
  scopeId?: EntitlementScopeId | null,
  opts: HasEntitlementOptions = {}
): Promise<boolean> {
  return (await findAnyEntitlement(memberId, entitlementKeys, scopeId, opts)) !== null
}

export async function listCurrentEntitlements(memberId: string): Promise<EntitlementMatch[]> {
  if (!uuidOk(memberId)) return []
  const res = await sql`
    select entitlement_key, scope_id, granted_at, expires_at
    from member_entitlements_current
    where member_id = ${memberId}::uuid
    order by entitlement_key asc, scope_id asc nulls first
  `
  return res.rows.map((r) => ({
    entitlementKey: r.entitlement_key as string,
    scopeId: (r.scope_id as string | null) ?? null,
    grantedAt: r.granted_at as string,
    expiresAt: (r.expires_at as string | null) ?? null,
  }))
}

export async function listCurrentEntitlementKeys(memberId: string): Promise<EntitlementKey[]> {
  const matches = await listCurrentEntitlements(memberId)
  return matches.map((m) => m.entitlementKey)
}
