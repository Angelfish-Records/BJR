import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

export async function GET() {
  await requireAdminMemberId()
  const r = await sql<{count: number}>`
    select count(*)::int as count
    from members_sendable_marketing
    where email is not null and lower(email::text) <> ''
  `
  return NextResponse.json({count: r.rows[0]?.count ?? 0})
}
