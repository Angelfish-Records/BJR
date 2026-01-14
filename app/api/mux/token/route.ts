// web/app/api/mux/token/route.ts
import {NextRequest, NextResponse} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {importPKCS8, SignJWT} from 'jose'
import crypto from 'crypto'
import {countAnonDistinctCompletedTracks, newCorrelationId} from '@/lib/events'
import {checkAccess} from '@/lib/access'
import {ACCESS_ACTIONS, ENTITLEMENTS} from '@/lib/vocab'

type TokenReq = {
  playbackId: string
  trackId?: string
  albumId?: string // stable canonical album id (label catalogue id)
  durationMs?: number
}

type TokenOk = {ok: true; token: string; expiresAt: number; correlationId: string}

type TokenBlocked = {
  ok: false
  blocked: true
  code: 'AUTH_REQUIRED' | 'ANON_CAP_REACHED' | 'ENTITLEMENT_REQUIRED' | 'EMBARGO' | 'INVALID_REQUEST'
  reason: string
  action?: 'login' | 'subscribe' | 'buy' | 'wait'
  correlationId: string
}

const AUD = 'v'
const ANON_COOKIE = 'af_anon'
const ANON_DISTINCT_TRACK_CAP = 3
const ANON_WINDOW_DAYS = 30

function mustEnv(...names: string[]) {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim()) return v.trim()
  }
  throw new Error(`Missing env var: one of [${names.join(', ')}]`)
}

function blocked(
  correlationId: string,
  code: TokenBlocked['code'],
  reason: string,
  action?: TokenBlocked['action'],
  status: number = 403
) {
  const out: TokenBlocked = {ok: false, blocked: true, code, reason, action, correlationId}
  return NextResponse.json(out, {status})
}

function normalizePemMaybe(input: string): string {
  const raw = (input ?? '').trim()
  const looksLikePem = raw.includes('-----BEGIN ') && raw.includes('-----END ')
  if (looksLikePem) return raw.replace(/\\n/g, '\n')
  return Buffer.from(raw, 'base64').toString('utf8').trim().replace(/\\n/g, '\n')
}

function toPkcs8Pem(pem: string): string {
  if (pem.includes('-----BEGIN PRIVATE KEY-----')) return pem
  const keyObj = crypto.createPrivateKey(pem)
  return keyObj.export({format: 'pem', type: 'pkcs8'}) as string
}

function getAnonId(req: NextRequest) {
  const c = req.cookies.get(ANON_COOKIE)?.value
  if (c && /^[a-zA-Z0-9_-]{16,}$/.test(c)) return c
  return crypto.randomBytes(18).toString('base64url')
}

function persistAnonId(res: NextResponse, anonId: string) {
  res.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

async function getMemberIdByClerkUserId(userId: string): Promise<string | null> {
  const {sql} = await import('@vercel/postgres')
  if (!userId) return null
  const r = await sql<{id: string}>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `
  return (r.rows?.[0]?.id as string | undefined) ?? null
}

function computeAlbumScopeId(body: TokenReq | null): string | null {
  const rawAlbumId = (body?.albumId ?? '').trim()
  if (rawAlbumId) return `alb:${rawAlbumId}`
  return null
}

export async function POST(req: NextRequest) {
  const correlationId = newCorrelationId()

  let body: TokenReq | null = null
  try {
    body = (await req.json()) as TokenReq
  } catch {
    body = null
  }

  const playbackId = body?.playbackId
  if (!playbackId || typeof playbackId !== 'string') {
    return blocked(correlationId, 'INVALID_REQUEST', 'Missing playbackId', undefined, 400)
  }

  const {userId} = await auth()
  const anonId = getAnonId(req)

  // ---- Anonymous cap (REAL): based on completed playthrough events in Neon ----
  if (!userId) {
    const distinctCompleted = await countAnonDistinctCompletedTracks({anonId, sinceDays: ANON_WINDOW_DAYS})
    if (distinctCompleted >= ANON_DISTINCT_TRACK_CAP) {
      const res = blocked(
        correlationId,
        'ANON_CAP_REACHED',
        'Anonymous listening limit reached. Please log in to continue.',
        'login',
        403
      )
      persistAnonId(res, anonId)
      return res
    }
  }

  // ---- Logged-in access: require album context (album is canonical) ----
  if (userId) {
    const memberId = await getMemberIdByClerkUserId(userId)
    if (!memberId) {
      const res = blocked(
        correlationId,
        'AUTH_REQUIRED',
        'Signed in, but your member profile is still being created. Refresh in a moment.',
        'wait',
        403
      )
      persistAnonId(res, anonId)
      return res
    }

    const albumScopeId = computeAlbumScopeId(body)
    if (!albumScopeId) {
      const res = blocked(
        correlationId,
        'INVALID_REQUEST',
        'Missing albumId (canonical album context).',
        undefined,
        400
      )
      persistAnonId(res, anonId)
      return res
    }

    const decision = await checkAccess(
      memberId,
      {kind: 'album', albumScopeId, required: [ENTITLEMENTS.PLAY_ALBUM]},
      {log: true, action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE, correlationId}
    )

    if (!decision.allowed) {
      const res = blocked(
        correlationId,
        'ENTITLEMENT_REQUIRED',
        'You do not have access to play this album.',
        'subscribe',
        403
      )
      persistAnonId(res, anonId)
      return res
    }
  }

  // ---- Mux Secure Playback signing ----
  const keyId = mustEnv('MUX_SIGNING_KEY_ID', 'MUX_PLAYBACK_SIGNING_KEY_ID')
  const raw = mustEnv('MUX_SIGNING_KEY_SECRET', 'MUX_SIGNING_PRIVATE_KEY', 'MUX_PLAYBACK_SIGNING_PRIVATE_KEY')

  const pkcs8Pem = toPkcs8Pem(normalizePemMaybe(raw))
  const pk = await importPKCS8(pkcs8Pem, 'RS256')

  const now = Math.floor(Date.now() / 1000)
  const baseTtl = Number(process.env.MUX_TOKEN_TTL_SECONDS ?? 900)

  const durSecHint =
    typeof body?.durationMs === 'number' && Number.isFinite(body.durationMs) && body.durationMs > 0
      ? Math.ceil(body.durationMs / 1000)
      : 0

  const minForDuration = durSecHint > 0 ? durSecHint + 120 : 0
  const ttl = Math.min(Math.max(baseTtl, minForDuration, 60), 60 * 60 * 2)
  const exp = now + ttl

  const playbackRestrictionId = process.env.MUX_PLAYBACK_RESTRICTION_ID?.trim() || undefined

  const jwt = await new SignJWT({
    sub: playbackId,
    aud: AUD,
    exp,
    ...(playbackRestrictionId ? {playback_restriction_id: playbackRestrictionId} : {}),
  })
    .setProtectedHeader({alg: 'RS256', kid: keyId, typ: 'JWT'})
    .sign(pk)

  const out: TokenOk = {ok: true, token: jwt, expiresAt: exp, correlationId}
  const res = NextResponse.json(out)
  persistAnonId(res, anonId)
  return res
}
