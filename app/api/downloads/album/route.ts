// web/app/api/downloads/album/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {auth, currentUser} from '@clerk/nextjs/server'
import {sql} from '@vercel/postgres'

import {getAlbumOffer} from '../../../../lib/albumOffers'
import {findEntitlement} from '../../../../lib/entitlements'
import {signGetObjectUrl, assertObjectExists} from '../../../../lib/r2'
import {normalizeEmail} from '../../../../lib/members'

export const runtime = 'nodejs'

function json(status: number, body: unknown) {
  return NextResponse.json(body, {status})
}

async function resolveMemberId(params: {userId: string | null; email: string | null}) {
  const {userId, email} = params

  // Prefer clerk_user_id when present (your canonical resolution order remains intact elsewhere too).
  if (userId) {
    const r = await sql`
      select id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `
    const id = (r.rows[0]?.id as string | undefined) ?? null
    if (id) return id
  }

  if (email) {
    const r = await sql`
      select id
      from members
      where email = ${email}
      limit 1
    `
    const id = (r.rows[0]?.id as string | undefined) ?? null
    if (id) return id
  }

  return null
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as null | {albumSlug?: unknown; assetId?: unknown}
  const albumSlug = (body?.albumSlug ?? '').toString().trim().toLowerCase()
  const assetId = (body?.assetId ?? 'bundle_zip').toString().trim().toLowerCase()

  if (!albumSlug) return json(400, {ok: false, error: 'Missing albumSlug'})

  const offer = getAlbumOffer(albumSlug)
  if (!offer) return json(400, {ok: false, error: 'Unknown albumSlug'})

  // v1 policy: downloads require an authenticated session (keeps abuse surface tiny)
  const {userId} = await auth()
  if (!userId) return json(401, {ok: false, error: 'Sign in required'})

  const user = await currentUser()
  const emailRaw =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null
  const email = emailRaw ? normalizeEmail(emailRaw) : null

  const memberId = await resolveMemberId({userId, email})
  if (!memberId) return json(404, {ok: false, error: 'Member not found'})

  const match = await findEntitlement(memberId, offer.entitlementKey, null, {allowGlobalFallback: true})
  if (!match) return json(403, {ok: false, error: 'Not entitled'})

  const asset = offer.assets.find((a) => a.id === assetId) ?? null
  if (!asset) return json(400, {ok: false, error: 'Unknown assetId'})

  // Fail loud if R2 is misconfigured or object missing.
  try {
    await assertObjectExists(asset.r2Key)
  } catch {
    return json(500, {ok: false, error: 'Download not available (missing object)'})
  }

  const url = await signGetObjectUrl({
    key: asset.r2Key,
    expiresInSeconds: 90,
    responseContentType: asset.contentType,
    responseContentDispositionFilename: asset.filename,
  })

  return json(200, {
    ok: true,
    url,
    albumSlug: offer.albumSlug,
    asset: {id: asset.id, label: asset.label, filename: asset.filename},
  })
}
