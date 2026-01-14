// web/lib/shareTokens.ts
import 'server-only'
import crypto from 'crypto'
import {sql} from '@vercel/postgres'

export type TokenGrant = {
  key: string
  scopeId?: string | null
  scopeMeta?: Record<string, unknown>
  expiresAt?: string | null
}

type ShareTokenRow = {
  id: string
  created_at: string
  kind: string
  scope_id: string | null
  grants: unknown
  expires_at: string | null
  revoked_at: string | null
  max_redemptions: number | null
}

function b64url(bytes: Buffer) {
  return bytes.toString('base64url')
}

export function newShareTokenString(): string {
  return `st_${b64url(crypto.randomBytes(24))}`
}

export function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x)
}

/**
 * share_tokens.grants is stored as jsonb.
 * We accept only the shape we know how to apply: {key, scopeId?, scopeMeta?, expiresAt?}
 * Everything else is ignored.
 */
function coerceTokenGrants(input: unknown): TokenGrant[] {
  if (!Array.isArray(input)) return []

  const out: TokenGrant[] = []
  for (const item of input) {
    if (!isPlainObject(item)) continue

    const key = typeof item.key === 'string' ? item.key.trim() : ''
    if (!key) continue

    const scopeId =
      item.scopeId == null ? null : typeof item.scopeId === 'string' ? item.scopeId.trim() || null : null

    const scopeMeta = isPlainObject(item.scopeMeta) ? item.scopeMeta : undefined

    const expiresAt =
      item.expiresAt == null
        ? null
        : typeof item.expiresAt === 'string'
          ? item.expiresAt.trim() || null
          : null

    out.push({key, scopeId, scopeMeta, expiresAt})
  }

  return out
}

function normalizeAction(input: unknown, fallback: string) {
  const s = typeof input === 'string' ? input.trim() : ''
  return s || fallback
}

async function loadTokenRow(tokenHash: string): Promise<ShareTokenRow | null> {
  const rowR = await sql<ShareTokenRow>`
    select id, created_at, kind, scope_id, grants, expires_at, revoked_at, max_redemptions
    from share_tokens
    where token_hash = ${tokenHash}
    limit 1
  `
  return rowR.rows?.[0] ?? null
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false
  const exp = Date.parse(expiresAt)
  return Number.isFinite(exp) && Date.now() > exp
}

async function capReached(params: {tokenId: string; max: number; action: string}): Promise<boolean> {
  const c = await sql<{n: number}>`
    select count(*)::int as n
    from share_token_plays
    where share_token_id = ${params.tokenId}::uuid
      and action = ${params.action}
  `
  const used = c.rows?.[0]?.n ?? 0
  return used >= params.max
}

async function logPlay(params: {
  tokenId: string
  memberId?: string | null
  anonId?: string | null
  resourceKind: string
  resourceId: string | null
  action: string
}) {
  await sql`
    insert into share_token_plays (
      share_token_id,
      member_id,
      anon_id,
      resource_kind,
      resource_id,
      action,
      occurred_at
    )
    values (
      ${params.tokenId}::uuid,
      ${params.memberId ?? null}::uuid,
      ${params.anonId ?? null},
      ${params.resourceKind},
      ${params.resourceId},
      ${params.action},
      now()
    )
  `
}

export async function createShareToken(params: {
  kind?: string
  scopeId?: string | null
  grants: TokenGrant[]
  expiresAt?: string | null
  maxRedemptions?: number | null
  createdByMemberId?: string | null
}): Promise<{
  token: string
  tokenId: string
  kind: string
  scopeId: string | null
  expiresAt: string | null
  maxRedemptions: number | null
  createdAt: string
}> {
  const token = newShareTokenString()
  const tokenHash = hashShareToken(token)

  const kind = (params.kind ?? 'album_press').trim() || 'album_press'
  const scopeId = (params.scopeId ?? null) ? String(params.scopeId) : null
  const grants = Array.isArray(params.grants) ? params.grants : []

  const expiresAt = params.expiresAt ? new Date(params.expiresAt).toISOString() : null
  const maxRedemptions =
    typeof params.maxRedemptions === 'number' && Number.isFinite(params.maxRedemptions) && params.maxRedemptions > 0
      ? Math.floor(params.maxRedemptions)
      : null

  const r = await sql<{
    id: string
    created_at: string
    kind: string
    scope_id: string | null
    expires_at: string | null
    max_redemptions: number | null
  }>`
    insert into share_tokens (
      created_by_member_id,
      token_hash,
      kind,
      scope_id,
      grants,
      expires_at,
      max_redemptions
    )
    values (
      ${params.createdByMemberId ?? null}::uuid,
      ${tokenHash},
      ${kind},
      ${scopeId},
      ${JSON.stringify(grants)}::jsonb,
      ${expiresAt}::timestamptz,
      ${maxRedemptions}
    )
    returning id, created_at, kind, scope_id, expires_at, max_redemptions
  `

  const row = r.rows?.[0]
  if (!row?.id) throw new Error('Failed to create share token')

  return {
    token,
    tokenId: row.id,
    kind: row.kind,
    scopeId: row.scope_id,
    expiresAt: row.expires_at,
    maxRedemptions: row.max_redemptions,
    createdAt: row.created_at,
  }
}

