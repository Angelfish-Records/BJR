import 'server-only'
import {redirect} from 'next/navigation'
import {sql} from '@vercel/postgres'
import {requireAdminMemberId} from '@/lib/adminAuth'

export const runtime = 'nodejs'

type EnqueueBody = {
  campaignName?: string
  subjectTemplate?: string
  bodyTemplate?: string
  source?: string
}

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`)
  return v
}

export default async function AdminCampaignsNew() {
  const memberId = await requireAdminMemberId()

  // Defaults (you can later replace this with a "new campaign" form)
  const body: EnqueueBody = {
    campaignName: 'New campaign',
    subjectTemplate: 'A note from Brendan',
    bodyTemplate: 'Write the email…',
    source: undefined,
  }

  const fromEmail = must(process.env.RESEND_FROM_MARKETING, 'RESEND_FROM_MARKETING')
  const audienceKey = 'members_marketing_v1'
  const senderKey = 'marketing'

  const subjectTemplate = (body.subjectTemplate ?? '').trim()
  const bodyTemplate = (body.bodyTemplate ?? '').trim()
  if (!subjectTemplate || !bodyTemplate) {
    throw new Error('Missing subjectTemplate/bodyTemplate')
  }

  const name = (body.campaignName ?? subjectTemplate.slice(0, 120)).trim()
  const source = (body.source ?? '').trim() || null

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
      ${null},
      ${subjectTemplate},
      ${bodyTemplate},
      ${JSON.stringify(filters)}::jsonb
    )
    returning id
  `
  const campaignId = created.rows[0]?.id
  if (!campaignId) throw new Error('Failed to create campaign')

  // 2) Enqueue sends from members_sendable_marketing, minus suppressions.
  // Optional filter: source (if source is null, the clause becomes a no-op)
  await sql`
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
    )
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
  `

  redirect(`/admin/campaigns/${campaignId}`)
}
