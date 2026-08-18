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

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
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

async function checkoutEmail(
  userId: string | null,
  body: Body,
): Promise<string> {
  const user = userId ? await currentUser() : null;
  const emailFromClerk =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "";
  const emailFromBody = typeof body.email === "string" ? body.email : "";

  return normalizeEmail(emailFromClerk || emailFromBody);
}

type CheckoutIdentityResult =
  | {
      ok: true;
      customer: string | undefined;
    }
  | {
      ok: false;
      response: NextResponse;
    };

async function prepareCheckoutIdentity(params: {
  stripe: Stripe;
  userId: string | null;
  email: string;
  tier: "patron" | "partner";
}): Promise<CheckoutIdentityResult> {
  const { stripe, userId, email, tier } = params;

  if (!userId) {
    if (!email) {
      return {
        ok: false,
        response: NextResponse.json(
          { ok: false, error: "Email required when logged out" },
          { status: 400 },
        ),
      };
    }

    await ensureMemberByEmail({
      email,
      source: "checkout",
      sourceDetail: { intent: "stripe_checkout", tier },
    });

    return { ok: true, customer: undefined };
  }

  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Missing email for signed-in user" },
        { status: 500 },
      ),
    };
  }

  const { customerId } = await ensureStripeCustomerForClerkUser({
    stripe,
    clerkUserId: userId,
    email,
  });

  return { ok: true, customer: customerId };
}

function checkoutReturnUrls(
  body: Body,
): {
  successUrl: string;
  cancelUrl: string;
  billingReturnUrl: string;
} {
  const { pathname, params } = safeReturnToFromBody(
    APP_URL,
    body.returnTo,
    "/player",
  );

  return {
    successUrl: buildReturnUrl(APP_URL, pathname, params, {
      checkout: "success",
    }),
    cancelUrl: buildReturnUrl(APP_URL, pathname, params, {
      checkout: "cancel",
    }),
    billingReturnUrl: buildReturnUrl(APP_URL, pathname, params, {
      checkout: null,
    }),
  };
}

async function existingSubscriptionPortalResponse(params: {
  stripe: Stripe;
  userId: string | null;
  customer: string | undefined;
  billingReturnUrl: string;
}): Promise<NextResponse | null> {
  const { stripe, userId, customer, billingReturnUrl } = params;
  if (!userId || !customer) return null;

  const hasActive = await customerHasActiveSubscription(stripe, customer);
  if (!hasActive) return null;

  const portal = await stripe.billingPortal.sessions.create({
    customer,
    return_url: billingReturnUrl,
  });

  return NextResponse.json({
    ok: true,
    url: portal.url,
    via: "billing_portal",
  });
}

async function createSubscriptionCheckout(params: {
  stripe: Stripe;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
  userId: string | null;
  customer: string | undefined;
  email: string;
  tier: "patron" | "partner";
}) {
  const {
    stripe,
    priceId,
    successUrl,
    cancelUrl,
    userId,
    customer,
    email,
    tier,
  } = params;

  return stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: userId ?? undefined,
    customer,
    customer_email: !customer && email ? email : undefined,
    allow_promotion_codes: true,
    metadata: {
      requested_tier: tier,
      clerk_user_id: userId ?? "",
      source: "create-checkout-session",
    },
  });
}

export async function POST(req: Request) {
  const stripeSecretKey = assertStripeSecretKey(STRIPE_SECRET_KEY);
  must(APP_URL, "NEXT_PUBLIC_APP_URL");

  if (!sameOriginOrAllowed(req, APP_URL)) {
    return NextResponse.json(
      { ok: false, error: "Bad origin" },
      { status: 403 },
    );
  }

  const stripe = new Stripe(stripeSecretKey);
  const { userId } = await auth();
  const body = (await req.json().catch(() => ({}))) as Body;
  const email = await checkoutEmail(userId, body);
  const tier = pickTier(body.tier);
  const priceId = priceForTier(tier);

  const identity = await prepareCheckoutIdentity({
    stripe,
    userId,
    email,
    tier,
  });

  if (!identity.ok) {
    return identity.response;
  }

  const customer = identity.customer;
  const { successUrl, cancelUrl, billingReturnUrl } =
    checkoutReturnUrls(body);

  const portalResponse = await existingSubscriptionPortalResponse({
    stripe,
    userId,
    customer,
    billingReturnUrl,
  });
  if (portalResponse) return portalResponse;

  const session = await createSubscriptionCheckout({
    stripe,
    priceId,
    successUrl,
    cancelUrl,
    userId,
    customer,
    email,
    tier,
  });

  return NextResponse.json({ ok: true, url: session.url, via: "checkout" });
}
