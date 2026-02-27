// web/app/api/stripe/cancel-subscription/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? ""; // used only for same-origin guard

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
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

  if (o.hostname.endsWith(".vercel.app")) return true;

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

export async function POST(req: Request) {
  must(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  must(APP_URL, "NEXT_PUBLIC_APP_URL");

  const debug = isDebug(req);

  // Optional guard; auth is the real gate.
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

  const row = await sql`
    select id as member_id, stripe_customer_id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const m = (row.rows[0] as MemberStripeRow | undefined) ?? null;
  const customerId = (m?.stripe_customer_id ?? "").toString().trim();

  if (!customerId) {
    return NextResponse.json(
      { ok: false, error: "No stripe_customer_id linked for this member" },
      { status: 400 },
    );
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  // List subs for this customer
  const subsRes = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 100,
  });
  const subs = unwrapStripeResponse(subsRes);

  // Normalize shapes into Stripe.Subscription[]
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
  const target = list.filter((s) => activeSet.has(String(s.status ?? "")));

  if (debug) {
    // Optional DB cross-check: if you store subscriptions somewhere, surface it.
    // This query is safe to keep even if table doesn't exist (wrap in try/catch).
    let dbStripeState: unknown = null;
    try {
      const r = await sql`
      select id, stripe_customer_id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `;
      dbStripeState = {
        memberRow: r.rows[0] ?? null,
      };
    } catch (e) {
      dbStripeState = { error: safeErrMessage(e) };
    }

    const snapshot = {
      ok: true,
      debug: true,
      userId,
      customerId,
      stripeKeyHint: (STRIPE_SECRET_KEY ?? "").slice(0, 7) + "...", // proves which env key is in use
      subsShape: {
        isArray: Array.isArray(subs),
        hasDataProp: !!(
          subs &&
          typeof subs === "object" &&
          "data" in (subs as object)
        ),
        keys:
          subs && typeof subs === "object"
            ? Object.keys(subs as object).slice(0, 10)
            : [],
        listCount: list.length,
        targetCount: target.length,
      },
      subs: list.map((s) => ({
        id: s.id,
        status: s.status,
        cancel_at_period_end: s.cancel_at_period_end ?? null,
        current_period_end:
          typeof (s as unknown as { current_period_end?: unknown })
            .current_period_end === "number"
            ? (s as unknown as { current_period_end: number })
                .current_period_end
            : null,
        itemsCount: (s.items?.data ?? []).length,
        priceIds: (s.items?.data ?? [])
          .map((it) => it.price?.id ?? null)
          .filter((v): v is string => !!v),
      })),
      db: dbStripeState,
    };

    return NextResponse.json(snapshot);
  }

  if (target.length === 0) {
    return NextResponse.json({
      ok: true,
      updated: [],
      note: "No active subscriptions found",
    });
  }

  const updated: Array<{
    id: string;
    cancel_at_period_end: boolean;
    current_period_end: number | null;
  }> = [];

  for (const s of target) {
    // “Cancel now” = stop renewal, keep access until end of paid period
    const res = await stripe.subscriptions.update(s.id, {
      cancel_at_period_end: true,
    });
    const sub = unwrapStripeResponse(res);

    // Avoid `sub.current_period_end` (your Stripe typings don’t expose it).
    // Pull from first subscription item (present in real payloads) or fall back to a safe prop read.
    const itemEnd =
      sub.items?.data?.[0]?.current_period_end ??
      readNumberProp(sub, "current_period_end"); // fallback if it exists at runtime

    updated.push({
      id: sub.id,
      cancel_at_period_end: !!sub.cancel_at_period_end,
      current_period_end: typeof itemEnd === "number" ? itemEnd : null,
    });
  }

  // IMPORTANT: do not mutate entitlements here.
  // Webhook (subscription.updated/deleted) will reconcile into entitlement_grants.
  const maxEndMs = updated.reduce<number | null>((acc, u) => {
    if (typeof u.current_period_end !== "number") return acc;
    const ms = u.current_period_end * 1000;
    if (acc === null) return ms;
    return Math.max(acc, ms);
  }, null);

  return NextResponse.json({
    ok: true,
    updated,
    cancelAtPeriodEnd: true,
    accessUntil: maxEndMs ? new Date(maxEndMs).toISOString() : null,
  });
}
