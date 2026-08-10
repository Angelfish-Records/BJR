// web/app/api/admin/campaigns/drain/route.ts
import "server-only";
import * as React from "react";
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { Resend } from "resend";
import { render as renderEmail } from "@react-email/render";
import { requireAdminMemberId } from "@/lib/adminAuth";
import CampaignEmail from "@/emails/CampaignEmail";
import { mergeTemplate } from "@/lib/campaigns/template";
import { sha256Hex } from "@/lib/campaigns/idempotency";
import { issueUnsubscribeToken } from "@/lib/unsubscribe";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY ?? "re_dummy");

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | {
      [key: string]: Json;
    };

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function computeNextPollMs(
  sent: number,
  remaining: number,
  limit: number,
): number {
  if (remaining <= 0) return 0;
  if (sent >= limit) return 900;
  return 1400;
}

function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error && typeof e.message === "string" && e.message.trim())
    return e.message;
  if (typeof e === "string" && e.trim()) return e;
  try {
    const s = JSON.stringify(e);
    return s && s !== "{}" ? s : fallback;
  } catch {
    return fallback;
  }
}

function extractResendBatchIds(resp: unknown): string[] {
  if (!isObject(resp)) return [];
  const data = (resp as { data?: unknown }).data;

  if (Array.isArray(data)) {
    return data
      .map((x) => (isObject(x) && typeof x.id === "string" ? x.id : ""))
      .filter((id) => id.length > 0);
  }

  if (isObject(data) && typeof data.id === "string" && data.id.length > 0)
    return [data.id];

  return [];
}

type DrainBody = null | {
  campaignId?: string;
  limit?: number;
  force?: boolean;
};

type DrainOk = {
  ok: true;
  sent: number;
  remainingQueued: number;
  nextPollMs: number;
  runId: string;
  providerIdsCaptured: number;
};

type ApiErr = {
  ok?: false;
  error: string;
  message?: string;
  runId: string;
  code?: string;
  step?: string;
};

function apiErr(status: number, payload: ApiErr) {
  return NextResponse.json(payload, { status });
}

async function unlockCampaign(campaignId: string) {
  await sql`
    update campaigns
    set locked_at = null, locked_by = null, updated_at = now()
    where id = ${campaignId}::uuid
  `;
}

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.codePointAt(end - 1) === 47) {
    end -= 1;
  }
  return value.slice(0, end);
}

function buildUnsubscribeUrl(siteUrl: string, token: string): string {
  const base = trimTrailingSlashes(siteUrl);
  return `${base}/unsubscribe?t=${encodeURIComponent(token)}`;
}

type CampaignRow = {
  subject_template: string;
  body_template: string;
  from_email: string;
  reply_to: string | null;
  name: string;
  audience_key: string;
  filters: Json;
};

type ClaimedSendRow = {
  id: string;
  to_email: string;
  merge_vars: Json;
};

type PreparedEmail = {
  sendId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
};

type CampaignLockResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

type BatchSendResult =
  | { ok: true; providerIds: string[] }
  | { ok: false; error: unknown; responseRaw: unknown };

async function acquireCampaignLock(params: {
  campaignId: string;
  runId: string;
  force: boolean;
}): Promise<CampaignLockResult> {
  const { campaignId, runId, force } = params;
  const lockTtlSeconds = 45;

  try {
    const locked = await sql<{ id: string }>`
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
    `;

    if ((locked.rowCount ?? 0) > 0) {
      return { ok: true };
    }

    return {
      ok: false,
      response: apiErr(409, {
        error: "Campaign locked (another drain likely running).",
        code: "CAMPAIGN_LOCKED",
        runId,
        step: "lock",
      }),
    };
  } catch (e: unknown) {
    return {
      ok: false,
      response: apiErr(500, {
        error: "Failed to acquire campaign lock",
        message: errMsg(e, "DB error"),
        runId,
        step: "lock",
      }),
    };
  }
}

async function loadCampaign(campaignId: string): Promise<CampaignRow | null> {
  const camp = await sql<CampaignRow>`
    select subject_template, body_template, from_email, reply_to, name, audience_key, filters
    from campaigns
    where id = ${campaignId}::uuid
    limit 1
  `;

  return camp.rows[0] ?? null;
}

async function claimCampaignSends(
  campaignId: string,
  limit: number,
): Promise<{ rows: ClaimedSendRow[]; rowCount: number }> {
  const claimed = await sql<ClaimedSendRow>`
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
  `;

  return {
    rows: claimed.rows,
    rowCount: claimed.rowCount ?? 0,
  };
}

async function countRemainingQueued(campaignId: string): Promise<number> {
  const remaining = await sql<{ n: number }>`
    select count(*)::int as n
    from campaign_sends
    where campaign_id = ${campaignId}::uuid
      and status = 'queued'
  `;

  return remaining.rows[0]?.n ?? 0;
}

