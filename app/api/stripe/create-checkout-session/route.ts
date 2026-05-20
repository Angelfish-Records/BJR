// web/app/api/stripe/create-checkout-session/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { normalizeEmail, ensureMemberByEmail } from "../../../../lib/members";
import { ensureStripeCustomerForClerkUser } from "@/lib/stripeCustomer";
import { safeReturnToFromBody, buildReturnUrl } from "@/lib/returnTo";
import { assertStripePriceId, assertStripeSecretKey } from "@/lib/stripeEnv";

export const runtime = "nodejs";

const STRIPE_SECRET_KEY = assertStripeSecretKey(
  process.env.STRIPE_SECRET_KEY ?? "",
);
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "";

const PRICE_PATRON = process.env.STRIPE_PRICE_PATRON ?? "";
const PRICE_PARTNER = process.env.STRIPE_PRICE_PARTNER ?? "";

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

  if (allowsVercelPreviewOrigin() && o.hostname.endsWith(".vercel.app")) {
    return true;
  }

  return false;
}

type Body = {
  email?: unknown;
  tier?: unknown;
  returnTo?: unknown;
};

function pickTier(raw: unknown): "patron" | "partner" {
  return raw === "partner" ? "partner" : "patron";
}

function priceForTier(tier: "patron" | "partner"): string {
  if (tier === "partner") {
    return assertStripePriceId(PRICE_PARTNER, "STRIPE_PRICE_PARTNER");
  }

  return assertStripePriceId(PRICE_PATRON, "STRIPE_PRICE_PATRON");
}

function unwrapStripeResponse<T>(res: T | Stripe.Response<T>): T {
  if (res && typeof res === "object") {
    const r = res as unknown as { data?: T; lastResponse?: unknown };
    if (r.lastResponse && r.data !== undefined) return r.data;
  }
  return res as T;
}

async function customerHasActiveSubscription(
  stripe: Stripe,
  customerId: string,
): Promise<boolean> {
  const subsRes = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const subs = unwrapStripeResponse(subsRes);

  const list = Array.isArray((subs as Stripe.ApiList<Stripe.Subscription>).data)
    ? (subs as Stripe.ApiList<Stripe.Subscription>).data
    : [];

  return list.some(
    (s) =>
      s.status === "active" ||
      s.status === "trialing" ||
      s.status === "past_due" ||
      s.status === "unpaid",
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

  const user = userId ? await currentUser() : null;
  const emailFromClerk =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "";
  const emailFromBody = typeof body.email === "string" ? body.email : "";

  const email = normalizeEmail(emailFromClerk || emailFromBody);

  const tier = pickTier(body.tier);
  const priceId = priceForTier(tier);

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

  // Logged-in: ensure we have a Stripe customer (prevents duplicate customers + prefilled Checkout)
  let customer: string | undefined;
  if (userId) {
    if (!email) {
      return NextResponse.json(
        { ok: false, error: "Missing email for signed-in user" },
        { status: 500 },
      );
    }

    const { customerId } = await ensureStripeCustomerForClerkUser({
      stripe,
      clerkUserId: userId,
      email,
    });
    customer = customerId;
  }

  const { pathname, params } = safeReturnToFromBody(
    APP_URL,
    body.returnTo,
    "/player",
  );

  const success_url = buildReturnUrl(APP_URL, pathname, params, {
    checkout: "success",
  });
  const cancel_url = buildReturnUrl(APP_URL, pathname, params, {
    checkout: "cancel",
  });

  // billing portal return_url should not carry checkout; just return to the surface
  const billing_return_url = buildReturnUrl(APP_URL, pathname, params, {
    checkout: null,
  });

  // If logged-in and already subscribed, send to billing portal to avoid multiple subscriptions.
  if (userId && customer) {
    const hasActive = await customerHasActiveSubscription(stripe, customer);
    if (hasActive) {
      const portal = await stripe.billingPortal.sessions.create({
        customer,
        return_url: billing_return_url,
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
    success_url,
    cancel_url,

    // Logged-in path: webhook can resolve via clerk_user_id
    client_reference_id: userId ?? undefined,

    // Reuse if known
    customer,

    // Prefill email when we don't yet know the Stripe customer (logged-in or logged-out).
    // If `customer` is set, Stripe already knows the email and won't need this.
    customer_email: !customer && email ? email : undefined,

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
