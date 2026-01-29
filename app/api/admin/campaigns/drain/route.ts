import 'server-only'
import * as React from 'react'
import crypto from 'crypto'
import {NextRequest, NextResponse} from 'next/server'
import {sql} from '@vercel/postgres'
import {Resend} from 'resend'
import {render as renderEmail} from '@react-email/render'
import {requireAdminMemberId} from '@/lib/adminAuth'
import CampaignEmail from '@/emails/CampaignEmail'
import {mergeTemplate} from '@/lib/campaigns/template'
import {sha256Hex} from '@/lib/campaigns/idempotency'

export const runtime = 'nodejs'

const resend = new Resend(process.env.RESEND_API_KEY ?? 're_dummy')

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | {
      [key: string]: Json
    }

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function computeNextPollMs(sent: number, remaining: number, limit: number): number {
  if (remaining <= 0) return 0
  if (sent >= limit) return 900
  return 1400
}

function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && typeof e.message === 'string') return e.message
  if (typeof e === 'string') return e
  return fallback
}

type DrainBody = null | {
  campaignId?: string
  limit?: number
  force?: boolean
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId()

  const runId = crypto.randomUUID()

  const body: DrainBody = await req.json().catch(() => null)

  const campaignId = asString(body?.campaignId).trim()
  if (!campaignId) return NextResponse.json({error: 'Missing campaignId'}, {status: 400})

  const limit = clampInt(typeof body?.limit === 'number' ? body.limit : 50, 1, 100)
  const force = body?.force === true

  // 1) Lock campaign (TTL-based)
  const lockTtlSeconds = 45
  const locked = await sql<{id: string}>`
    update campaigns
    set
      locked_at = now(),
      locked_by = ${runId},
      status = case when status = 'complete' then status else 'sending' end,
      updated_at = now()
    where
      id = ${campaignId}::uuid
      and (
        ${force} = true
        or locked_at is null
        or locked_at < now() - (${lockTtlSeconds}::text || ' seconds')::interval
      )
    returning id
  `

  if (locked.rowCount === 0) {
    return NextResponse.json(
      {error: 'Campaign locked (another drain likely running).', code: 'CAMPAIGN_LOCKED', runId},
      {status: 409}
    )
  }

  // 2) Load campaign templates + sender
  const camp = await sql<{
    subject_template: string
    body_template: string
    from_email: string
    reply_to: string | null
    name: string
    audience_key: string
    filters: Json
  }>`
    select subject_template, body_template, from_email, reply_to, name, audience_key, filters
    from campaigns
    where id = ${campaignId}::uuid
    limit 1
  `
  const c = camp.rows[0]
  if (!c) {
    await sql`update campaigns set locked_at = null, locked_by = null where id = ${campaignId}::uuid`
    return NextResponse.json({error: 'Campaign not found', runId}, {status: 404})
  }

  // 3) Claim a batch of queued sends (single statement)
  const claimed = await sql<{
    id: string
    to_email: string
    merge_vars: Json
  }>`
    with picked as (
      select id
      from campaign_sends
      where campaign_id = ${campaignId}::uuid
        and status = 'queued'
      order by created_at asc
      limit ${limit}
      for update skip locked
    )
    update campaign_sends s
    set
      status = 'sending',
      attempt_count = attempt_count + 1,
      last_attempt_at = now()
    where s.id in (select id from picked)
    returning s.id, s.to_email, s.merge_vars
  `

  if (claimed.rowCount === 0) {
    const remaining = await sql<{n: number}>`
      select count(*)::int as n
      from campaign_sends
      where campaign_id = ${campaignId}::uuid
        and status = 'queued'
    `
    const remainingQueued = remaining.rows[0]?.n ?? 0

    if (remainingQueued === 0) {
      await sql`
        update campaigns
        set status = 'complete', locked_at = null, locked_by = null, updated_at = now()
        where id = ${campaignId}::uuid
      `
    } else {
      await sql`update campaigns set locked_at = null, locked_by = null, updated_at = now() where id = ${campaignId}::uuid`
    }

    return NextResponse.json({
      ok: true,
      sent: 0,
      remainingQueued,
      nextPollMs: clampInt(computeNextPollMs(0, remainingQueued, limit), 0, 5000),
      runId,
    })
  }

  // 4) Build payloads
  const siteUrl = (process.env.PUBLIC_SITE_URL ?? '').replace(/\/+$/, '')
  const logoUrl = siteUrl ? `${siteUrl}/android-chrome-192x192.png` : undefined

  const emails = await Promise.all(
    claimed.rows.map(async (row) => {
      const to = asString(row.to_email).trim().toLowerCase()
      const mv = (row.merge_vars && typeof row.merge_vars === 'object' ? row.merge_vars : {}) as Record<
        string,
        unknown
      >

      const vars: Record<string, string> = {
        email: to,
        member_id: typeof mv.member_id === 'string' ? mv.member_id : '',
        campaign_name: c.name,
        unsubscribe_url: '',
      }

      const subject = mergeTemplate(c.subject_template, vars).trim() || '(no subject)'
      const mergedBody = mergeTemplate(c.body_template, vars).trim()
      const text = mergedBody || ' '

      const html = await renderEmail(
        React.createElement(CampaignEmail, {
          brandName: 'Brendan John Roch',
          logoUrl,
          bodyMarkdown: mergedBody,
          unsubscribeUrl: undefined,
        }),
        {pretty: true}
      )

      const keyRaw = `camp:${campaignId}:to:${to}:sub:${subject}:body:${mergedBody}`
      const idempotencyKey = `bjr:${campaignId}:${sha256Hex(keyRaw).slice(0, 48)}`

      return {
        sendId: row.id,
        to,
        subject,
        text,
        html,
        idempotencyKey,
      }
    })
  )

  // 5) Send via Resend (batch)
  const batchKey = `bjr_batch:${campaignId}:${emails.map((e) => e.sendId).join(',')}`
  const batchIdem = `bjr:${campaignId}:${sha256Hex(batchKey).slice(0, 48)}`

  type ResendBatchOk = {data: Array<{id: string}>}
  type ResendBatchErr = {error: {message?: string} | string}

  let providerIds: string[] = []

  try {
    const resultUnknown: unknown = await resend.batch.send(
      emails.map((e) => ({
        from: c.from_email,
        to: e.to,
        subject: e.subject,
        text: e.text,
        html: e.html,
        ...(c.reply_to ? {replyTo: c.reply_to} : {}),
        tags: [
          {name: 'campaign_id', value: campaignId},
          {name: 'send_id', value: e.sendId},
          {name: 'run_id', value: runId},
        ],
      })),
      {idempotencyKey: batchIdem}
    )

    const maybeErr = (resultUnknown as ResendBatchErr).error
    if (maybeErr) {
      const msg =
        typeof maybeErr === 'string'
          ? maybeErr
          : typeof maybeErr.message === 'string'
          ? maybeErr.message
          : 'Resend batch error'
      throw new Error(msg)
    }

    const ok = resultUnknown as ResendBatchOk
    if (!ok.data || !Array.isArray(ok.data) || ok.data.length !== emails.length) {
      throw new Error('Unexpected Resend batch response shape (missing ids)')
    }

    providerIds = ok.data.map((x) => x.id)
  } catch (e: unknown) {
    const msg = errorMessage(e, 'Drain send failed')

    // Persist failure for the claimed batch
    await Promise.all(
      emails.map((em) =>
        sql`
          update campaign_sends
          set
            status = 'failed',
            last_error = ${msg},
            idempotency_key = ${em.idempotencyKey}
          where id = ${em.sendId}::uuid
        `
      )
    )

    await sql`update campaigns set locked_at = null, locked_by = null, updated_at = now() where id = ${campaignId}::uuid`

    return NextResponse.json({error: 'Drain send failed', message: msg, runId}, {status: 502})
  }

  // Persist success (no array interpolation)
  await Promise.all(
    emails.map((em, i) => {
      const providerMessageId = providerIds[i]
      return sql`
        update campaign_sends
        set
          status = 'sent',
          sent_at = now(),
          provider_message_id = ${providerMessageId}::uuid,
          idempotency_key = ${em.idempotencyKey}
        where id = ${em.sendId}::uuid
      `
    })
  )

  const sentCount = emails.length

  // 6) Remaining + unlock
  const remaining = await sql<{n: number}>`
    select count(*)::int as n
    from campaign_sends
    where campaign_id = ${campaignId}::uuid
      and status = 'queued'
  `
  const remainingQueued = remaining.rows[0]?.n ?? 0

  await sql`
    update campaigns
    set
      status = case when ${remainingQueued} = 0 then 'complete' else status end,
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = ${campaignId}::uuid
  `

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    remainingQueued,
    nextPollMs: clampInt(computeNextPollMs(sentCount, remainingQueued, limit), 0, 5000),
    runId,
  })
}
