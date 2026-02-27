// web/app/api/stripe/subscription-status/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function unwrapStripeResponse<T>(res: T | Stripe.Response<T>): T {
  if (res && typeof res === "object") {
    const r = res as unknown as { data?: T; lastResponse?: unknown };
    if (r.lastResponse && r.data !== undefined) return r.data;
  }
  return res as T;
}

function readNumberProp(obj: unknown, key: string): number | null {
  if (!obj || typeof obj !== "object") return null;
  if (!(key in obj)) return null;
  const v = (obj as Record<string, unknown>)[key];
  return typeof v === "number" ? v : null;
}

function pickPeriodEndUnixSeconds(sub: Stripe.Subscription): number | null {
  const subCpe = readNumberProp(sub, "current_period_end");
  if (typeof subCpe === "number") return subCpe;

  const itemCpe = sub.items?.data?.[0]?.current_period_end;
  return typeof itemCpe === "number" ? itemCpe : null;
}

function toIsoFromUnixSeconds(s: number | null): string | null {
  if (!s || s <= 0) return null;
  return new Date(s * 1000).toISOString();
}

export async function GET() {
  must(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 },
    );
  }

  const row = await sql`
    select stripe_customer_id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const customerId =
    (row.rows[0]?.stripe_customer_id as string | null | undefined) ?? null;

  if (!customerId) {
    return NextResponse.json({ ok: true, hasSubscription: false });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const subsRes = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const subs = unwrapStripeResponse(subsRes);

  let list: Stripe.Subscription[] = [];
  if (Array.isArray(subs)) {
    list = subs as Stripe.Subscription[];
  } else if (
    subs &&
    typeof subs === "object" &&
    "data" in (subs as object) &&
    Array.isArray((subs as Stripe.ApiList<Stripe.Subscription>).data)
  ) {
    list = (subs as Stripe.ApiList<Stripe.Subscription>).data;
  }

  const activeSet = new Set(["active", "trialing", "past_due", "unpaid"]);
  const active = list.filter((s) => activeSet.has(String(s.status ?? "")));

  if (active.length === 0) {
    return NextResponse.json({ ok: true, hasSubscription: false });
  }

  // pick latest period end
  let best = active[0]!;
  let bestEnd = pickPeriodEndUnixSeconds(best) ?? 0;

  for (const s of active.slice(1)) {
    const end = pickPeriodEndUnixSeconds(s) ?? 0;
    if (end > bestEnd) {
      best = s;
      bestEnd = end;
    }
  }

  return NextResponse.json({
    ok: true,
    hasSubscription: true,
    subscriptionId: best.id,
    status: best.status,
    cancelAtPeriodEnd: !!best.cancel_at_period_end,
    accessUntil: toIsoFromUnixSeconds(bestEnd || null),
  });
}