export async function redeemShareTokenForMember(params: {
  token: string
  memberId: string
  expectedScopeId?: string | null
  resourceKind?: string
  resourceId?: string | null
  action?: string // default: 'redeem'
}): Promise<
  | {ok: true; tokenId: string; scopeId: string | null; kind: string; grants: TokenGrant[]}
  | {ok: false; code: 'INVALID' | 'EXPIRED' | 'REVOKED' | 'SCOPE_MISMATCH' | 'CAP_REACHED'}
> {
  const tokenHash = hashShareToken((params.token ?? '').trim())
  if (!tokenHash) return {ok: false, code: 'INVALID'}

  const row = await loadTokenRow(tokenHash)
  if (!row) return {ok: false, code: 'INVALID'}
  if (row.revoked_at) return {ok: false, code: 'REVOKED'}
  if (isExpired(row.expires_at)) return {ok: false, code: 'EXPIRED'}

  const expectedScopeId = params.expectedScopeId ?? null
  if (expectedScopeId && row.scope_id && row.scope_id !== expectedScopeId) {
    return {ok: false, code: 'SCOPE_MISMATCH'}
  }

  const action = normalizeAction(params.action, 'redeem')

  if (typeof row.max_redemptions === 'number' && row.max_redemptions > 0) {
    const reached = await capReached({tokenId: row.id, max: row.max_redemptions, action})
    if (reached) return {ok: false, code: 'CAP_REACHED'}
  }

  const grants = coerceTokenGrants(row.grants)

  // 1) log redemption
  await logPlay({
    tokenId: row.id,
    memberId: params.memberId,
    anonId: null,
    resourceKind: params.resourceKind ?? 'album',
    resourceId: params.resourceId ?? row.scope_id ?? null,
    action,
  })

  // 2) apply grants (idempotent-ish)
  for (const g of grants) {
    const key = (g?.key ?? '').toString().trim()
    if (!key) continue

    const scopeId = (g?.scopeId ?? null) ? String(g.scopeId) : null
    const scopeMeta = g?.scopeMeta && typeof g.scopeMeta === 'object' ? g.scopeMeta : {}
    const expiresAt = g?.expiresAt ? new Date(g.expiresAt).toISOString() : null

    await sql`
      insert into entitlement_grants (
        member_id,
        entitlement_key,
        scope_id,
        scope_meta,
        expires_at,
        granted_by,
        grant_reason,
        grant_source
      )
      select
        ${params.memberId}::uuid,
        ${key},
        ${scopeId},
        ${JSON.stringify(scopeMeta)}::jsonb,
        ${expiresAt}::timestamptz,
        'share_token',
        'share_token_redeem',
        'share_token'
      where not exists (
        select 1
        from entitlement_grants eg
        where eg.member_id = ${params.memberId}::uuid
          and eg.entitlement_key = ${key}
          and coalesce(eg.scope_id,'') = coalesce(${scopeId ?? ''},'')
          and eg.revoked_at is null
          and (eg.expires_at is null or eg.expires_at > now())
      )
    `
  }

  return {ok: true, tokenId: row.id, scopeId: row.scope_id, kind: row.kind, grants}
}

export async function validateShareToken(params: {
  token: string
  expectedScopeId?: string | null
  anonId?: string | null
  resourceKind?: string
  resourceId?: string | null
  action?: string // default: 'access'
}): Promise<
  | {ok: true; tokenId: string; scopeId: string | null; kind: string; grants: TokenGrant[]}
  | {ok: false; code: 'INVALID' | 'EXPIRED' | 'REVOKED' | 'SCOPE_MISMATCH' | 'CAP_REACHED'}
> {
  const tokenHash = hashShareToken((params.token ?? '').trim())
  if (!tokenHash) return {ok: false, code: 'INVALID'}

  const row = await loadTokenRow(tokenHash)
  if (!row) return {ok: false, code: 'INVALID'}
  if (row.revoked_at) return {ok: false, code: 'REVOKED'}
  if (isExpired(row.expires_at)) return {ok: false, code: 'EXPIRED'}

  const expectedScopeId = params.expectedScopeId ?? null
  if (expectedScopeId && row.scope_id && row.scope_id !== expectedScopeId) {
    return {ok: false, code: 'SCOPE_MISMATCH'}
  }

  const action = normalizeAction(params.action, 'access')

  if (typeof row.max_redemptions === 'number' && row.max_redemptions > 0) {
    const reached = await capReached({tokenId: row.id, max: row.max_redemptions, action})
    if (reached) return {ok: false, code: 'CAP_REACHED'}
  }

  const grants = coerceTokenGrants(row.grants)

  await logPlay({
    tokenId: row.id,
    memberId: null,
    anonId: params.anonId ?? null,
    resourceKind: params.resourceKind ?? 'album',
    resourceId: params.resourceId ?? row.scope_id ?? null,
    action,
  })

  return {ok: true, tokenId: row.id, scopeId: row.scope_id, kind: row.kind, grants}
}
