// web/app/api/mux/token/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {importPKCS8, SignJWT} from 'jose'
import crypto from 'crypto'
import {countAnonDistinctCompletedTracks, newCorrelationId} from '@/lib/events'
import {ACCESS_ACTIONS} from '@/lib/vocab'
import {validateShareToken} from '@/lib/shareTokens'
import {decideAlbumPlaybackAccess} from '@/lib/accessOracle'
import {ensureAnonId} from '@/lib/anon'

type TokenReq = {
  playbackId: string
  trackId?: string
  albumId?: string
  durationMs?: number
  st?: string
}

type TokenOk = {ok: true; token: string; expiresAt: number; correlationId: string}

type TokenBlocked = {
  ok: false
  blocked: true
  code:
    | 'AUTH_REQUIRED'
    | 'ANON_CAP_REACHED'
    | 'ENTITLEMENT_REQUIRED'
    | 'EMBARGO'
    | 'TIER_REQUIRED'
    | 'INVALID_REQUEST'
    | 'PROVISIONING'
    | 'CAP_REACHED'
  reason: string
  action?: 'login' | 'subscribe' | 'buy' | 'wait'
  correlationId: string
}

const AUD = 'v'
const ANON_DISTINCT_TRACK_CAP = 3
const ANON_WINDOW_DAYS = 30

function mustEnv(...names: string[]) {
  for (const n of names) {
    const v = process.env[n]
    if (v && v.trim()) return v.trim()
  }
  throw new Error(`Missing env var: one of [${names.join(', ')}]`)
}

function normalizeAlbumId(raw: string): string {
  let s = (raw ?? '').trim()
  if (!s) return ''
  while (s.startsWith('alb:')) s = s.slice(4)
  return s.trim()
}

function respondBlocked(
  req: NextRequest,
  correlationId: string,
  code: TokenBlocked['code'],
  reason: string,
  action?: TokenBlocked['action'],
  status: number = 403
) {
  const out: TokenBlocked = {ok: false, blocked: true, code, reason, action, correlationId}
  const res = NextResponse.json(out, {status})
  res.headers.set('x-correlation-id', correlationId)
  ensureAnonId(req, res) // ✅ persist cookie consistently
  return res
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
    return respondBlocked(req, correlationId, 'INVALID_REQUEST', 'Missing playbackId', undefined, 400)
  }

  const rawAlbumId = (body?.albumId ?? '').trim()
  if (!rawAlbumId) {
    return respondBlocked(req, correlationId, 'INVALID_REQUEST', 'Missing albumId (canonical album context).', undefined, 400)
  }
  const albumId = normalizeAlbumId(rawAlbumId)
  if (!albumId) {
    return respondBlocked(req, correlationId, 'INVALID_REQUEST', 'Missing albumId (canonical album context).', undefined, 400)
  }
  const albumScopeId = `alb:${albumId}`

  const {userId} = await auth()

  // ✅ stable anon id (cookie-backed)
  const {anonId} = ensureAnonId(req)

  const url = new URL(req.url)
  const st =
    (body?.st ?? '').trim() ||
    (url.searchParams.get('st') ?? '').trim() ||
    (url.searchParams.get('share') ?? '').trim()

// NOTE: Share tokens grant album *access*.
// Playback is a consequence of access, not a separate capability.

  // ---- Capability mode via share token ----
  let tokenAllowsPlayback = false
  if (st) {
    const v = await validateShareToken({
      token: st,
      expectedScopeId: albumScopeId,
      anonId,
      resourceKind: 'album',
      resourceId: albumScopeId,
      action: 'access',
    })

    tokenAllowsPlayback = v.ok
    if (!v.ok) {
      if (v.code === 'CAP_REACHED') {
        return respondBlocked(req, correlationId, 'CAP_REACHED', 'Share link cap reached.', 'login', 403)
      }
      return respondBlocked(req, correlationId, 'ENTITLEMENT_REQUIRED', 'Invalid or expired share token.', 'login', 403)
    }
  }

  // ---- Anonymous cap ----
  if (!userId && !tokenAllowsPlayback) {
    const distinctCompleted = await countAnonDistinctCompletedTracks({anonId, sinceDays: ANON_WINDOW_DAYS})
    if (distinctCompleted >= ANON_DISTINCT_TRACK_CAP) {
      return respondBlocked(
        req,
        correlationId,
        'ANON_CAP_REACHED',
        'Please enter an email address to continue listening for free.',
        'login',
        403
      )
    }
  }

  // ---- Logged-in access via oracle ----
  if (userId && !tokenAllowsPlayback) {
    const memberId = await getMemberIdByClerkUserId(userId)
    if (!memberId) {
      return respondBlocked(
        req,
        correlationId,
        'PROVISIONING',
        'Signed in, but your member profile is still being created. Refresh in a moment.',
        'wait',
        403
      )
    }

    const d = await decideAlbumPlaybackAccess({
      memberId,
      albumId,
      correlationId,
      action: ACCESS_ACTIONS.PLAYBACK_TOKEN_ISSUE,
    })

    if (!d.allowed) {
      const code: TokenBlocked['code'] =
        d.code === 'INVALID_REQUEST'
          ? 'INVALID_REQUEST'
          : d.code === 'EMBARGO'
            ? 'EMBARGO'
            : d.code === 'TIER_REQUIRED'
              ? 'TIER_REQUIRED'
              : d.code === 'PROVISIONING'
                ? 'PROVISIONING'
                : 'ENTITLEMENT_REQUIRED'

      return respondBlocked(req, correlationId, code, d.reason, d.action ?? undefined, 403)
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
  res.headers.set('x-correlation-id', correlationId)
  ensureAnonId(req, res) // ✅ persist cookie if missing/invalid
  return res
}
