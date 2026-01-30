// web/app/api/stripe/create-checkout-session/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { normalizeEmail, ensureMemberByEmail } from "../../../../lib/members";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

// New (recommended) explicit prices:
const PRICE_PATRON = process.env.STRIPE_PRICE_PATRON ?? "";
const PRICE_PARTNER = process.env.STRIPE_PRICE_PARTNER ?? "";

// Back-compat fallback (your current env):
const LEGACY_PRICE = process.env.STRIPE_TEST_SUB_PRICE_ID ?? "";

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function sameOriginOrAllowed(req: Request, appUrl: string): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  let app: URL;
  let o: URL;
  try {
    app = new URL(appUrl);
    o = new URL(origin);
  } catch {
    return false;
  }

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

type Body = {
  email?: unknown;
  tier?: unknown;
};

function pickTier(raw: unknown): "patron" | "partner" {
  return raw === "partner" ? "partner" : "patron";
}

function priceForTier(tier: "patron" | "partner"): string {
  // Prefer explicit tier prices; fall back to legacy for patron if present.
  if (tier === "partner") return PRICE_PARTNER;
  return PRICE_PATRON || LEGACY_PRICE;
}

async function lookupStripeCustomerIdByClerkUserId(
  userId: string,
): Promise<string | null> {
  const r = await sql`
    select stripe_customer_id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  return (r.rows[0]?.stripe_customer_id as string | null | undefined) ?? null;
}

async function customerHasActiveSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  // Avoid accidentally creating a second sub for an already-paying member.
  const subs = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  return subs.data.some(
    (s) =>
      s.status === "active" ||
      s.status === "trialing" ||
      s.status === "past_due",
  );
}

export async function POST(req: Request) {
  must(STRIPE_SECRET_KEY, "STRIPE_SECRET_KEY");
  must(APP_URL, "NEXT_PUBLIC_APP_URL");

  if (!sameOriginOrAllowed(req, APP_URL)) {
    return NextResponse.json(
      { ok: false, error: "Bad origin" },
      { status: 403 },
    );
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);
  const { userId } = await auth();

  const body = (await req.json().catch(() => ({}))) as Body;

  const emailFromBody = typeof body.email === "string" ? body.email : "";
  const email = normalizeEmail(emailFromBody);

  const tier = pickTier(body.tier);
  const priceId = priceForTier(tier);

  if (!priceId) {
    // Make the missing env explicit (avoid silent mis-billing)
    return NextResponse.json(
      {
        ok: false,
        error:
          tier === "partner"
            ? "Missing STRIPE_PRICE_PARTNER"
            : "Missing STRIPE_PRICE_PATRON (or STRIPE_TEST_SUB_PRICE_ID legacy)",
      },
      { status: 500 },
    );
  }

  // Logged out: require email so we can attach to canonical member row.
  if (!userId && !email) {
    return NextResponse.json(
      { ok: false, error: "Email required when logged out" },
      { status: 400 },
    );
  }

  // Pre-create/claim member for logged-out flow so canonical row exists immediately.
  if (!userId && email) {
    await ensureMemberByEmail({
      email,
      source: "checkout",
      sourceDetail: { intent: "stripe_checkout", tier },
      marketingOptIn: true,
    });
  }

  // Logged-in: reuse existing customer if linked (prevents duplicate customers)
  let customer: string | undefined;
  if (userId) {
    const cid = await lookupStripeCustomerIdByClerkUserId(userId);
    if (cid) customer = cid;
  }

  // If logged-in and already subscribed, send to billing portal to avoid multiple subscriptions.
  if (userId && customer) {
    const hasActive = await customerHasActiveSubscription(stripe, customer);
    if (hasActive) {
      const portal = await stripe.billingPortal.sessions.create({
        customer,
        return_url: `${APP_URL}/home`,
      });
      return NextResponse.json({
        ok: true,
        url: portal.url,
        via: "billing_portal",
      });
    }
  }

  // Otherwise: create a new subscription checkout for the chosen tier.
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${APP_URL}/home?checkout=success`,
    cancel_url: `${APP_URL}/home?checkout=cancel`,

    // Logged-in path: webhook can resolve via clerk_user_id
    client_reference_id: userId ?? undefined,

    // Reuse if known
    customer,

    // Logged-out path: let Stripe attach/collect email
    customer_email: !userId && email ? email : undefined,

    allow_promotion_codes: true,

    // Helpful for debugging in Stripe (not relied upon for auth)
    metadata: {
      requested_tier: tier,
      clerk_user_id: userId ?? "",
      source: "create-checkout-session",
    },
  });

  return NextResponse.json({ ok: true, url: session.url, via: "checkout" });
}
