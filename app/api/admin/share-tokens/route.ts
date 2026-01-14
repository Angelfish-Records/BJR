// web/app/api/admin/share-tokens/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import crypto from 'crypto'

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

function sha256Hex(input: string): string {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex')
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

    const maxRedemptions =
      raw.maxRedemptions == null ? null : Math.max(1, Math.floor(raw.maxRedemptions))

    const expiresIso = parseExpiresAt(raw.expiresAt)

    // This is the *bearer token* you’ll copy into URLs as `st=...`
    // Keep it short, URL-safe, and recognizable.
    const token = `st_${crypto.randomBytes(24).toString('base64url')}`

    // Store only the hash (so DB leaks don’t leak live tokens).
    const tokenHash = sha256Hex(token)

    // Canonical album scope used everywhere else.
    const scopeId = `alb:${albumId}`

    // Grants are declarative; later you’ll redeem -> write ENTITLEMENTS.ALBUM_SHARE_GRANT scoped to scopeId.
    // For now we just store the intended grants in the token row.
    const grants = [
      {
        key: 'album_share_grant',
        scopeId,
      },
    ]

    const ins = await sql<{
      id: string
      created_at: string
      kind: string
      scope_id: string | null
      expires_at: string | null
      max_redemptions: number | null
    }>`
      insert into share_tokens (
        token_hash,
        kind,
        scope_id,
        grants,
        expires_at,
        max_redemptions
      )
      values (
        ${tokenHash},
        'album_press',
        ${scopeId},
        ${JSON.stringify(grants)}::jsonb,
        ${expiresIso}::timestamptz,
        ${maxRedemptions}
      )
      returning id, created_at, kind, scope_id, expires_at, max_redemptions
    `

    const row = ins.rows?.[0]
    if (!row?.id) {
      return NextResponse.json({ok: false, error: 'Insert failed'}, {status: 500})
    }

    return NextResponse.json({
      ok: true,
      token: token, // IMPORTANT: returned once; only the hash is stored
      tokenId: row.id,
      kind: row.kind,
      scopeId: row.scope_id,
      expiresAt: row.expires_at,
      maxRedemptions: row.max_redemptions,
      createdAt: row.created_at,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ok: false, error: message}, {status: 401})
  }
}
