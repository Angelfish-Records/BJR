// web/app/api/campaigns/[id]/queue/route.ts
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'

export const runtime = 'nodejs'

function requireActor() {
  return {actorLabel: 'admin'}
}

type RouteContext = {
  params: Promise<{id: string}>
}

export async function POST(_req: NextRequest, context: RouteContext) {
  const {id} = await context.params
  requireActor()

  // Ensure campaign exists and is locked (soft rule; you can relax later)
  const c = await sql`select locked_at from campaigns where id = ${id}::uuid limit 1`
  if (c.rowCount === 0) return NextResponse.json({error: 'Not found'}, {status: 404})

  const lockedAt = c.rows[0]?.locked_at as string | null | undefined
  if (!lockedAt) {
    return NextResponse.json({error: 'Campaign must be locked before queueing'}, {status: 400})
  }

  // Insert one row per sendable member.
  // Idempotency strategy: avoid duplicate per (campaign_id,to_email).
  const inserted = await sql`
    insert into campaign_sends (campaign_id, member_id, to_email, merge_vars, status, provider, attempt_count)
    select
      ${id}::uuid as campaign_id,
      m.id as member_id,
      lower(m.email::text) as to_email,
      jsonb_build_object(
        'member_id', m.id::text,
        'email', lower(m.email::text)
      ) as merge_vars,
      'queued'::text as status,
      'resend'::text as provider,
      0::int as attempt_count
    from members_sendable_marketing m
    where
      m.email is not null
      and m.email::text <> ''
      and not exists (
        select 1 from campaign_sends s
        where s.campaign_id = ${id}::uuid
          and lower(s.to_email) = lower(m.email::text)
      )
    returning 1
  `

  const queued = inserted.rowCount ?? 0

  // Skipped = total sendable - queued
  const total = await sql`select count(*)::int as count from members_sendable_marketing`
  const totalCount = (total.rows[0]?.count as number | null) ?? 0
  const skipped = Math.max(0, totalCount - queued)

  // Optional: mark campaign as "queued"
  await sql`update campaigns set status = 'queued'::text, updated_at = now() where id = ${id}::uuid`

  return NextResponse.json({queued, skipped})
}
