// web/app/api/admin/members/dashboard/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

function parsePeriodDays(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  if (parsed <= 0) return 30;
  if (parsed > 99999) return 99999;
  return Math.floor(parsed);
}

type TotalsRow = {
  members: number | string;
  joined_in_period: number | string;
  linked_clerk: number | string;
  linked_stripe: number | string;
};

type TierRow = {
  entitlement_key: string;
  count: number | string;
};

type RecentJoinRow = {
  date: string;
  count: number | string;
};

function toInt(value: number | string): number {
  return typeof value === "number" ? value : Number(value);
}

export async function GET(req: Request) {
  try {
    await requireAdminMemberId();

    const url = new URL(req.url);
    const periodDays = parsePeriodDays(url.searchParams.get("periodDays"));

    const totalsResult = await sql<TotalsRow>`
      select
        count(*)::int as members,
        count(*) filter (
          where created_at >= now() - (${String(periodDays)} || ' days')::interval
        )::int as joined_in_period,
        count(*) filter (where clerk_user_id is not null)::int as linked_clerk,
        count(*) filter (where stripe_customer_id is not null)::int as linked_stripe
      from members
    `;

    const tiersResult = await sql<TierRow>`
      select
        entitlement_key,
        count(distinct member_id)::int as count
      from member_entitlements_current
      where entitlement_key in ('tier_friend', 'tier_patron', 'tier_partner')
      group by entitlement_key
      order by entitlement_key asc
    `;

    const recentJoinsResult = await sql<RecentJoinRow>`
      select
        to_char(date_trunc('day', created_at), 'YYYY-MM-DD') as date,
        count(*)::int as count
      from members
      where created_at >= now() - (${String(periodDays)} || ' days')::interval
      group by 1
      order by 1 desc
      limit 14
    `;

    const totalsRow = totalsResult.rows[0] ?? {
      members: 0,
      joined_in_period: 0,
      linked_clerk: 0,
      linked_stripe: 0,
    };

    return NextResponse.json({
      ok: true,
      periodDays,
      totals: {
        members: toInt(totalsRow.members),
        joinedInPeriod: toInt(totalsRow.joined_in_period),
        linkedClerk: toInt(totalsRow.linked_clerk),
        linkedStripe: toInt(totalsRow.linked_stripe),
      },
      tiers: tiersResult.rows.map((row) => ({
        entitlement_key: row.entitlement_key,
        count: toInt(row.count),
      })),
      recentJoins: recentJoinsResult.rows.map((row) => ({
        date: row.date,
        count: toInt(row.count),
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}
