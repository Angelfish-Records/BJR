// web/app/api/admin/reset-test-member/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { db, sql } from "@vercel/postgres";
import { assertLooksLikeEmail, normalizeEmail } from "@/lib/members";

export const runtime = "nodejs";

const EXPECTED_MEMBER_FKS = new Set([
  "campaign_sends_member_id_fkey",
  "campaigns_created_by_member_id_fkey",
  "entitlement_grants_member_id_fkey",
  "exegesis_comment_created_by_member_id_fkey",
  "exegesis_identity_member_id_fkey",
  "exegesis_mod_action_actor_member_id_fkey",
  "exegesis_report_reporter_member_id_fkey",
  "exegesis_vote_member_id_fkey",
  "gifts_recipient_member_id_fkey",
  "gifts_sender_member_id_fkey",
  "mailbag_questions_member_id_fkey",
  "member_consents_member_id_fkey",
  "member_events_member_id_fkey",
  "member_identity_member_id_fkey",
  "member_listen_totals_member_id_fkey",
  "member_playback_telemetry_dedupe_member_id_fkey",
  "member_track_listen_stats_member_id_fkey",
  "purchases_member_id_fkey",
  "referrals_referred_member_id_fkey",
  "referrals_referrer_member_id_fkey",
  "share_token_playback_events_member_id_fkey",
  "share_tokens_created_by_member_id_fkey",
  "surprise_sessions_member_id_fkey",
]);

const EXPECTED_MEMBER_COLUMNS = new Set([
  "campaign_sends.member_id",
  "campaigns.created_by_member_id",
  "download_throttle_member.member_id",
  "entitlement_grants.member_id",
  "exegesis_comment.created_by_member_id",
  "exegesis_group_map.created_by_member_id",
  "exegesis_identity.member_id",
  "exegesis_mod_action.actor_member_id",
  "exegesis_report.reporter_member_id",
  "exegesis_vote.member_id",
  "gifts.recipient_member_id",
  "gifts.sender_member_id",
  "mailbag_questions.member_id",
  "member_consents.member_id",
  "member_events.member_id",
  "member_identity.member_id",
  "member_listen_totals.member_id",
  "member_playback_telemetry_dedupe.member_id",
  "member_track_listen_stats.member_id",
  "purchases.member_id",
  "referrals.referred_member_id",
  "referrals.referrer_member_id",
  "share_token_playback_events.member_id",
  "share_token_plays.member_id",
  "share_tokens.created_by_member_id",
  "surprise_sessions.member_id",
]);

type ResetRequestBody = Readonly<{
  dryRun?: boolean;
  confirmEmail?: string;
}>;

type MemberRow = Readonly<{
  id: string;
  email: string;
  clerk_user_id: string | null;
  stripe_customer_id: string | null;
}>;

type ClerkDeleteResult = Readonly<{
  ok: boolean;
  status: number;
}>;

type BlockerCounts = Readonly<{
  admin_grants: number;
  campaigns_created: number;
  exegesis_comments: number;
  exegesis_group_maps: number;
  exegesis_mod_actions: number;
  exegesis_reports: number;
  gifts: number;
  mailbag_questions: number;
  purchases: number;
  referrals: number;
  share_tokens_created: number;
}>;

type CleanupCounts = Readonly<{
  campaign_sends_deleted: number;
  download_throttle_deleted: number;
  email_outbox_deleted: number;
  email_suppressions_deleted: number;
  entitlement_grants_deleted: number;
  member_consents_deleted: number;
  member_events_deleted: number;
  share_token_playback_events_deleted: number;
  share_token_plays_deleted: number;
  surprise_sessions_deleted: number;
  members_deleted: number;
}>;

function mustEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function toCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function difference(left: Set<string>, right: Set<string>): string[] {
  return [...left].filter((value) => !right.has(value)).sort();
}

async function deleteClerkUser(
  clerkUserId: string,
): Promise<ClerkDeleteResult> {
  const secret = mustEnv("CLERK_SECRET_KEY");
  const response = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (response.status === 404) return { ok: true, status: 404 };
  return { ok: response.ok, status: response.status };
}

