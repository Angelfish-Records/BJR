// web/app/api/stripe/create-album-checkout-session/route.ts
import "server-only";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { getAlbumOffer } from "../../../../lib/albumOffers";
import { normalizeEmail, ensureMemberByEmail } from "../../../../lib/members";

export const runtime = "nodejs";

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

  const st = (u.searchParams.get("st") ?? u.searchParams.get("share") ?? "")
    .trim();
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
  appUrl: string,
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
    u = new URL(s, appUrl);
  } catch {
    return fallback;
  }

  if (isDisallowedPath(u.pathname)) return fallback;

  const out = new URLSearchParams();
  const preserved = pickPreservedParams(u);

  for (const [k, v] of preserved.entries()) {
    if (STRIP_KEYS.has(k)) continue;
    if (PRESERVE_KEYS.has(k) || PRESERVE_PREFIXES.some((p) => k.startsWith(p))) {
      const vv = (v ?? "").trim();
      if (vv) out.set(k, vv);
    }
  }

  const st = (out.get("st") ?? out.get("share") ?? "").trim();
  out.delete("share");
  if (st) out.set("st", st);

  return { pathname: u.pathname, params: out };
}

function buildReturnUrl(
  appUrl: string,
  pathname: string,
  params: URLSearchParams,
  patch: Record<string, string | null | undefined>,
): string {
  const dest = new URL(pathname, appUrl);
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

type Body = {
  albumSlug?: unknown;
  email?: unknown;
  returnTo?: unknown; // NEW
};

export async function POST(req: Request) {
  const STRIPE_SECRET_KEY = must(
    process.env.STRIPE_SECRET_KEY ?? "",
    "STRIPE_SECRET_KEY",
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

  // Logged-out buyers: require an email so the purchase can be reconciled deterministically.
  if (!userId && !email) {
    return NextResponse.json(
      { ok: false, error: "Email required when logged out" },
      { status: 400 },
    );
  }

  // Pre-create member for logged-out path (makes webhook linking less brittle)
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

  // Logged-in: reuse existing customer if linked to avoid duplicate Stripe customers
  let customer: string | undefined;
  if (userId) {
    const r = await sql`
      select stripe_customer_id
      from members
      where clerk_user_id = ${userId}
      limit 1
    `;
    const cid =
      (r.rows[0]?.stripe_customer_id as string | null | undefined) ?? null;
    if (cid) customer = cid;
  }

  // returnTo drives everything; fallback is neutral canonical surface.
  const rt = safeReturnTo(APP_URL, body?.returnTo, "/player");

  // checkout result banners should not mix with gift banners
  const success_url = buildReturnUrl(APP_URL, rt.pathname, rt.params, {
    gift: null,
    checkout: "success",
  });
  const cancel_url = buildReturnUrl(APP_URL, rt.pathname, rt.params, {
    gift: null,
    checkout: "cancel",
  });

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{ price: offer.stripePriceId, quantity: 1 }],
    allow_promotion_codes: true,

    success_url,
    cancel_url,

    client_reference_id: userId ?? undefined,
    customer,
    customer_email: !userId && email ? email : undefined,

    metadata: { albumSlug: offer.albumSlug, offer: "digital_album" },
  });

  return NextResponse.json({ ok: true, url: session.url });
}