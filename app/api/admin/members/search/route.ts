// web/app/api/admin/members/search/route.ts
import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'
import {normalizeEmail} from '@/lib/members'

export async function GET(req: Request) {
  try {
    await requireAdminMemberId()

    const url = new URL(req.url)
    const q = (url.searchParams.get('q') ?? '').trim()
    if (!q) return NextResponse.json({ok: true, members: []})

    const qNorm = normalizeEmail(q)

    const r = await sql<{
      id: string
      email: string
      clerk_user_id: string | null
      created_at: string
    }>`
      select id, email, clerk_user_id, created_at
      from members
      where email ilike ${qNorm + '%'}
      order by created_at desc
      limit 25
    `

    return NextResponse.json({ok: true, members: r.rows})
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'error'
    return NextResponse.json({ok: false, error: msg}, {status: 401})
  }
}