async function inspectSchemaDrift() {
  const fkRows = await sql<{ constraint_name: string }>`
    select con.conname as constraint_name
    from pg_constraint con
    join pg_class parent on parent.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
    where con.contype = 'f'
      and parent_ns.nspname = 'public'
      and parent.relname = 'members'
    order by con.conname
  `;

  const actualForeignKeys = new Set(
    fkRows.rows.map((row) => row.constraint_name),
  );

  const columnRows = await sql<{ member_column: string }>`
    select c.relname || '.' || a.attname as member_column
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and a.attnum > 0
      and not a.attisdropped
      and (
        a.attname = 'member_id'
        or a.attname ~ '_member_id$'
      )
    order by c.relname, a.attname
  `;

  const actualMemberColumns = new Set(
    columnRows.rows.map((row) => row.member_column),
  );

  return {
    unexpectedForeignKeys: difference(actualForeignKeys, EXPECTED_MEMBER_FKS),
    missingForeignKeys: difference(EXPECTED_MEMBER_FKS, actualForeignKeys),
    unexpectedMemberColumns: difference(
      actualMemberColumns,
      EXPECTED_MEMBER_COLUMNS,
    ),
    missingMemberColumns: difference(
      EXPECTED_MEMBER_COLUMNS,
      actualMemberColumns,
    ),
  };
}

async function loadMember(email: string): Promise<MemberRow | null> {
  const result = await sql<MemberRow>`
    select
      id,
      email::text as email,
      clerk_user_id,
      stripe_customer_id
    from members
    where lower(email::text) = lower(${email})
    limit 1
  `;
  return result.rows[0] ?? null;
}

async function loadBlockerCounts(
  memberId: string,
  email: string,
): Promise<BlockerCounts> {
  const result = await sql`
    select
      (
        select count(*)::int
        from entitlement_grants
        where member_id = ${memberId}::uuid
          and entitlement_key = 'admin'
          and revoked_at is null
          and (expires_at is null or expires_at > now())
      ) as admin_grants,
      (
        select count(*)::int
        from campaigns
        where created_by_member_id = ${memberId}::uuid
      ) as campaigns_created,
      (
        select count(*)::int
        from exegesis_comment
        where created_by_member_id = ${memberId}::uuid
      ) as exegesis_comments,
      (
        select count(*)::int
        from exegesis_group_map
        where created_by_member_id = ${memberId}::uuid
      ) as exegesis_group_maps,
      (
        select count(*)::int
        from exegesis_mod_action
        where actor_member_id = ${memberId}::uuid
      ) as exegesis_mod_actions,
      (
        select count(*)::int
        from exegesis_report
        where reporter_member_id = ${memberId}::uuid
      ) as exegesis_reports,
      (
        select count(*)::int
        from gifts
        where sender_member_id = ${memberId}::uuid
           or recipient_member_id = ${memberId}::uuid
           or lower(sender_email::text) = lower(${email})
           or lower(recipient_email::text) = lower(${email})
      ) as gifts,
      (
        select count(*)::int
        from mailbag_questions
        where member_id = ${memberId}::uuid
      ) as mailbag_questions,
      (
        select count(*)::int
        from purchases
        where member_id = ${memberId}::uuid
      ) as purchases,
      (
        select count(*)::int
        from referrals
        where referrer_member_id = ${memberId}::uuid
           or referred_member_id = ${memberId}::uuid
      ) as referrals,
      (
        select count(*)::int
        from share_tokens
        where created_by_member_id = ${memberId}::uuid
      ) as share_tokens_created
  `;

  const row = result.rows[0] ?? {};

  return {
    admin_grants: toCount(row.admin_grants),
    campaigns_created: toCount(row.campaigns_created),
    exegesis_comments: toCount(row.exegesis_comments),
    exegesis_group_maps: toCount(row.exegesis_group_maps),
    exegesis_mod_actions: toCount(row.exegesis_mod_actions),
    exegesis_reports: toCount(row.exegesis_reports),
    gifts: toCount(row.gifts),
    mailbag_questions: toCount(row.mailbag_questions),
    purchases: toCount(row.purchases),
    referrals: toCount(row.referrals),
    share_tokens_created: toCount(row.share_tokens_created),
  };
}

