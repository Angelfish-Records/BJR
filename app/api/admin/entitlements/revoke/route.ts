// web/app/api/admin/entitlements/revoke/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

type Body = {grantId?: string; memberId?: string; key?: string; scopeId?: string | null; reason?: string | null}

export async function POST(req: Request) {
  try {
    await requireAdminMemberId()

    const raw: unknown = await req.json().catch(() => null)
    const b = raw as Partial<Body>
    const reason = (b.reason ?? 'admin_revoke').toString()

    // Prefer revoking by grantId (precise, avoids multiple-row surprises)
    const grantId = (b.grantId ?? '').trim()
    if (grantId) {
      await sql`
        update entitlement_grants
        set revoked_at = now(),
            revoked_by = 'admin',
            revoke_reason = ${reason}
        where id = ${grantId}
          and revoked_at is null
      `
      return NextResponse.json({ok: true})
    }

    const memberId = (b.memberId ?? '').trim()
    const key = (b.key ?? '').trim()
    const scopeId = (b.scopeId ?? null) ? String(b.scopeId).trim() : null
    if (!memberId || !key) return NextResponse.json({ok: false, error: 'Bad request'}, {status: 400})

    await sql`
      update entitlement_grants
      set revoked_at = now(),
          revoked_by = 'admin',
          revoke_reason = ${reason}
      where member_id = ${memberId}
        and entitlement_key = ${key}
        and coalesce(scope_id,'') = coalesce(${scopeId ?? ''},'')
        and revoked_at is null
        and (expires_at is null or expires_at > now())
    `

    return NextResponse.json({ok: true})
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ok: false, error: msg}, {status: 401})
  }
}
