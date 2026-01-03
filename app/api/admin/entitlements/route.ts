// web/app/api/admin/entitlements/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {
  normalizeEmail,
  assertLooksLikeEmail,
  ensureMemberByEmail,
} from '../../../../lib/members'

function requireAdmin(req: Request) {
  const got = req.headers.get('x-admin-secret') ?? ''
  const expected = process.env.ADMIN_API_SECRET ?? ''
  if (!expected || got !== expected) {
    throw new Error('Unauthorized')
  }
}

type GrantInput = {
  key: string
  scopeId?: string | null
  scopeMeta?: Record<string, unknown>
  expiresAt?: string | null
}

type RevokeInput = {
  key: string
  scopeId?: string | null
}

type Body = {
  email: string
  grant?: GrantInput[]
  revoke?: RevokeInput[]
  reason?: string
}

function isBody(x: unknown): x is Body {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.email !== 'string') return false

  if (o.grant && !Array.isArray(o.grant)) return false
  if (o.revoke && !Array.isArray(o.revoke)) return false

  return true
}

export async function POST(req: Request) {
  try {
    requireAdmin(req)

    const raw: unknown = await req.json().catch(() => null)
    if (!isBody(raw)) {
      return NextResponse.json(
        {ok: false, error: 'Bad request'},
        {status: 400}
      )
    }

    const body = raw
    const email = normalizeEmail(body.email)
    assertLooksLikeEmail(email)

    const reason = body.reason ?? 'admin_update'

    // Ensure member exists (early-access safe)
    const ensured = await ensureMemberByEmail({
      email,
      source: 'admin_entitlements',
      sourceDetail: {reason},
    })
    const memberId = ensured.id

    // ---- Grants ----
    for (const g of body.grant ?? []) {
      await sql`
        insert into entitlement_grants (
          member_id,
          entitlement_key,
          scope_id,
          scope_meta,
          granted_by,
          grant_reason,
          grant_source
        )
        select
          ${memberId},
          ${g.key},
          ${g.scopeId ?? null},
          ${JSON.stringify(g.scopeMeta ?? {})}::jsonb,
          'admin',
          ${reason},
          'admin_api'
        where not exists (
          select 1
          from entitlement_grants eg
          where eg.member_id = ${memberId}
            and eg.entitlement_key = ${g.key}
            and coalesce(eg.scope_id,'') = coalesce(${g.scopeId ?? ''},'')
            and eg.revoked_at is null
            and (eg.expires_at is null or eg.expires_at > now())
        )
      `
    }

    // ---- Revokes ----
    for (const r of body.revoke ?? []) {
      await sql`
        update entitlement_grants
        set revoked_at = now(),
            revoked_by = 'admin',
            revoke_reason = ${reason}
        where member_id = ${memberId}
          and entitlement_key = ${r.key}
          and coalesce(scope_id,'') = coalesce(${r.scopeId ?? ''},'')
          and revoked_at is null
          and (expires_at is null or expires_at > now())
      `
    }

    const current = await sql`
      select entitlement_key, scope_id, scope_meta
      from member_entitlements_current
      where member_id = ${memberId}
    `

    return NextResponse.json({
      ok: true,
      memberId,
      email,
      entitlements: current.rows,
    })
  } catch (e) {
    const message =
      e instanceof Error ? e.message : 'error'

    return NextResponse.json(
      {ok: false, error: message},
      {status: 401}
    )
  }
}
