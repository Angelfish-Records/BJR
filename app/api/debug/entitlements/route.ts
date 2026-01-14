// web/app/api/debug/entitlements/route.ts
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {ensureMemberByEmail, normalizeEmail} from '@/lib/members'
import {listCurrentEntitlementKeys} from '@/lib/entitlements'

function firstParam(v: string | string[] | null): string | null {
  if (!v) return null
  return Array.isArray(v) ? v[0] ?? null : v
}

export async function GET(req: Request) {
  const url = new URL(req.url)

  const emailRaw = firstParam(url.searchParams.getAll('email'))
  const tokenRaw = firstParam(url.searchParams.getAll('token'))

  const requiredToken = process.env.SOFT_IDENTITY_TOKEN || ''
  const allowInProd = process.env.ALLOW_SOFT_IDENTITY_IN_PROD === 'true'
  const isProd = process.env.NODE_ENV === 'production'

  const tokenOk = !isProd ? true : Boolean(allowInProd && requiredToken && tokenRaw === requiredToken)

  if (!tokenOk) {
    return NextResponse.json(
      {ok: false, reason: 'token_invalid', isProd, allowInProd, hasRequiredToken: Boolean(requiredToken)},
      {status: 401}
    )
  }

  if (!emailRaw || !emailRaw.includes('@')) {
    return NextResponse.json({ok: false, reason: 'missing_email'}, {status: 400})
  }

  const email = normalizeEmail(emailRaw)

  // Fingerprint the DB this runtime is actually connected to
  const fp = await sql`
    select
      current_database() as db,
      current_user as "user",
      inet_server_addr()::text as server_addr,
      inet_server_port() as server_port,
      version() as version
  `

  const ensured = await ensureMemberByEmail({
    email,
    source: 'debug_api',
    sourceDetail: {route: '/api/debug/entitlements'},
  })

  const keys = await listCurrentEntitlementKeys(ensured.id)

  return NextResponse.json({
    ok: true,
    email,
    memberId: ensured.id,
    memberCreatedThisCall: ensured.created,
    entitlementCount: keys.length,
    entitlementKeys: keys,
    dbFingerprint: fp.rows[0],
  })
}
