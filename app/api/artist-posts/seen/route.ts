// web/app/api/artist-posts/seen/route.ts
import {NextResponse, type NextRequest} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {ensureAnonId} from '@/lib/anon'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Body = {slug?: string}

function readSeenList(req: NextRequest): string[] {
  const raw = req.cookies.get('af_posts_seen_list')?.value ?? ''
  if (!raw) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
  } catch {
    return []
  }
}

function writeSeenList(res: NextResponse, list: string[]) {
  const trimmed = list.slice(-50)
  res.cookies.set('af_posts_seen_list', JSON.stringify(trimmed), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

function getSeenCount(req: NextRequest): number {
  const raw = req.cookies.get('af_posts_seen')?.value ?? '0'
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function setSeenCount(res: NextResponse, n: number) {
  res.cookies.set('af_posts_seen', String(Math.max(0, Math.floor(n))), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

export async function POST(req: NextRequest) {
  const correlationId =
    req.headers.get('x-correlation-id') ?? crypto.randomUUID()


  const {userId} = await auth()

  const res = NextResponse.json({ok: true, correlationId}, {status: 200})

  // keep anon stable + persist cookie if needed
  const anon = ensureAnonId(req, res)
  void anon.anonId

  // Signed-in users are not gated; accept call but don’t mutate anon counters
  if (userId) return res

  let json: Body = {}
  try {
    json = (await req.json()) as Body
  } catch {}

  const slug = (json.slug ?? '').trim()
  if (!slug) {
    return NextResponse.json({ok: false, error: 'missing_slug', correlationId}, {status: 400})
  }

  const seenList = readSeenList(req)
  const already = seenList.includes(slug)

  if (!already) {
    writeSeenList(res, [...seenList, slug])
    setSeenCount(res, getSeenCount(req) + 1)
  }

  return NextResponse.json({ok: true, already, correlationId}, {status: 200, headers: res.headers})
}
