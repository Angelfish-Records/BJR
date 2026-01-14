// web/app/api/admin/share-tokens/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {ENTITLEMENTS} from '@/lib/vocab'
import {createShareToken, type TokenGrant} from '@/lib/shareTokens'

function requireAdmin(req: Request) {
  const got = req.headers.get('x-admin-secret') ?? ''
  const expected = process.env.ADMIN_API_SECRET ?? ''
  if (!expected || got !== expected) throw new Error('Unauthorized')
}

type Body = {
  albumId: string
  expiresAt?: string | null // ISO
  maxRedemptions?: number | null
  note?: string | null
}

function isBody(x: unknown): x is Body {
  if (!x || typeof x !== 'object') return false
  const o = x as Record<string, unknown>
  if (typeof o.albumId !== 'string') return false
  if (o.expiresAt != null && typeof o.expiresAt !== 'string') return false
  if (o.maxRedemptions != null && typeof o.maxRedemptions !== 'number') return false
  if (o.note != null && typeof o.note !== 'string') return false
  return true
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length ? s : null
}

function parseExpiresAt(expiresAt: string | null | undefined): string | null {
  const s = cleanStr(expiresAt)
  if (!s) return null
  const t = Date.parse(s)
  if (!Number.isFinite(t)) throw new Error('expiresAt must be an ISO date string')
  return new Date(t).toISOString()
}

export async function POST(req: Request) {
  try {
    requireAdmin(req)

    const raw: unknown = await req.json().catch(() => null)
    if (!isBody(raw)) {
      return NextResponse.json({ok: false, error: 'Bad request'}, {status: 400})
    }

    const albumId = (raw.albumId ?? '').trim()
    if (!albumId) {
      return NextResponse.json({ok: false, error: 'albumId is required'}, {status: 400})
    }

    const maxRedemptions = raw.maxRedemptions == null ? null : Math.max(1, Math.floor(raw.maxRedemptions))
    const expiresIso = parseExpiresAt(raw.expiresAt)
    const scopeId = `alb:${albumId}`

    const note = cleanStr(raw.note)

    const grants: TokenGrant[] = [
      {
        key: ENTITLEMENTS.PLAY_ALBUM,
        scopeId,
        ...(note ? {scopeMeta: {note}} : {}),
      },
    ]

    const created = await createShareToken({
      kind: 'album_press',
      scopeId,
      grants,
      expiresAt: expiresIso,
      maxRedemptions,
      createdByMemberId: null,
    })

    return NextResponse.json({
      ok: true,
      token: created.token,
      tokenId: created.tokenId,
      kind: created.kind,
      scopeId: created.scopeId,
      expiresAt: created.expiresAt,
      maxRedemptions: created.maxRedemptions,
      createdAt: created.createdAt,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ok: false, error: message}, {status: 401})
  }
}