async function settleEmptyClaim(
  campaignId: string,
  remainingQueued: number,
): Promise<void> {
  if (remainingQueued === 0) {
    await sql`
      update campaigns
      set status = 'complete', locked_at = null, locked_by = null, updated_at = now()
      where id = ${campaignId}::uuid
    `;
    return;
  }

  await unlockCampaign(campaignId);
}

function drainOkResponse(params: {
  sent: number;
  remainingQueued: number;
  limit: number;
  runId: string;
  providerIdsCaptured: number;
}) {
  return NextResponse.json({
    ok: true,
    sent: params.sent,
    remainingQueued: params.remainingQueued,
    nextPollMs: clampInt(
      computeNextPollMs(params.sent, params.remainingQueued, params.limit),
      0,
      5000,
    ),
    runId: params.runId,
    providerIdsCaptured: params.providerIdsCaptured,
  } satisfies DrainOk);
}

function mergeVarsRecord(value: Json): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

async function prepareCampaignEmail(params: {
  row: ClaimedSendRow;
  campaign: CampaignRow;
  campaignId: string;
  siteUrl: string;
}): Promise<PreparedEmail> {
  const { row, campaign, campaignId, siteUrl } = params;
  const to = asString(row.to_email).trim().toLowerCase();
  const mv = mergeVarsRecord(row.merge_vars);
  const memberId = typeof mv.member_id === "string" ? mv.member_id : "";

  const unsubscribeToken =
    siteUrl && to
      ? issueUnsubscribeToken({
          email: to,
          memberId: memberId || null,
          campaignId,
          sendId: row.id,
          ttlSeconds: 60 * 60 * 24 * 30, // 30 days
        })
      : "";

  const unsubscribeUrl = unsubscribeToken
    ? buildUnsubscribeUrl(siteUrl, unsubscribeToken)
    : "";

  const vars: Record<string, string> = {
    email: to,
    member_id: memberId,
    campaign_name: campaign.name,
    unsubscribe_url: unsubscribeUrl,
  };

  const subject =
    mergeTemplate(campaign.subject_template, vars).trim() || "(no subject)";
  const mergedBody = mergeTemplate(campaign.body_template, vars).trim();
  const text = mergedBody || " ";

  const html = await renderEmail(
    React.createElement(CampaignEmail, {
      brandName: "Angelfish Records MMXXVI",
      bodyMarkdown: mergedBody,
      unsubscribeUrl: unsubscribeUrl || undefined,
    }),
    { pretty: true },
  );

  const keyRaw = `camp:${campaignId}:to:${to}:sub:${subject}:body:${mergedBody}`;
  const idempotencyKey = `bjr:${campaignId}:${sha256Hex(keyRaw).slice(0, 48)}`;

  return {
    sendId: row.id,
    to,
    subject,
    text,
    html,
    idempotencyKey,
  };
}

async function prepareCampaignEmails(params: {
  rows: ClaimedSendRow[];
  campaign: CampaignRow;
  campaignId: string;
}): Promise<PreparedEmail[]> {
  const siteUrl = trimTrailingSlashes(process.env.NEXT_PUBLIC_APP_URL ?? "");

  return Promise.all(
    params.rows.map((row) =>
      prepareCampaignEmail({
        row,
        campaign: params.campaign,
        campaignId: params.campaignId,
        siteUrl,
      }),
    ),
  );
}

function resendErrorValue(responseRaw: unknown): unknown {
  return isObject(responseRaw)
    ? (responseRaw as { error?: unknown }).error
    : undefined;
}

function resendErrorMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (isObject(value) && typeof value.message === "string") {
    return value.message;
  }
  return "Resend batch error";
}

async function sendCampaignBatch(params: {
  campaignId: string;
  runId: string;
  campaign: CampaignRow;
  emails: PreparedEmail[];
}): Promise<BatchSendResult> {
  const { campaignId, runId, campaign, emails } = params;
  const batchKey = `bjr_batch:${campaignId}:${emails.map((e) => e.sendId).join(",")}`;
  const batchIdem = `bjr:${campaignId}:${sha256Hex(batchKey).slice(0, 48)}`;
  let responseRaw: unknown = null;

  try {
    responseRaw = await resend.batch.send(
      emails.map((e) => ({
        from: campaign.from_email,
        to: [e.to],
        subject: e.subject,
        text: e.text,
        html: e.html,
        ...(campaign.reply_to ? { replyTo: campaign.reply_to } : {}),
        tags: [
          { name: "campaign_id", value: campaignId },
          { name: "send_id", value: e.sendId },
          { name: "run_id", value: runId },
        ],
      })),
      { idempotencyKey: batchIdem },
    );

    const maybeErr = resendErrorValue(responseRaw);
    if (maybeErr) {
      return {
        ok: false,
        error: new Error(resendErrorMessage(maybeErr)),
        responseRaw,
      };
    }

    const providerIds = extractResendBatchIds(responseRaw);
    return {
      ok: true,
      providerIds:
        providerIds.length === emails.length ? providerIds : [],
    };
  } catch (error: unknown) {
    return { ok: false, error, responseRaw };
  }
}

