import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

export const runtime = 'nodejs'

function requireActor() {
  return {actorLabel: 'admin'}
}

export async function POST(_req: NextRequest, context: {params: Promise<{id: string}>}) {
  const {id} = await context.params
  requireActor()

  const c = await sql<{locked_at: string | null}>`
    select locked_at
    from campaigns
    where id = ${id}::uuid
    limit 1
  `
  if (c.rowCount === 0) return NextResponse.json({error: 'Not found'}, {status: 404})

  const lockedAt = c.rows[0]?.locked_at ?? null
  if (!lockedAt) return NextResponse.json({error: 'Campaign must be locked before queueing'}, {status: 400})

  const inserted = await sql`
    insert into campaign_sends (campaign_id, member_id, to_email, merge_vars, status, provider, attempt_count)
    select
      ${id}::uuid,
      m.id,
      m.email::text,
      '{}'::jsonb,
      'queued'::text,
      'resend'::text,
      0::int
    from members_sendable_marketing m
    where not exists (
      select 1
      from campaign_sends s
      where s.campaign_id = ${id}::uuid
        and s.to_email = (m.email::text)
    )
    returning 1
  `

  const queued = inserted.rowCount ?? 0

  const total = await sql<{count: number}>`select count(*)::int as count from members_sendable_marketing`
  const totalCount = total.rows[0]?.count ?? 0
  const skipped = Math.max(0, totalCount - queued)

  await sql`update campaigns set status = 'queued'::text, updated_at = now() where id = ${id}::uuid`

  return NextResponse.json({queued, skipped})
}
