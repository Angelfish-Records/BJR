// web/app/api/gifts/create/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { sql } from "@vercel/postgres";
import { auth, currentUser } from "@clerk/nextjs/server";

import { getAlbumOffer } from "@/lib/albumOffers";
import { assertLooksLikeEmail, normalizeEmail } from "@/lib/members";
import { newCorrelationId } from "@/lib/events";

export const runtime = "nodejs";

type Req = {
  albumSlug: string;
  recipientEmail: string;
  message?: string;
  returnTo?: unknown; // NEW
};

function must(v: string, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function safeOrigin(req: NextRequest): string {
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  if (env) return env.replace(/\/$/, "");
  return req.nextUrl.origin;
}

// --- returnTo sanitization (local + deterministic) ---
const PRESERVE_PREFIXES = ["utm_"];
const PRESERVE_KEYS = new Set<string>([
  "st",
  "share",
  "autoplay",
  "post",
  "pt",
  "gift",
  "checkout",
]);
const STRIP_KEYS = new Set<string>(["p", "panel", "album", "track", "t"]);

function looksLikeSafeRelativePath(s: string): boolean {
  if (!s.startsWith("/")) return false;
  if (s.startsWith("//")) return false;
  // reject encoded scheme attempts
  const lower = s.toLowerCase();
  if (lower.includes("://")) return false;
  return true;
}

function isDisallowedPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/studio") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/trpc")
  );
}

function pickPreservedParams(u: URL): URLSearchParams {
  const out = new URLSearchParams();

  // normalize share → st
  const st = (
    u.searchParams.get("st") ??
    u.searchParams.get("share") ??
    ""
  ).trim();
  if (st) out.set("st", st);

  const autoplay = (u.searchParams.get("autoplay") ?? "").trim();
  if (autoplay) out.set("autoplay", autoplay);

  for (const k of ["post", "pt", "gift", "checkout"] as const) {
    const v = (u.searchParams.get(k) ?? "").trim();
    if (v) out.set(k, v);
  }

  for (const [k, v] of u.searchParams.entries()) {
    if (PRESERVE_PREFIXES.some((p) => k.startsWith(p)) && v) out.set(k, v);
  }

  return out;
}

function safeReturnTo(
  baseOrigin: string,
  raw: unknown,
  fallbackPath: string,
): { pathname: string; params: URLSearchParams } {
  const fallback = { pathname: fallbackPath, params: new URLSearchParams() };

  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (!s) return fallback;
  if (!looksLikeSafeRelativePath(s)) return fallback;

  let u: URL;
  try {
    u = new URL(s, baseOrigin);
  } catch {
    return fallback;
  }

  if (isDisallowedPath(u.pathname)) return fallback;

  // sanitize query: preserve only allowed secondary keys, strip legacy surface keys
  const out = new URLSearchParams();
  const preserved = pickPreservedParams(u);

  for (const [k, v] of preserved.entries()) {
    if (STRIP_KEYS.has(k)) continue;
    if (
      PRESERVE_KEYS.has(k) ||
      PRESERVE_PREFIXES.some((p) => k.startsWith(p))
    ) {
      const vv = (v ?? "").trim();
      if (vv) out.set(k, vv);
    }
  }

  // normalize share → st (never keep both)
  const st = (out.get("st") ?? out.get("share") ?? "").trim();
  out.delete("share");
  if (st) out.set("st", st);

  return { pathname: u.pathname, params: out };
}

function buildReturnUrl(
  baseOrigin: string,
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): string {
  const dest = new URL(pathname, baseOrigin);
  for (const [k, v] of params.entries()) dest.searchParams.set(k, v);

  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || String(v).trim() === "") {
      dest.searchParams.delete(k);
    } else {
      dest.searchParams.set(k, String(v));
    }
  }

  return dest.toString();
}

