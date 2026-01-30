// web/app/api/admin/campaigns/enqueue/route.ts
import 'server-only'
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

type EnqueueBody = null | {
  campaignName?: string
  subjectTemplate?: string
  bodyTemplate?: string
  replyTo?: string | null
  source?: string | null
}

export async function POST(req: NextRequest) {
  const memberId = await requireAdminMemberId()

  const body: EnqueueBody = await req.json().catch(() => null)

  const subjectTemplate = (body?.subjectTemplate ?? '').trim()
  const bodyTemplate = (body?.bodyTemplate ?? '').trim()
  if (!subjectTemplate || !bodyTemplate) {
    return NextResponse.json({error: 'Missing subjectTemplate/bodyTemplate'}, {status: 400})
  }

  const name = (body?.campaignName ?? subjectTemplate.slice(0, 120)).trim() || 'Campaign'
  const replyTo = (body?.replyTo ?? null) ? String(body?.replyTo).trim() : null

  // Single-sender (hard rule)
  const fromEmail = must(process.env.RESEND_FROM_MARKETING, 'RESEND_FROM_MARKETING')
  const senderKey = 'marketing'
  const audienceKey = 'members_sendable_marketing'

  const source = (body?.source ?? null) ? String(body?.source).trim() : null
  const filters = {source}

  // 1) Create campaign
  const created = await sql<{id: string}>`
    insert into campaigns (
      created_by_member_id,
      audience_key,
      name,
      sender_key,
      from_email,
      reply_to,
      subject_template,
      body_template,
      filters
    )
    values (
      ${memberId},
      ${audienceKey},
      ${name},
      ${senderKey},
      ${fromEmail},
      ${replyTo},
      ${subjectTemplate},
      ${bodyTemplate},
      ${JSON.stringify(filters)}::jsonb
    )
    returning id
  `
  const campaignId = created.rows[0]?.id
  if (!campaignId) throw new Error('Failed to create campaign')

  // 2) Compute audience size (respect optional filter + suppressions)
  const audienceCountQ = await sql<{n: number}>`
    with audience as (
      select
        lower(m.email::text) as email
      from members_sendable_marketing m
      where
        m.marketing_opt_in is true
        and m.email is not null
        and (${source}::text is null or m.source = ${source})
    ),
    eligible as (
      select a.email
      from audience a
      left join email_suppressions s
        on lower(s.email) = a.email
      where s.email is null
        and a.email <> ''
        and a.email is not null
    )
    select count(*)::int as n from eligible
  `
  const audienceCount = audienceCountQ.rows[0]?.n ?? 0

  // 3) Insert sends (queued)
  const inserted = await sql<{n: number}>`
    with audience as (
      select
        m.id as member_id,
        lower(m.email::text) as email
      from members_sendable_marketing m
      where
        m.marketing_opt_in is true
        and m.email is not null
        and (${source}::text is null or m.source = ${source})
    ),
    eligible as (
      select a.*
      from audience a
      left join email_suppressions s
        on lower(s.email) = a.email
      where s.email is null
    ),
    ins as (
      insert into campaign_sends (campaign_id, member_id, to_email, merge_vars, status)
      select
        ${campaignId}::uuid,
        e.member_id,
        e.email,
        jsonb_build_object(
          'member_id', e.member_id::text,
          'email', e.email
        ),
        'queued'
      from eligible e
      where e.email <> ''
        and e.email is not null
      on conflict (campaign_id, to_email) do nothing
      returning 1
    )
    select count(*)::int as n from ins
  `

  return NextResponse.json({
    ok: true,
    campaignId,
    enqueued: inserted.rows[0]?.n ?? 0,
    audienceCount,
  })
}
