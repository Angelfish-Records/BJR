// web/app/api/albums/[slug]/route.ts
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

// Small, explicit ordering (adjust if you add tiers later)
function tierAtLeast(actual: string, required: string) {
  if (!required) return true
  const order = ['none', 'friend', 'patron', 'partner']
  const ai = order.indexOf(actual)
  const ri = order.indexOf(required)
  if (ri < 0) return false
  return ai >= ri
}

export async function GET(_req: NextRequest, context: {params: Promise<{slug: string}>}) {
  const {slug} = await context.params

  const {userId} = await auth()
  const tier = await getMemberTier(userId ?? null)

  const data = await getAlbumBySlug(slug)
  if (!data.album) {
    return NextResponse.json({ok: false, error: 'NOT_FOUND'}, {status: 404})
  }

  const policy = data.album.policy

  // hide from everyone if not visible
  if (policy?.publicPageVisible === false) {
    return NextResponse.json({ok: false, error: 'HIDDEN'}, {status: 404})
  }

  // "minTierToLoad" = browse-click gate (your scenario #2)
  const required = (policy?.minTierToLoad ?? '').toString().trim()
  if (required && !tierAtLeast(tier, required)) {
    return NextResponse.json({ok: false, error: 'TIER_REQUIRED', required}, {status: 403})
  }

  return NextResponse.json({
    ok: true,
    album: data.album,
    tracks: data.tracks,
  })
}