export async function POST(req: NextRequest) {
  const correlationId = newCorrelationId();

  const body = (await req.json().catch(() => null)) as Req | null;
  if (!body?.albumSlug || !body?.recipientEmail) {
    return NextResponse.json(
      { ok: false, error: "MISSING_FIELDS" },
      { status: 400 },
    );
  }

  const albumSlug = String(body.albumSlug).trim().toLowerCase();
  const offer = getAlbumOffer(albumSlug);
  if (!offer) {
    return NextResponse.json(
      { ok: false, error: "UNKNOWN_ALBUM" },
      { status: 404 },
    );
  }

  const recipientEmail = normalizeEmail(String(body.recipientEmail));
  try {
    assertLooksLikeEmail(recipientEmail);
  } catch {
    return NextResponse.json(
      { ok: false, error: "INVALID_RECIPIENT_EMAIL" },
      { status: 400 },
    );
  }

  const message = body.message ? String(body.message).slice(0, 1200) : null;

  // Optional sender context (anon allowed)
  const { userId } = await auth();
  let senderMemberId: string | null = null;
  let senderEmail: string | null = null;

  if (userId) {
    const u = await currentUser();
    senderEmail =
      normalizeEmail(
        u?.emailAddresses?.find((e) => e.id === u.primaryEmailAddressId)
          ?.emailAddress ??
          u?.emailAddresses?.[0]?.emailAddress ??
          "",
      ) || null;

    const senderRes = await sql`
      select id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `;
    senderMemberId = (senderRes.rows[0]?.id as string | undefined) ?? null;
  }

  // Create gift row BEFORE Stripe so we can anchor everything on giftId (Pattern B)
  const ins = await sql`
    insert into gifts (
      album_slug,
      entitlement_key,
      recipient_email,
      recipient_member_id,
      sender_member_id,
      message,
      status,
      sender_email
    )
    values (
      ${albumSlug},
      ${offer.entitlementKey},
      ${recipientEmail},
      null,
      ${senderMemberId}::uuid,
      ${message},
      'pending_payment'::gift_status,
      ${senderEmail}
    )
    returning id
  `;
  const giftId = (ins.rows[0]?.id as string | undefined) ?? null;
  if (!giftId) {
    return NextResponse.json(
      { ok: false, error: "GIFT_CREATE_FAILED" },
      { status: 500 },
    );
  }

  const STRIPE_SECRET_KEY = must(
    process.env.STRIPE_SECRET_KEY ?? "",
    "STRIPE_SECRET_KEY",
  );
  const stripe = new Stripe(STRIPE_SECRET_KEY);

  const origin = safeOrigin(req);

  // returnTo drives everything; fallback is neutral canonical surface.
  const rt = safeReturnTo(origin, body.returnTo, "/player");

  const returnToStored =
    rt.pathname + (rt.params.toString() ? `?${rt.params.toString()}` : "");

  await sql`
  update gifts
  set return_to = ${returnToStored}
  where id = ${giftId}::uuid
`;

  // gift result banners should not mix with checkout banners
  const success_url = buildReturnUrl(origin, rt.pathname, rt.params, {
    checkout: null,
    gift: "success",
  });
  const cancel_url = buildReturnUrl(origin, rt.pathname, rt.params, {
    checkout: null,
    gift: "cancel",
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: offer.stripePriceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url,
    cancel_url,

    // Best-effort linkage/debug only
    client_reference_id: userId ?? undefined,
    customer_email: senderEmail ?? undefined,

    metadata: {
      kind: "gift",
      giftId, // primary anchor
      albumSlug,
      entitlementKey: offer.entitlementKey,
      recipientEmail,
      senderMemberId: senderMemberId ?? "",
      correlationId,
    },
  });

  await sql`
    update gifts
    set stripe_checkout_session_id = ${session.id}
    where id = ${giftId}::uuid
  `;

  return NextResponse.json({
    ok: true,
    giftId,
    albumSlug,
    recipientEmail,
    checkoutUrl: session.url,
    stripeCheckoutSessionId: session.id,
    correlationId,
    note: "Gift claim email will be sent after payment completes.",
  });
}
