import {revalidatePath, revalidateTag} from 'next/cache'

type SanityWebhookPayload = {
  _id?: string
  _type?: string
  type?: string
  document?: {
    _id?: string
    _type?: string
  }
}

const CACHE_PROFILE = 'default' as const

function getAuthSecret(req: Request): string {
  const auth = req.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(.+)$/i)
  if (m?.[1]) return m[1].trim()

  const headerSecret = req.headers.get('x-webhook-secret')
  if (headerSecret) return headerSecret.trim()

  const url = new URL(req.url)
  const qsSecret = url.searchParams.get('secret')
  if (qsSecret) return qsSecret.trim()

  return ''
}

function getDocMeta(body: SanityWebhookPayload | null): {docType: string | null; docId: string | null} {
  const docType = body?._type ?? body?.type ?? body?.document?._type ?? null
  const docId = body?._id ?? body?.document?._id ?? null
  return {docType, docId}
}

export async function POST(req: Request) {
  const expected = process.env.SANITY_REVALIDATE_SECRET || ''
  if (!expected) return new Response('Missing SANITY_REVALIDATE_SECRET', {status: 500})

  const provided = getAuthSecret(req)
  if (provided !== expected) return new Response('Unauthorized', {status: 401})

  let body: SanityWebhookPayload | null = null
  try {
    body = (await req.json()) as SanityWebhookPayload
  } catch {}

  const {docType, docId} = getDocMeta(body)

  const reTag = (t: string) => revalidateTag(t, CACHE_PROFILE)

  // Back-compat: missing docType => treat as landing change.
  if (!docType) {
    reTag('landingPage')
    revalidatePath('/')
    return Response.json({ok: true, docType: null, docId, revalidated: ['landingPage'], path: '/'})
  }

  const tags: string[] = []

  // Landing singleton (support both type-based and id-based routing)
  if (docType === 'landingPage' || docId === 'landingPage') {
    tags.push('landingPage')
    revalidatePath('/')
  }

  // Site flags singleton
  if (docType === 'siteFlags' || docId === 'siteFlags') tags.push('siteFlags')

  // Shadow home pages
  if (docType === 'shadowHomePage') tags.push('shadowHome')

  // Never silently ignore: if we don't recognize the doc type, do a cheap safe refresh.
  if (tags.length === 0) {
    tags.push('landingPage')
    revalidatePath('/')
    for (const t of tags) reTag(t)
    return Response.json({
      ok: true,
      docType,
      docId,
      revalidated: tags,
      note: 'Unknown docType; defaulted to landingPage revalidation',
      path: '/',
    })
  }

  for (const t of tags) reTag(t)

  return Response.json({ok: true, docType, docId, revalidated: tags})
}