async function markCampaignSendsFailed(
  emails: PreparedEmail[],
  msg: string,
): Promise<void> {
  await Promise.all(
    emails.map(
      (em) =>
        sql`
        update campaign_sends
        set
          status = 'failed',
          last_error = ${msg},
          idempotency_key = ${em.idempotencyKey}
        where id = ${em.sendId}::uuid
      `,
    ),
  );
}

function providerHintFromResponse(responseRaw: unknown): string {
  if (responseRaw == null) return "";

  try {
    const serialized = JSON.stringify(responseRaw);
    return serialized.length > 800
      ? `${serialized.slice(0, 800)}…`
      : serialized;
  } catch {
    return "";
  }
}

async function handleBatchSendFailure(params: {
  campaignId: string;
  runId: string;
  emails: PreparedEmail[];
  error: unknown;
  responseRaw: unknown;
}) {
  const message = errMsg(params.error, "Drain send failed");

  await markCampaignSendsFailed(params.emails, message);
  await unlockCampaign(params.campaignId);

  const providerHint = providerHintFromResponse(params.responseRaw);

  return apiErr(502, {
    error: "Drain send failed",
    message: providerHint
      ? `${message} | provider=${providerHint}`
      : message,
    runId: params.runId,
    step: "resend_batch_send",
  });
}

async function markCampaignSendsSent(
  emails: PreparedEmail[],
  providerIds: string[],
): Promise<void> {
  await Promise.all(
    emails.map((em, i) => {
      const providerMessageId = providerIds[i] ? providerIds[i] : null;
      return sql`
        update campaign_sends
        set
          status = 'sent',
          sent_at = now(),
          provider_message_id = ${providerMessageId},
          idempotency_key = ${em.idempotencyKey},
          last_error = null
        where id = ${em.sendId}::uuid
      `;
    }),
  );
}

async function finalizeCampaignAfterSend(campaignId: string): Promise<number> {
  const remainingQueued = await countRemainingQueued(campaignId);

  await sql`
    update campaigns
    set
      status = case when ${remainingQueued} = 0 then 'complete' else status end,
      locked_at = null,
      locked_by = null,
      updated_at = now()
    where id = ${campaignId}::uuid
  `;

  return remainingQueued;
}

async function unexpectedDrainFailure(
  campaignId: string,
  runId: string,
  error: unknown,
) {
  const message = errMsg(error, "Unexpected drain failure");

  try {
    await unlockCampaign(campaignId);
  } catch {
    // ignore
  }

  return apiErr(502, {
    error: "Unexpected drain failure",
    message,
    runId,
    step: "unhandled",
  });
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();
  const runId = crypto.randomUUID();

  const body = (await req.json().catch(() => null)) as DrainBody;
  const campaignId = asString(body?.campaignId).trim();

  if (!campaignId) {
    return apiErr(400, {
      error: "Missing campaignId",
      runId,
      step: "parse",
    });
  }

  const limit = clampInt(
    typeof body?.limit === "number" ? body.limit : 50,
    1,
    100,
  );
  const force = body?.force === true;

  const lockResult = await acquireCampaignLock({
    campaignId,
    runId,
    force,
  });

  if (!lockResult.ok) {
    return lockResult.response;
  }

  try {
    const campaign = await loadCampaign(campaignId);

    if (!campaign) {
      await unlockCampaign(campaignId);
      return apiErr(404, {
        error: "Campaign not found",
        runId,
        step: "load_campaign",
      });
    }

    const claimed = await claimCampaignSends(campaignId, limit);

    if (claimed.rowCount === 0) {
      const remainingQueued = await countRemainingQueued(campaignId);
      await settleEmptyClaim(campaignId, remainingQueued);

      return drainOkResponse({
        sent: 0,
        remainingQueued,
        limit,
        runId,
        providerIdsCaptured: 0,
      });
    }

    const emails = await prepareCampaignEmails({
      rows: claimed.rows,
      campaign,
      campaignId,
    });

    const sendResult = await sendCampaignBatch({
      campaignId,
      runId,
      campaign,
      emails,
    });

    if (!sendResult.ok) {
      const failureResponse = await handleBatchSendFailure({
        campaignId,
        runId,
        emails,
        error: sendResult.error,
        responseRaw: sendResult.responseRaw,
      });
      return failureResponse;
    }

    await markCampaignSendsSent(emails, sendResult.providerIds);

    const remainingQueued = await finalizeCampaignAfterSend(campaignId);

    return drainOkResponse({
      sent: emails.length,
      remainingQueued,
      limit,
      runId,
      providerIdsCaptured: sendResult.providerIds.length,
    });
  } catch (error: unknown) {
    return unexpectedDrainFailure(campaignId, runId, error);
  }
}
