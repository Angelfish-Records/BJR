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

// Stub for now, but references args so eslint doesn’t complain.
// Replace with Neon-backed policy without touching AudioEngine.
async function hasPlaybackEntitlement(userId: string, albumSlug?: string, trackId?: string) {
  // If you ever reach this with no userId, it’s a bug upstream.
  if (!userId) return false

  // Placeholder “shape” of future policy:
  // - if we know the album or track, we *could* check entitlements
  // - for now, any logged-in user is allowed
  void albumSlug
  void trackId
  return true
}

export async function POST(req: NextRequest) {
  let body: TokenReq | null = null
  try {
    body = (await req.json()) as TokenReq
  } catch {
    body = null
  }

  const playbackId = body?.playbackId
  if (!playbackId || typeof playbackId !== 'string') {
    return blocked('INVALID_REQUEST', 'Missing playbackId', undefined, 400)
  }

  const {userId} = await auth()
  const anonId = getAnonId(req)

  // Anonymous cap: temporary (counts mints, not completions).
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
  const privateKeyB64 = mustEnv(
    'MUX_SIGNING_KEY_SECRET',
    'MUX_SIGNING_PRIVATE_KEY',
    'MUX_PLAYBACK_SIGNING_PRIVATE_KEY'
  )

  const pem = Buffer.from(privateKeyB64, 'base64').toString('utf8')

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

  const pk = await importPKCS8(pem, 'RS256')
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

  // TEMP: still counts mints; next stage will move this to playthrough completion.
  if (!userId) {
    const count = getAnonListenCount(req)
    bumpAnonListenCount(res, count + 1)
  }

  return res
}
