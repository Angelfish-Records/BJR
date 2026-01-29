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
  // optional v1 filters:
  source?: string
}

export async function POST(req: NextRequest) {
  const memberId = await requireAdminMemberId()

  const body: EnqueueBody = await req.json().catch(() => null)

  const subjectTemplate = (body?.subjectTemplate ?? '').trim()
  const bodyTemplate = (body?.bodyTemplate ?? '').trim()
  if (!subjectTemplate || !bodyTemplate) {
    return NextResponse.json({error: 'Missing subjectTemplate/bodyTemplate'}, {status: 400})
  }

  const name = (body?.campaignName ?? subjectTemplate.slice(0, 120)).trim()
  const replyTo = (body?.replyTo ?? null) ? String(body?.replyTo).trim() : null

  // Single-sender (hard rule for this project)
  const fromEmail = must(process.env.RESEND_FROM_MARKETING, 'RESEND_FROM_MARKETING')

  // Keep sender_key column populated (schema still has it); constant value for now.
  const senderKey = 'marketing'

  // Audience is members-only sendable view
  const audienceKey = 'members_sendable_marketing'

  const filters = {
    source: (body?.source ?? '').trim() || null,
  }

  // Create campaign
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

  // Insert sends from members_sendable_marketing, minus suppressions.
  // Optional filter: source (handled without “sql fragment”)
  const source = filters.source

  const inserted = await sql<{n: number}>`
    with audience as (
      select
        m.id as member_id,
        lower(m.email::text) as email,
        m.source as source
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
    audienceKey,
    campaignId,
    enqueued: inserted.rows[0]?.n ?? 0,
  })
}