function blockerLabels(
  member: MemberRow,
  counts: BlockerCounts,
): string[] {
  const blockers: string[] = [];

  if (member.stripe_customer_id) blockers.push("stripe_customer_id");
  if (counts.admin_grants > 0) blockers.push(`admin_grants:${counts.admin_grants}`);
  if (counts.campaigns_created > 0) {
    blockers.push(`campaigns_created:${counts.campaigns_created}`);
  }
  if (counts.exegesis_comments > 0) {
    blockers.push(`exegesis_comments:${counts.exegesis_comments}`);
  }
  if (counts.exegesis_group_maps > 0) {
    blockers.push(`exegesis_group_maps:${counts.exegesis_group_maps}`);
  }
  if (counts.exegesis_mod_actions > 0) {
    blockers.push(`exegesis_mod_actions:${counts.exegesis_mod_actions}`);
  }
  if (counts.exegesis_reports > 0) {
    blockers.push(`exegesis_reports:${counts.exegesis_reports}`);
  }
  if (counts.gifts > 0) blockers.push(`gifts:${counts.gifts}`);
  if (counts.mailbag_questions > 0) {
    blockers.push(`mailbag_questions:${counts.mailbag_questions}`);
  }
  if (counts.purchases > 0) blockers.push(`purchases:${counts.purchases}`);
  if (counts.referrals > 0) blockers.push(`referrals:${counts.referrals}`);
  if (counts.share_tokens_created > 0) {
    blockers.push(`share_tokens_created:${counts.share_tokens_created}`);
  }

  return blockers;
}

