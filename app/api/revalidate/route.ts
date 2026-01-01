import {revalidatePath, revalidateTag} from 'next/cache'

type SanityWebhookPayload = {
  _type?: string
  type?: string
  document?: {
    _type?: string
  }
}

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

export async function POST(req: Request) {
  const expected = process.env.SANITY_REVALIDATE_SECRET || ''
  if (!expected) return new Response('Missing SANITY_REVALIDATE_SECRET', {status: 500})

  const provided = getAuthSecret(req)
  if (provided !== expected) return new Response('Unauthorized', {status: 401})

  let body: SanityWebhookPayload | null = null
  try {
    body = (await req.json()) as SanityWebhookPayload
  } catch {}

  const docType = body?._type ?? body?.type ?? body?.document?._type ?? null

  if (!docType || docType === 'landingPage') {
    revalidateTag('landingPage', 'default')
    revalidatePath('/')
  }

  return Response.json({ok: true})
}
