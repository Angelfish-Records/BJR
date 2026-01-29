import 'server-only'
import {NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

type CampaignRow = {
  id: string
  locked_at: string | null
}

export async function POST(_req: Request, ctx: {params: {id: string}}) {
  await requireAdminMemberId()

  const {id} = ctx.params

  const c = await sql<CampaignRow>`
    select id, locked_at
    from campaigns
    where id = ${id}::uuid
    limit 1
  `
  const campaign = c.rows[0]
  if (!campaign) return NextResponse.json({error: 'Not found'}, {status: 404})
  if (!campaign.locked_at) {
    return NextResponse.json({error: 'Campaign must be locked before queueing'}, {status: 400})
  }

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
    where m.email is not null
      and lower(m.email::text) <> ''
      and not exists (
        select 1 from campaign_sends s
        where s.campaign_id = ${id}::uuid
          and lower(s.to_email) = lower(m.email::text)
      )
    returning 1
  `
  const queued = inserted?.rowCount ?? 0

  const total = await sql<{count: number}>`
    select count(*)::int as count
    from members_sendable_marketing
    where email is not null and lower(email::text) <> ''
  `
  const totalCount = total.rows[0]?.count ?? 0
  const skipped = Math.max(0, totalCount - queued)

  await sql`update campaigns set status = 'queued'::text, updated_at = now() where id = ${id}::uuid`

  return NextResponse.json({queued, skipped})
}
