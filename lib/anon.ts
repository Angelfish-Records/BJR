// web/lib/anon.ts
import type {NextRequest} from 'next/server'
import {NextResponse} from 'next/server'

export const ANON_COOKIE = 'af_anon'

export function getOrCreateAnonId(req: NextRequest): {anonId: string; isNew: boolean} {
  const v = (req.cookies.get(ANON_COOKIE)?.value ?? '').trim()
  if (v) return {anonId: v, isNew: false}
  return {anonId: crypto.randomUUID(), isNew: true}
}

export function persistAnonId(res: NextResponse, anonId: string) {
  res.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1y
  })
}
