// web/app/api/mux/token/route.ts
import {NextRequest, NextResponse} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {importPKCS8, SignJWT} from 'jose'
import crypto from 'crypto'

type TokenReq = {
  playbackId: string
  trackId?: string
  albumSlug?: string
  durationMs?: number
}

type TokenOk = {ok: true; token: string; expiresAt: number}

type TokenBlocked = {
  ok: false
  blocked: true
  code: 'AUTH_REQUIRED' | 'ANON_CAP_REACHED' | 'ENTITLEMENT_REQUIRED' | 'EMBARGO' | 'INVALID_REQUEST'
  reason: string
  action?: 'login' | 'subscribe' | 'buy' | 'wait'
}

const AUD = 'v'

function mustEnv(...names: string[]) {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim()) return v.trim()
  }
  throw new Error(`Missing env var: one of [${names.join(', ')}]`)
}

function blocked(
  code: TokenBlocked['code'],
  reason: string,
  action?: TokenBlocked['action'],
  status: number = 403
) {
  const out: TokenBlocked = {ok: false, blocked: true, code, reason, action}
  return NextResponse.json(out, {status})
}

// ---- Key normalization / conversion ----
// Accept either raw PEM (multiline) or base64(PEM). Normalize \\n -> \n.
// jose importPKCS8 requires PKCS#8 ("BEGIN PRIVATE KEY").
// If input is PKCS#1 ("BEGIN RSA PRIVATE KEY"), convert it losslessly to PKCS#8.
function normalizePemMaybe(input: string): string {
  const s0 = (input ?? '').trim()

  const looksLikePem = s0.includes('-----BEGIN ') && s0.includes('-----END ')
  if (looksLikePem) return s0.replace(/\\n/g, '\n')

  return Buffer.from(s0, 'base64').toString('utf8').trim().replace(/\\n/g, '\n')
}

function toPkcs8Pem(pem: string): string {
  if (pem.includes('-----BEGIN PRIVATE KEY-----')) return pem
  const keyObj = crypto.createPrivateKey(pem)
  return keyObj.export({format: 'pem', type: 'pkcs8'}) as string
}

// ---- Policy hooks (cookie-backed for now) ----
function getAnonId(req: NextRequest) {
  const c = req.cookies.get('af_anon')?.value
  if (c && /^[a-zA-Z0-9_-]{16,}$/.test(c)) return c
  return crypto.randomBytes(18).toString('base64url')
}

function persistAnonId(res: NextResponse, anonId: string) {
  res.cookies.set('af_anon', anonId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
}

function getAnonListenCount(req: NextRequest) {
  const raw = req.cookies.get('af_anon_listens')?.value
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0
}

function bumpAnonListenCount(res: NextResponse, nextCount: number) {
  res.cookies.set('af_anon_listens', String(nextCount), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

// Stub for now; references args to keep eslint quiet.
// Replace with Neon-backed policy without touching AudioEngine.
async function hasPlaybackEntitlement(userId: string, albumSlug?: string, trackId?: string) {
  if (!userId) return false
  void albumSlug
  void trackId
  return true
}

async function safeJson<T>(req: NextRequest): Promise<T | null> {
  try {
    return (await req.json()) as T
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  const body = await safeJson<TokenReq>(req)

  const playbackId = body?.playbackId
  if (!playbackId || typeof playbackId !== 'string') {
    return blocked('INVALID_REQUEST', 'Missing playbackId', undefined, 400)
  }

  const {userId} = await auth()
  const anonId = getAnonId(req)

  // Anonymous cap: TEMP (counts token mints, not playthrough completion).
  if (!userId) {
    const count = getAnonListenCount(req)
    if (count >= 3) {
      const res = blocked(
        'ANON_CAP_REACHED',
        'Anonymous listening limit reached. Please log in to continue.',
        'login',
        403
      )
      persistAnonId(res, anonId)
      return res
    }
  }

  if (userId) {
    const entitled = await hasPlaybackEntitlement(userId, body?.albumSlug, body?.trackId)
    if (!entitled) {
      const res = blocked(
        'ENTITLEMENT_REQUIRED',
        'This track is for members or purchasers.',
        'subscribe',
        403
      )
      persistAnonId(res, anonId)
      return res
    }
  }

  // ---- Mux Secure Playback signing ----
  const keyId = mustEnv('MUX_SIGNING_KEY_ID', 'MUX_PLAYBACK_SIGNING_KEY_ID')
  const rawKey = mustEnv('MUX_SIGNING_KEY_SECRET', 'MUX_SIGNING_PRIVATE_KEY', 'MUX_PLAYBACK_SIGNING_PRIVATE_KEY')

  const pemMaybe = normalizePemMaybe(rawKey)
  const pkcs8Pem = toPkcs8Pem(pemMaybe)
  const pk = await importPKCS8(pkcs8Pem, 'RS256')

  // TTL: base + ensure >= duration + buffer, capped.
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

  const out: TokenOk = {ok: true, token: jwt, expiresAt: exp}
  const res = NextResponse.json(out)

  persistAnonId(res, anonId)

  // TEMP: still counts mints; next stage will move this to playthrough completion (90%+).
  if (!userId) {
    const count = getAnonListenCount(req)
    bumpAnonListenCount(res, count + 1)
  }

  return res
}
