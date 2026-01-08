import 'server-only'
import {NextResponse} from 'next/server'
import {getAlbumBySlug} from '@/lib/albums'

export async function GET(
  _req: Request,
  ctx: {params: Promise<{slug: string}>}
) {
  const {slug} = await ctx.params
  const data = await getAlbumBySlug(slug)
  return NextResponse.json(data)
}
