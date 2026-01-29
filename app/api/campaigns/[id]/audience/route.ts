import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

export const runtime = 'nodejs'

export async function GET() {
  const r = await sql<{count: number}>`select count(*)::int as count from members_sendable_marketing`
  return NextResponse.json({count: r.rows[0]?.count ?? 0})
}
