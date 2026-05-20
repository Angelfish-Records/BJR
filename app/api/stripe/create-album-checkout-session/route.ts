// web/app/api/stripe/create-album-checkout-session/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureStripeCustomerForClerkUser } from "@/lib/stripeCustomer";
import {
  buildCheckoutReturnUrl,
  safeCheckoutReturnTo,
  sameOriginOrAllowed,
} from "@/lib/checkoutReturnUrl";
import { getAlbumOffer } from "../../../../lib/albumOffers";
import { normalizeEmail, ensureMemberByEmail } from "../../../../lib/members";
import { assertStripePriceId, assertStripeSecretKey } from "@/lib/stripeEnv";

export const runtime = "nodejs";

function must(value: string, name: string): string {
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

type Body = {
  albumSlug?: unknown;
  email?: unknown;
  returnTo?: unknown;
};

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = assertStripeSecretKey(
    process.env.STRIPE_SECRET_KEY ?? "",
  );
  const APP_URL = must(
    process.env.NEXT_PUBLIC_APP_URL ?? "",
    "NEXT_PUBLIC_APP_URL",
  );

  if (!sameOriginOrAllowed(req, APP_URL)) {
    return NextResponse.json(
      { ok: false, error: "Bad origin" },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const albumSlug = (body?.albumSlug ?? "").toString().trim().toLowerCase();

  if (!albumSlug) {
    return NextResponse.json(
      { ok: false, error: "Missing albumSlug" },
      { status: 400 },
    );
  }

  const offer = getAlbumOffer(albumSlug);
  if (!offer) {
    return NextResponse.json(
      { ok: false, error: "Unknown albumSlug" },
      { status: 400 },
    );
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const { userId } = await auth();
  const user = userId ? await currentUser() : null;
  const emailFromClerk =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "";
  const emailFromBody = typeof body?.email === "string" ? body.email : "";
  const email = normalizeEmail(emailFromClerk || emailFromBody);

  if (!userId && !email) {
    return NextResponse.json(
      { ok: false, error: "Email required when logged out" },
      { status: 400 },
    );
  }

  if (!userId && email) {
    await ensureMemberByEmail({
      email,
      source: "album_checkout",
      sourceDetail: {
        intent: "stripe_album_checkout",
        albumSlug: offer.albumSlug,
      },
      marketingOptIn: true,
    });
  }

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

  const returnTarget = safeCheckoutReturnTo(APP_URL, body?.returnTo, "/player");

  const success_url = buildCheckoutReturnUrl(
    APP_URL,
    returnTarget.pathname,
    returnTarget.params,
    {
      gift: null,
      checkout: "success",
    },
  );

  const cancel_url = buildCheckoutReturnUrl(
    APP_URL,
    returnTarget.pathname,
    returnTarget.params,
    {
      gift: null,
      checkout: "cancel",
    },
  );

  const priceId = assertStripePriceId(
    offer.stripePriceId,
    `stripe price for album ${offer.albumSlug}`,
  );

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,

    success_url,
    cancel_url,

    client_reference_id: userId ?? undefined,
    customer,
    customer_email: !customer && email ? email : undefined,

    metadata: { albumSlug: offer.albumSlug, offer: "digital_album" },
  });

  return NextResponse.json({ ok: true, url: session.url });
}
