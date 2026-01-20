// web/app/api/artist-posts/route.ts
import {NextResponse, type NextRequest} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {client} from '@/sanity/lib/client'
import {urlFor} from '@/sanity/lib/image'
import {ensureAnonId} from '@/lib/anon'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type Visibility = 'public' | 'friend' | 'patron' | 'partner'

type SanityPostDoc = {
  _id: string
  title?: string
  slug?: {current?: string}
  publishedAt?: string
  pinned?: boolean
  visibility?: Visibility
  body?: unknown[] // portable text array; includes blocks + image objects
}

type ApiImageValue = {
  _type: 'image'
  url?: string
  // optional; PortalArtistPosts supports aspectRatio if present
  metadata?: {dimensions?: {width?: number; height?: number; aspectRatio?: number}}
}

type ApiPost = {
  slug: string
  title?: string
  publishedAt: string
  pinned?: boolean
  visibility: Visibility
  body: unknown[]
}

type OkResponse = {
  ok: true
  requiresAuth: false
  posts: ApiPost[]
  nextCursor: string | null
  correlationId: string
}

type AuthGateResponse = {
  ok: true
  requiresAuth: true
  posts: []
  nextCursor: null
  correlationId: string
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return def
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function asVisibility(v: string | null): Visibility {
  const s = (v ?? '').trim().toLowerCase()
  if (s === 'friend' || s === 'patron' || s === 'partner') return s
  return 'public'
}

function visibilityRank(v: Visibility): number {
  if (v === 'partner') return 3
  if (v === 'patron') return 2
  if (v === 'friend') return 1
  return 0
}

function canSee(min: Visibility, viewer: Visibility): boolean {
  return visibilityRank(viewer) >= visibilityRank(min)
}

function getSeenCountFromCookie(req: NextRequest): number {
  const raw = req.cookies.get('af_posts_seen')?.value ?? '0'
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function setSeenCountCookie(res: NextResponse, n: number) {
  res.cookies.set('af_posts_seen', String(Math.max(0, Math.floor(n))), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  })
}

const postsQuery = `
  *[_type == "artistPost" && defined(slug.current)]
    | order(pinned desc, publishedAt desc)[$offset...$end]{
      _id,
      title,
      slug,
      publishedAt,
      pinned,
      visibility,
      body
    }
`

export async function GET(req: NextRequest) {
  const correlationId =
    req.headers.get('x-correlation-id') ?? crypto.randomUUID()

  const url = new URL(req.url)
  const limit = clampInt(url.searchParams.get('limit'), 10, 1, 30)
  const offset = clampInt(url.searchParams.get('offset'), 0, 0, 10_000)
  const requireAuthAfter = clampInt(url.searchParams.get('requireAuthAfter'), 3, 0, 50)
  const minVisibility = asVisibility(url.searchParams.get('minVisibility'))

  const {userId} = await auth()

  // Create response early so anon cookie can be persisted if newly minted
  const res = NextResponse.json<OkResponse>(
    {ok: true, requiresAuth: false, posts: [], nextCursor: null, correlationId},
    {status: 200}
  )

  // ✅ anon id (stable) + persistence when new
  const anon = ensureAnonId(req, res)
  const anonId = anon.anonId
  void anonId

  // Session gate for anon users (N posts per session)
  if (!userId && requireAuthAfter > 0) {
    const seen = getSeenCountFromCookie(req)
    if (seen >= requireAuthAfter) {
      return NextResponse.json<AuthGateResponse>(
        {ok: true, requiresAuth: true, posts: [], nextCursor: null, correlationId},
        {status: 200}
      )
    }
  }

  // Viewer tier for now: signed-in => friend, otherwise public.
  // Later we can derive patron/partner from entitlements if you want.
  const viewerTier: Visibility = userId ? 'friend' : 'public'

  const docs = await client.fetch<SanityPostDoc[]>(
    postsQuery,
    {offset, end: offset + limit},
    {next: {tags: ['artistPost']}}
  )

  const posts: ApiPost[] = []
  for (const d of docs) {
    const slug = d.slug?.current?.trim() ?? ''
    if (!slug) continue

    const vis: Visibility = d.visibility ?? 'public'
    if (!canSee(vis, viewerTier)) continue
    if (!canSee(minVisibility, viewerTier)) {
      // if the whole module is configured minVisibility > viewerTier,
      // you can optionally gate here; leaving as-is keeps it simple.
    }

    const body = Array.isArray(d.body) ? d.body : []
    const mappedBody = body.map((b) => {
      const obj = b as Record<string, unknown>
      if (obj?._type !== 'image') return b

      // Best-effort: render a usable URL for images
      try {
        const u = urlFor(obj).width(1600).quality(80).url()
        const out: ApiImageValue = {_type: 'image', url: u}
        return out
      } catch {
        return b
      }
    })

    posts.push({
      slug,
      title: typeof d.title === 'string' ? d.title : undefined,
      publishedAt: typeof d.publishedAt === 'string' ? d.publishedAt : new Date().toISOString(),
      pinned: Boolean(d.pinned),
      visibility: vis,
      body: mappedBody,
    })
  }

  const nextCursor = docs.length === limit ? String(offset + limit) : null

  // If cookie missing, seed it so the “session” exists
  if (!userId) {
    const cur = req.cookies.get('af_posts_seen')?.value
    if (!cur) setSeenCountCookie(res, 0)
  }

  // Return the real payload by mutating the response body via a fresh json response
  // (NextResponse bodies are immutable once created).
  return NextResponse.json<OkResponse>(
    {ok: true, requiresAuth: false, posts, nextCursor, correlationId},
    {status: 200, headers: res.headers} // keep set-cookie from anon seeding
  )
}