async function cleanupAddressWithoutMember(email: string) {
  const client = await db.connect();

  try {
    await client.sql`begin`;

    const campaignSends = await client.sql`
      delete from campaign_sends
      where lower(to_email) = lower(${email})
    `;
    const emailOutbox = await client.sql`
      delete from email_outbox
      where lower(to_email::text) = lower(${email})
    `;
    const suppressions = await client.sql`
      delete from email_suppressions
      where lower(email) = lower(${email})
    `;

    await client.sql`commit`;

    return {
      campaign_sends_deleted: campaignSends.rowCount ?? 0,
      email_outbox_deleted: emailOutbox.rowCount ?? 0,
      email_suppressions_deleted: suppressions.rowCount ?? 0,
    };
  } catch (err) {
    try {
      await client.sql`rollback`;
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function hardDeleteMember(
  member: MemberRow,
): Promise<CleanupCounts> {
  const client = await db.connect();

  try {
    await client.sql`begin`;

    const campaignSends = await client.sql`
      delete from campaign_sends
      where member_id = ${member.id}::uuid
         or lower(to_email) = lower(${member.email})
    `;
    const downloadThrottle = await client.sql`
      delete from download_throttle_member
      where member_id = ${member.id}
    `;
    const emailOutbox = await client.sql`
      delete from email_outbox
      where lower(to_email::text) = lower(${member.email})
    `;
    const suppressions = await client.sql`
      delete from email_suppressions
      where lower(email) = lower(${member.email})
    `;
    const entitlementGrants = await client.sql`
      delete from entitlement_grants
      where member_id = ${member.id}::uuid
    `;
    const memberConsents = await client.sql`
      delete from member_consents
      where member_id = ${member.id}::uuid
    `;
    const memberEvents = await client.sql`
      delete from member_events
      where member_id = ${member.id}::uuid
    `;
    const playbackEvents = await client.sql`
      delete from share_token_playback_events
      where member_id = ${member.id}::uuid
    `;
    const shareTokenPlays = await client.sql`
      delete from share_token_plays
      where member_id = ${member.id}::uuid
    `;
    const surpriseSessions = await client.sql`
      delete from surprise_sessions
      where member_id = ${member.id}::uuid
    `;

    const memberDelete = await client.sql`
      delete from members
      where id = ${member.id}::uuid
        and lower(email::text) = lower(${member.email})
    `;

    if ((memberDelete.rowCount ?? 0) !== 1) {
      throw new Error("Expected to delete exactly one members row");
    }

    await client.sql`commit`;

    return {
      campaign_sends_deleted: campaignSends.rowCount ?? 0,
      download_throttle_deleted: downloadThrottle.rowCount ?? 0,
      email_outbox_deleted: emailOutbox.rowCount ?? 0,
      email_suppressions_deleted: suppressions.rowCount ?? 0,
      entitlement_grants_deleted: entitlementGrants.rowCount ?? 0,
      member_consents_deleted: memberConsents.rowCount ?? 0,
      member_events_deleted: memberEvents.rowCount ?? 0,
      share_token_playback_events_deleted: playbackEvents.rowCount ?? 0,
      share_token_plays_deleted: shareTokenPlays.rowCount ?? 0,
      surprise_sessions_deleted: surpriseSessions.rowCount ?? 0,
      members_deleted: memberDelete.rowCount ?? 0,
    };
  } catch (err) {
    try {
      await client.sql`rollback`;
    } catch {}
    throw err;
  } finally {
    client.release();
  }
}

async function verifyClean(email: string) {
  const result = await sql`
    select
      (
        select count(*)::int
        from members
        where lower(email::text) = lower(${email})
      ) as members,
      (
        select count(*)::int
        from campaign_sends
        where lower(to_email) = lower(${email})
      ) as campaign_sends,
      (
        select count(*)::int
        from email_outbox
        where lower(to_email::text) = lower(${email})
      ) as email_outbox,
      (
        select count(*)::int
        from email_suppressions
        where lower(email) = lower(${email})
      ) as email_suppressions,
      (
        select count(*)::int
        from gifts
        where lower(sender_email::text) = lower(${email})
           or lower(recipient_email::text) = lower(${email})
      ) as gifts
  `;

  const row = result.rows[0] ?? {};

  return {
    members: toCount(row.members),
    campaign_sends: toCount(row.campaign_sends),
    email_outbox: toCount(row.email_outbox),
    email_suppressions: toCount(row.email_suppressions),
    gifts: toCount(row.gifts),
  };
}

export async function POST(req: NextRequest) {
  const adminSecret = mustEnv("ADMIN_NUKE_SECRET");
  if ((req.headers.get("x-admin-secret") ?? "") !== adminSecret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const testEmail = normalizeEmail(mustEnv("TEST_MEMBER_RESET_EMAIL"));
  assertLooksLikeEmail(testEmail);

  const body = (await req.json().catch(() => null)) as ResetRequestBody | null;
  const dryRun = body?.dryRun !== false;

  const schemaDrift = await inspectSchemaDrift();
  const hasSchemaDrift =
    schemaDrift.unexpectedForeignKeys.length > 0 ||
    schemaDrift.missingForeignKeys.length > 0 ||
    schemaDrift.unexpectedMemberColumns.length > 0 ||
    schemaDrift.missingMemberColumns.length > 0;

  if (hasSchemaDrift) {
    return NextResponse.json(
      {
        ok: false,
        error: "Schema drift detected; reset refused",
        testEmail,
        schemaDrift,
      },
      { status: 409 },
    );
  }

  const member = await loadMember(testEmail);

  if (!member) {
    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        testEmail,
        memberFound: false,
        blockers: [],
        schemaDrift,
        residualAddressState: await verifyClean(testEmail),
      });
    }

    if (normalizeEmail(body?.confirmEmail ?? "") !== testEmail) {
      return NextResponse.json(
        { ok: false, error: "Exact test-email confirmation required" },
        { status: 400 },
      );
    }

    const cleanup = await cleanupAddressWithoutMember(testEmail);

    return NextResponse.json({
      ok: true,
      dryRun: false,
      testEmail,
      memberFound: false,
      addressStateCleared: true,
      cleanup,
      verification: await verifyClean(testEmail),
    });
  }

  const counts = await loadBlockerCounts(member.id, testEmail);
  const blockers = blockerLabels(member, counts);

  if (dryRun || blockers.length > 0) {
    return NextResponse.json(
      {
        ok: blockers.length === 0,
        dryRun: true,
        testEmail,
        memberFound: true,
        member: {
          id: member.id,
          clerkLinked: Boolean(member.clerk_user_id),
          stripeLinked: Boolean(member.stripe_customer_id),
        },
        blockerCounts: counts,
        blockers,
        schemaDrift,
      },
      blockers.length > 0 ? { status: 409 } : undefined,
    );
  }

  if (normalizeEmail(body?.confirmEmail ?? "") !== testEmail) {
    return NextResponse.json(
      { ok: false, error: "Exact test-email confirmation required" },
      { status: 400 },
    );
  }

  let clerk: ClerkDeleteResult | null = null;
  if (member.clerk_user_id) {
    clerk = await deleteClerkUser(member.clerk_user_id);
    if (!clerk.ok) {
      return NextResponse.json(
        { ok: false, error: "Clerk delete failed", clerk },
        { status: 502 },
      );
    }
  }

  try {
    const cleanup = await hardDeleteMember(member);
    const verification = await verifyClean(testEmail);

    const clean =
      verification.members === 0 &&
      verification.campaign_sends === 0 &&
      verification.email_outbox === 0 &&
      verification.email_suppressions === 0 &&
      verification.gifts === 0;

    if (!clean) {
      return NextResponse.json(
        {
          ok: false,
          error: "Post-reset verification found residual state",
          clerk,
          cleanup,
          verification,
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      testEmail,
      memberFound: true,
      memberIdDeleted: member.id,
      clerk,
      cleanup,
      verification,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "Neon hard reset failed after Clerk delete",
        detail: err instanceof Error ? err.message : String(err),
        clerk,
      },
      { status: 500 },
    );
  }
}
