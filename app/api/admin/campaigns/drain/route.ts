// web/app/api/admin/campaigns/drain/route.ts
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
import {issueUnsubscribeToken} from '@/lib/unsubscribe'

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

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)))
}

function computeNextPollMs(sent: number, remaining: number, limit: number): number {
  if (remaining <= 0) return 0
  if (sent >= limit) return 900
  return 1400
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && typeof e.message === 'string' && e.message.trim()) return e.message
  if (typeof e === 'string' && e.trim()) return e
  try {
    const s = JSON.stringify(e)
    return s && s !== '{}' ? s : fallback
  } catch {
    return fallback
  }
}

function extractResendBatchIds(resp: unknown): string[] {
  if (!isObject(resp)) return []
  const data = (resp as {data?: unknown}).data

  if (Array.isArray(data)) {
    return data
      .map((x) => (isObject(x) && typeof x.id === 'string' ? x.id : ''))
      .filter((id) => id.length > 0)
  }

  if (isObject(data) && typeof data.id === 'string' && data.id.length > 0) return [data.id]

  return []
}

type DrainBody = null | {
  campaignId?: string
  limit?: number
  force?: boolean
}

type DrainOk = {
  ok: true
  sent: number
  remainingQueued: number
  nextPollMs: number
  runId: string
  providerIdsCaptured: number
}

type ApiErr = {
  ok?: false
  error: string
  message?: string
  runId: string
  code?: string
  step?: string
}

function apiErr(status: number, payload: ApiErr) {
  return NextResponse.json(payload, {status})
}

async function unlockCampaign(campaignId: string) {
  await sql`
    update campaigns
    set locked_at = null, locked_by = null, updated_at = now()
    where id = ${campaignId}::uuid
  `
}

function buildUnsubscribeUrl(siteUrl: string, token: string): string {
  const base = siteUrl.replace(/\/+$/, '')
  return `${base}/unsubscribe?t=${encodeURIComponent(token)}`
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId()
  const runId = crypto.randomUUID()

  const body: DrainBody = await req.json().catch(() => null)
  const campaignId = asString(body?.campaignId).trim()
  if (!campaignId) return apiErr(400, {error: 'Missing campaignId', runId, step: 'parse'})

  const limit = clampInt(typeof body?.limit === 'number' ? body.limit : 50, 1, 100)
  const force = body?.force === true

  const lockTtlSeconds = 45
  let lockedOk = false

  try {
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
    lockedOk = (locked.rowCount ?? 0) > 0
  } catch (e: unknown) {
    return apiErr(500, {error: 'Failed to acquire campaign lock', message: errMsg(e, 'DB error'), runId, step: 'lock'})
  }

  if (!lockedOk) {
    return apiErr(409, {
      error: 'Campaign locked (another drain likely running).',
      code: 'CAMPAIGN_LOCKED',
      runId,
      step: 'lock',
    })
  }

  try {
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
      await unlockCampaign(campaignId)
      return apiErr(404, {error: 'Campaign not found', runId, step: 'load_campaign'})
    }

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

    if ((claimed.rowCount ?? 0) === 0) {
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
        await unlockCampaign(campaignId)
      }

      return NextResponse.json({
        ok: true,
        sent: 0,
        remainingQueued,
        nextPollMs: clampInt(computeNextPollMs(0, remainingQueued, limit), 0, 5000),
        runId,
        providerIdsCaptured: 0,
      } satisfies DrainOk)
    }

    const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '')
    const logoUrl = siteUrl ? `${siteUrl}/android-chrome-192x192.png` : undefined

    const emails = await Promise.all(
      claimed.rows.map(async (row) => {
        const to = asString(row.to_email).trim().toLowerCase()

        const mv = (row.merge_vars && typeof row.merge_vars === 'object' ? row.merge_vars : {}) as Record<string, unknown>

        const memberId = typeof mv.member_id === 'string' ? mv.member_id : ''
        const unsubscribeToken =
          siteUrl && to
            ? issueUnsubscribeToken({
                email: to,
                memberId: memberId || null,
                campaignId,
                sendId: row.id,
                ttlSeconds: 60 * 60 * 24 * 30, // 30 days
              })
            : ''

        const unsubscribeUrl = unsubscribeToken ? buildUnsubscribeUrl(siteUrl, unsubscribeToken) : ''

        const vars: Record<string, string> = {
          email: to,
          member_id: memberId,
          campaign_name: c.name,
          unsubscribe_url: unsubscribeUrl,
        }

        const subject = mergeTemplate(c.subject_template, vars).trim() || '(no subject)'
        const mergedBody = mergeTemplate(c.body_template, vars).trim()
        const text = mergedBody || ' '

        const html = await renderEmail(
          React.createElement(CampaignEmail, {
            brandName: 'Brendan John Roch',
            logoUrl,
            bodyMarkdown: mergedBody,
            unsubscribeUrl: unsubscribeUrl || undefined,
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

    const batchKey = `bjr_batch:${campaignId}:${emails.map((e) => e.sendId).join(',')}`
    const batchIdem = `bjr:${campaignId}:${sha256Hex(batchKey).slice(0, 48)}`

    let providerIds: string[] = []
    let sendResponseRaw: unknown = null

    try {
      sendResponseRaw = await resend.batch.send(
        emails.map((e) => ({
          from: c.from_email,
          to: [e.to],
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

      const maybeErr = isObject(sendResponseRaw) ? (sendResponseRaw as {error?: unknown}).error : undefined
      if (maybeErr) {
        const msg =
          typeof maybeErr === 'string'
            ? maybeErr
            : isObject(maybeErr) && typeof maybeErr.message === 'string'
            ? maybeErr.message
            : 'Resend batch error'
        throw new Error(msg)
      }

      providerIds = extractResendBatchIds(sendResponseRaw)
      if (providerIds.length !== emails.length) providerIds = []
    } catch (e: unknown) {
      const msg = errMsg(e, 'Drain send failed')

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

      await unlockCampaign(campaignId)

      const providerHint =
        sendResponseRaw == null
          ? ''
          : (() => {
              try {
                const s = JSON.stringify(sendResponseRaw)
                return s.length > 800 ? `${s.slice(0, 800)}…` : s
              } catch {
                return ''
              }
            })()

      return apiErr(502, {
        error: 'Drain send failed',
        message: providerHint ? `${msg} | provider=${providerHint}` : msg,
        runId,
        step: 'resend_batch_send',
      })
    }

    await Promise.all(
      emails.map((em, i) => {
        const providerMessageId = providerIds[i] ? providerIds[i] : null
        return sql`
          update campaign_sends
          set
            status = 'sent',
            sent_at = now(),
            provider_message_id = ${providerMessageId},
            idempotency_key = ${em.idempotencyKey},
            last_error = null
          where id = ${em.sendId}::uuid
        `
      })
    )

    const sentCount = emails.length

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
      providerIdsCaptured: providerIds.length,
    } satisfies DrainOk)
  } catch (e: unknown) {
    const msg = errMsg(e, 'Unexpected drain failure')
    try {
      await unlockCampaign(campaignId)
    } catch {
      // ignore
    }
    return apiErr(502, {error: 'Unexpected drain failure', message: msg, runId, step: 'unhandled'})
  }
}
