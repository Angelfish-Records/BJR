import {NextRequest, NextResponse} from 'next/server'
import {auth} from '@clerk/nextjs/server'
import {getAlbumBySlug} from '@/lib/albums'
import {sql} from '@vercel/postgres'
import {deriveTier} from '@/lib/vocab'

async function getMemberTier(userId: string | null) {
  if (!userId) return 'none'
  const r = await sql<{entitlement_key: string}>`
    select entitlement_key
    from member_entitlements_current
    where member_id = (
      select id from members where clerk_user_id = ${userId} limit 1
    )
  `
  return deriveTier(r.rows.map((x) => x.entitlement_key))
}

export async function GET(
  _req: NextRequest,
  {params}: {params: {slug: string}}
) {
  const {userId} = await auth()
  const tier = await getMemberTier(userId)

  const data = await getAlbumBySlug(params.slug)
  if (!data.album) {
    return NextResponse.json({ok: false, error: 'NOT_FOUND'}, {status: 404})
  }

  const policy = data.album.policy

  if (!policy?.publicPageVisible) {
    return NextResponse.json({ok: false, error: 'HIDDEN'}, {status: 404})
  }

  if (policy?.minTierToLoad && tier !== 'partner' && tier !== policy.minTierToLoad) {
    return NextResponse.json(
      {ok: false, error: 'TIER_REQUIRED', required: policy.minTierToLoad},
      {status: 403}
    )
  }

  return NextResponse.json({
    ok: true,
    album: data.album,
    tracks: data.tracks,
  })
}
