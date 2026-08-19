// web/lib/marketingConsent.ts
import "server-only";
import { sql } from "@vercel/postgres";
import { logMemberEvent, newCorrelationId } from "@/lib/events";
import { EVENT_SOURCES, EVENT_TYPES } from "@/lib/vocab";

export const MARKETING_CONSENT_VERSION = 1;
export const MARKETING_CONSENT_VERSION_LABEL = "marketing_email_v1";

type MarketingPreferenceParams = Readonly<{
  memberId: string;
  optedIn: boolean;
  source: string;
  metadata?: Record<string, unknown>;
}>;

export async function setMarketingPreference(
  params: MarketingPreferenceParams,
): Promise<void> {
  const consentValue = params.optedIn ? "opt_in" : "opt_out";
  const eventType = params.optedIn
    ? EVENT_TYPES.MARKETING_OPT_IN
    : EVENT_TYPES.MARKETING_OPT_OUT;
  const metadata = {
    channel: "email",
    purpose: "releases_events_news",
    ...params.metadata,
  };

  const updated = await sql<{ id: string }>`
    with updated as (
      update members
      set
        marketing_opt_in = ${params.optedIn},
        consent_first_at = case
          when ${params.optedIn} then coalesce(consent_first_at, now())
          else consent_first_at
        end,
        consent_latest_at = now(),
        consent_latest_version = ${MARKETING_CONSENT_VERSION}
      where id = ${params.memberId}::uuid
      returning id, email
    ),
    audit as (
      insert into member_consents (
        member_id,
        consent_type,
        consent_value,
        consent_version,
        captured_at,
        source,
        metadata
      )
      select
        id,
        'marketing',
        ${consentValue},
        ${MARKETING_CONSENT_VERSION_LABEL},
        now(),
        ${params.source},
        ${JSON.stringify(metadata)}::jsonb
      from updated
      returning id
    ),
    legacy_unsubscribe_removed as (
      delete from email_suppressions s
      using updated u
      where ${params.optedIn}
        and lower(s.email) = lower(u.email::text)
        and s.reason = 'unsubscribe'
      returning s.email
    )
    select id from updated
  `;

  if (!updated.rows[0]?.id) {
    throw new Error("Marketing preference member not found");
  }

  await logMemberEvent({
    memberId: params.memberId,
    eventType,
    source: EVENT_SOURCES.SERVER,
    correlationId: newCorrelationId(),
    payload: {
      consent_value: consentValue,
      consent_version: MARKETING_CONSENT_VERSION_LABEL,
      consent_source: params.source,
      ...metadata,
    },
  });
}
