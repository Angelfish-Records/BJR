import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function asTrimmedOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function asIntOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function clampIntOrNull(v: unknown, min: number, max: number): number | null {
  const n = asIntOrNull(v);
  if (n === null) return null;
  return Math.max(min, Math.min(max, n));
}

type EnqueueBody = null | {
  campaignName?: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  replyTo?: string | null;

  // Existing filter
  source?: string | null;

  // New audience filters (all optional)
  entitlementKey?: string | null;
  entitlementExpiresWithinDays?: number | null;

  joinedWithinDays?: number | null;
  consentVersionMax?: number | null;

  purchasedWithinDays?: number | null;
  hasPurchased?: boolean | null;

  engagedEventType?: string | null;
  engagedWithinDays?: number | null;
};

export async function POST(req: NextRequest) {
  const memberId = await requireAdminMemberId();

  const body: EnqueueBody = await req.json().catch(() => null);

  const subjectTemplate = (body?.subjectTemplate ?? "").trim();
  const bodyTemplate = (body?.bodyTemplate ?? "").trim();
  if (!subjectTemplate || !bodyTemplate) {
    return NextResponse.json(
      { error: "Missing subjectTemplate/bodyTemplate" },
      { status: 400 },
    );
  }

  const name =
    (body?.campaignName ?? subjectTemplate.slice(0, 120)).trim() || "Campaign";
  const replyTo = asTrimmedOrNull(body?.replyTo ?? null);

  // Single-sender (hard rule)
  const fromEmail = must(
    process.env.RESEND_FROM_MARKETING,
    "RESEND_FROM_MARKETING",
  );
  const senderKey = "marketing";
  const audienceKey = "members_sendable_marketing";

  // Filters
  const source = asTrimmedOrNull(body?.source ?? null);

  const entitlementKey = asTrimmedOrNull(body?.entitlementKey ?? null);
  const entitlementExpiresWithinDays = clampIntOrNull(
    body?.entitlementExpiresWithinDays,
    1,
    365,
  );

  const joinedWithinDays = clampIntOrNull(body?.joinedWithinDays, 1, 3650); // up to 10y
  const consentVersionMax = clampIntOrNull(
    body?.consentVersionMax,
    0,
    1_000_000,
  );

  const purchasedWithinDays = clampIntOrNull(
    body?.purchasedWithinDays,
    1,
    3650,
  );
  const hasPurchasedRaw = body?.hasPurchased;
  const hasPurchased =
    typeof hasPurchasedRaw === "boolean" ? hasPurchasedRaw : null;

  const engagedEventType = asTrimmedOrNull(body?.engagedEventType ?? null);
  const engagedWithinDays = clampIntOrNull(body?.engagedWithinDays, 1, 3650);

  // Persist filters on the campaign record (so downstream can inspect/audit).
  // Keep only defined/nullables (no functions/intervals).
  const filters = {
    source,
    entitlementKey,
    entitlementExpiresWithinDays,
    joinedWithinDays,
    consentVersionMax,
    purchasedWithinDays,
    hasPurchased,
    engagedEventType,
    engagedWithinDays,
  };

  // 1) Create campaign
  const created = await sql<{ id: string }>`
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
  `;
  const campaignId = created.rows[0]?.id;
  if (!campaignId) throw new Error("Failed to create campaign");

  // Common predicate notes:
  // - We keep members_sendable_marketing as the base audience surface.
  // - Entitlement filtering is via EXISTS join to member_entitlements_current.
  // - Purchase filtering is via EXISTS join to purchases.
  // - Engagement filtering is via EXISTS join to member_events.
  // - Suppressions are applied after base audience selection.

  // 2) Compute audience size (respect optional filters + suppressions)
  const audienceCountQ = await sql<{ n: number }>`
    with audience as (
      select
        lower(m.email::text) as email
      from members_sendable_marketing m
      where
        m.marketing_opt_in is true
        and m.email is not null
        and (${source}::text is null or m.source = ${source})
        and (${joinedWithinDays}::int is null or m.created_at >= now() - make_interval(days => ${joinedWithinDays}::int))
        and (${consentVersionMax}::int is null or m.consent_latest_version <= ${consentVersionMax}::int)

        and (
          ${entitlementKey}::text is null
          or exists (
            select 1
            from member_entitlements_current c
            where c.member_id = m.id
              and c.entitlement_key = ${entitlementKey}::text
              and (
                ${entitlementExpiresWithinDays}::int is null
                or (
                  c.expires_at is not null
                  and c.expires_at > now()
                  and c.expires_at <= now() + make_interval(days => ${entitlementExpiresWithinDays}::int)
                )
              )
          )
        )

        and (
          ${hasPurchased}::boolean is null
          or (
            ${hasPurchased}::boolean is true
            and exists (
              select 1 from purchases p
              where p.member_id = m.id
                and (${purchasedWithinDays}::int is null or p.purchased_at >= now() - make_interval(days => ${purchasedWithinDays}::int))
            )
          )
          or (
            ${hasPurchased}::boolean is false
            and not exists (
              select 1 from purchases p
              where p.member_id = m.id
                and (${purchasedWithinDays}::int is null or p.purchased_at >= now() - make_interval(days => ${purchasedWithinDays}::int))
            )
          )
        )

        and (
          ${engagedEventType}::text is null
          or exists (
            select 1
            from member_events e
            where e.member_id = m.id
              and e.event_type = ${engagedEventType}::text
              and (
                ${engagedWithinDays}::int is null
                or e.occurred_at >= now() - make_interval(days => ${engagedWithinDays}::int)
              )
          )
        )
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
  `;
  const audienceCount = audienceCountQ.rows[0]?.n ?? 0;

  // 3) Insert sends (queued)
  const inserted = await sql<{ n: number }>`
    with audience as (
      select
        m.id as member_id,
        lower(m.email::text) as email
      from members_sendable_marketing m
      where
        m.marketing_opt_in is true
        and m.email is not null
        and (${source}::text is null or m.source = ${source})
        and (${joinedWithinDays}::int is null or m.created_at >= now() - make_interval(days => ${joinedWithinDays}::int))
        and (${consentVersionMax}::int is null or m.consent_latest_version <= ${consentVersionMax}::int)

        and (
          ${entitlementKey}::text is null
          or exists (
            select 1
            from member_entitlements_current c
            where c.member_id = m.id
              and c.entitlement_key = ${entitlementKey}::text
              and (
                ${entitlementExpiresWithinDays}::int is null
                or (
                  c.expires_at is not null
                  and c.expires_at > now()
                  and c.expires_at <= now() + make_interval(days => ${entitlementExpiresWithinDays}::int)
                )
              )
          )
        )

        and (
          ${hasPurchased}::boolean is null
          or (
            ${hasPurchased}::boolean is true
            and exists (
              select 1 from purchases p
              where p.member_id = m.id
                and (${purchasedWithinDays}::int is null or p.purchased_at >= now() - make_interval(days => ${purchasedWithinDays}::int))
            )
          )
          or (
            ${hasPurchased}::boolean is false
            and not exists (
              select 1 from purchases p
              where p.member_id = m.id
                and (${purchasedWithinDays}::int is null or p.purchased_at >= now() - make_interval(days => ${purchasedWithinDays}::int))
            )
          )
        )

        and (
          ${engagedEventType}::text is null
          or exists (
            select 1
            from member_events e
            where e.member_id = m.id
              and e.event_type = ${engagedEventType}::text
              and (
                ${engagedWithinDays}::int is null
                or e.occurred_at >= now() - make_interval(days => ${engagedWithinDays}::int)
              )
          )
        )
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
  `;

  return NextResponse.json({
    ok: true,
    campaignId,
    enqueued: inserted.rows[0]?.n ?? 0,
    audienceCount,
  });
}
