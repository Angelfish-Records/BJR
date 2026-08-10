// web/app/api/stripe/cancel-subscription/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import { assertStripeSecretKey } from "@/lib/stripeEnv";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""; // used only for same-origin guard

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function allowsVercelPreviewOrigin(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ALLOW_VERCEL_PREVIEW_CHECKOUT_ORIGINS === "true"
  );
}

function safeOrigin(req: Request): string | null {
  const o = req.headers.get("origin");
  return o ? o.toString() : null;
}

function parseOrigin(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Allow: exact origin, www ↔ bare swap, and vercel previews
function sameOriginOrAllowed(req: Request): boolean {
  const origin = safeOrigin(req);
  if (!origin) return true;

  const o = parseOrigin(origin);
  const app = parseOrigin(APP_URL);
  if (!o || !app) return false;

  if (o.origin === app.origin) return true;

  const stripWww = (h: string) => h.replace(/^www\./, "");
  if (
    stripWww(o.hostname) === stripWww(app.hostname) &&
    o.protocol === app.protocol
  )
    return true;

  if (allowsVercelPreviewOrigin() && o.hostname.endsWith(".vercel.app")) {
    return true;
  }

  return false;
}

// Stripe SDK sometimes returns either a plain object (e.g. ApiList) OR a Stripe.Response<T> wrapper.
// Do NOT treat "has a .data field" as "is wrapped", because many real Stripe objects also have .data.
function unwrapStripeResponse<T>(res: T | Stripe.Response<T>): T {
  if (res && typeof res === "object") {
    const r = res as unknown as { data?: T; lastResponse?: unknown };
    // Stripe.Response<T> includes `lastResponse`; plain payloads (ApiList, Subscription, etc.) do not.
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

function safeErrMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

type MemberStripeRow = { member_id: string; stripe_customer_id: string | null };

function isDebug(req: Request): boolean {
  // enable with /api/stripe/cancel-subscription?debug=1
  // or curl -H "x-debug: 1"
  try {
    const u = new URL(req.url);
    if (u.searchParams.get("debug") === "1") return true;
  } catch {
    // ignore
  }
  return (req.headers.get("x-debug") ?? "") === "1";
}

async function memberStripeCustomerId(userId: string): Promise<string> {
  const row = await sql`
    select id as member_id, stripe_customer_id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const member = (row.rows[0] as MemberStripeRow | undefined) ?? null;
  return (member?.stripe_customer_id ?? "").toString().trim();
}

function normalizeSubscriptionList(value: unknown): Stripe.Subscription[] {
  if (Array.isArray(value)) {
    return value as Stripe.Subscription[];
  }

  if (
    value &&
    typeof value === "object" &&
    "data" in value &&
    Array.isArray((value as { data?: unknown }).data)
  ) {
    return (value as { data: Stripe.Subscription[] }).data;
  }

  return [];
}

function activeSubscriptions(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription[] {
  const activeSet = new Set(["active", "trialing", "past_due", "unpaid"]);
  return subscriptions.filter((subscription) =>
    activeSet.has(String(subscription.status ?? "")),
  );
}

async function readDebugStripeState(userId: string): Promise<unknown> {
  try {
    const result = await sql`
      select id, stripe_customer_id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `;

    return {
      memberRow: result.rows[0] ?? null,
    };
  } catch (error) {
    return { error: safeErrMessage(error) };
  }
}

function debugSubscriptionRows(
  subscriptions: Stripe.Subscription[],
): Array<{
  id: string;
  status: string;
  cancel_at_period_end: boolean | null;
  current_period_end: number | null;
  itemsCount: number;
  priceIds: string[];
}> {
  return subscriptions.map((subscription) => {
    const currentPeriodEnd =
      typeof (subscription as unknown as { current_period_end?: unknown })
        .current_period_end === "number"
        ? (subscription as unknown as { current_period_end: number })
            .current_period_end
        : null;

    return {
      id: subscription.id,
      status: subscription.status,
      cancel_at_period_end: subscription.cancel_at_period_end ?? null,
      current_period_end: currentPeriodEnd,
      itemsCount: (subscription.items?.data ?? []).length,
      priceIds: (subscription.items?.data ?? [])
        .map((item) => item.price?.id ?? null)
        .filter((value): value is string => Boolean(value)),
    };
  });
}

async function debugCancellationResponse(params: {
  userId: string;
  customerId: string;
  stripeSecretKey: string;
  rawSubscriptions: unknown;
  subscriptions: Stripe.Subscription[];
  targetCount: number;
}) {
  const {
    userId,
    customerId,
    stripeSecretKey,
    rawSubscriptions,
    subscriptions,
    targetCount,
  } = params;
  const dbStripeState = await readDebugStripeState(userId);

  return NextResponse.json({
    ok: true,
    debug: true,
    userId,
    customerId,
    stripeKeyHint: stripeSecretKey.slice(0, 7) + "...",
    subsShape: {
      isArray: Array.isArray(rawSubscriptions),
      hasDataProp: Boolean(
        rawSubscriptions &&
          typeof rawSubscriptions === "object" &&
          "data" in rawSubscriptions,
      ),
      keys:
        rawSubscriptions && typeof rawSubscriptions === "object"
          ? Object.keys(rawSubscriptions).slice(0, 10)
          : [],
      listCount: subscriptions.length,
      targetCount,
    },
    subs: debugSubscriptionRows(subscriptions),
    db: dbStripeState,
  });
}

type UpdatedSubscription = {
  id: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
};

async function cancelSubscriptionsAtPeriodEnd(
  stripe: Stripe,
  subscriptions: Stripe.Subscription[],
): Promise<UpdatedSubscription[]> {
  const updated: UpdatedSubscription[] = [];

  for (const subscription of subscriptions) {
    const result = await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    const updatedSubscription = unwrapStripeResponse(result);

    const itemEnd =
      updatedSubscription.items?.data?.[0]?.current_period_end ??
      readNumberProp(updatedSubscription, "current_period_end");

    updated.push({
      id: updatedSubscription.id,
      cancel_at_period_end: Boolean(
        updatedSubscription.cancel_at_period_end,
      ),
      current_period_end: typeof itemEnd === "number" ? itemEnd : null,
    });
  }

  return updated;
}

function latestAccessEndMs(
  updated: UpdatedSubscription[],
): number | null {
  return updated.reduce<number | null>((acc, subscription) => {
    if (typeof subscription.current_period_end !== "number") return acc;

    const currentEndMs = subscription.current_period_end * 1000;
    if (acc === null) return currentEndMs;

    return Math.max(acc, currentEndMs);
  }, null);
}

export async function POST(req: Request) {
  const stripeSecretKey = assertStripeSecretKey(STRIPE_SECRET_KEY);
  must(APP_URL, "NEXT_PUBLIC_APP_URL");

  const debug = isDebug(req);

  if (!sameOriginOrAllowed(req)) {
    return NextResponse.json(
      { ok: false, error: "Bad origin" },
      { status: 403 },
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Not signed in" },
      { status: 401 },
    );
  }

  const customerId = await memberStripeCustomerId(userId);
  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "No stripe_customer_id linked for this member" },
      { status: 400 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const subsRes = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const subs = unwrapStripeResponse(subsRes);
  const list = normalizeSubscriptionList(subs);
  const target = activeSubscriptions(list);

  if (debug) {
    return debugCancellationResponse({
      userId,
      customerId,
      stripeSecretKey,
      rawSubscriptions: subs,
      subscriptions: list,
      targetCount: target.length,
    });
  }

  if (target.length === 0) {
    return NextResponse.json({
      ok: true,
      updated: [],
      note: "No active subscriptions found",
    });
  }

  const updated = await cancelSubscriptionsAtPeriodEnd(stripe, target);
  const maxEndMs = latestAccessEndMs(updated);

  return NextResponse.json({
    ok: true,
    updated,
    cancelAtPeriodEnd: true,
    accessUntil: maxEndMs ? new Date(maxEndMs).toISOString() : null,
  });
}
