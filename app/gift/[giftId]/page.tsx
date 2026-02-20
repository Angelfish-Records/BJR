// web/app/gift/[giftId]/page.tsx
import "server-only";
import { redirect } from "next/navigation";
import { sql } from "@vercel/postgres";
import { auth } from "@clerk/nextjs/server";
import crypto from "crypto";
import { grantEntitlement } from "@/lib/entitlementOps";

export const runtime = "nodejs";

function sha256Hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function appOrigin(): string {
  const v = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  return v ? v.replace(/\/$/, "") : "";
}

function signInPath(): string {
  const v = (process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL ?? "").trim();
  return v || "/sign-in";
}

function buildSignInRedirect(returnBackUrl: string): string {
  const base = signInPath();

  if (/^https?:\/\//i.test(base)) {
    const u = new URL(base);
    u.searchParams.set("redirect_url", returnBackUrl);
    return u.toString();
  }

  const origin = appOrigin();
  if (origin) {
    const u = new URL(base, origin);
    u.searchParams.set("redirect_url", returnBackUrl);
    return u.pathname + u.search;
  }

  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}redirect_url=${encodeURIComponent(returnBackUrl)}`;
}

function safeUuid(v: unknown): string {
  const s = (typeof v === "string" ? v : "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(s)) return "";
  return s;
}

// --- returnTo safety (must be relative + not internal) ---
function looksLikeSafeRelativePath(s: string): boolean {
  const t = (s ?? "").trim();
  if (!t.startsWith("/")) return false;
  if (t.startsWith("//")) return false;
  if (t.toLowerCase().includes("://")) return false;
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

function safeReturnToFromDb(raw: unknown, fallbackPath: string): string {
  const s = (typeof raw === "string" ? raw : "").trim();
  if (!s) return fallbackPath;
  if (!looksLikeSafeRelativePath(s)) return fallbackPath;

  try {
    // Parse relative into a URL so we can validate the pathname.
    const u = new URL(s, "https://example.invalid");
    if (isDisallowedPath(u.pathname)) return fallbackPath;
    // Return normalized path+query only.
    return u.pathname + (u.search || "");
  } catch {
    return fallbackPath;
  }
}

function withGiftBanner(returnTo: string, giftValue: string): string {
  const u = new URL(returnTo, "https://example.invalid");
  // gift banner wins; remove checkout banner if present to avoid mixed semantics
  u.searchParams.delete("checkout");
  u.searchParams.set("gift", giftValue);
  return u.pathname + "?" + u.searchParams.toString();
}

export default async function GiftLandingPage(props: {
  params: { giftId: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  const giftId = safeUuid(props.params?.giftId);
  if (!giftId) redirect("/player?gift=missing");

  const claimCodeRaw = props.searchParams?.c;
  const claimCode = Array.isArray(claimCodeRaw)
    ? (claimCodeRaw[0] ?? "")
    : (claimCodeRaw ?? "");
  const claimCodeTrimmed = (claimCode ?? "").toString().trim();

  const { userId } = await auth();
  if (!userId) {
    const returnTo = `/gift/${giftId}${
      claimCodeTrimmed ? `?c=${encodeURIComponent(claimCodeTrimmed)}` : ""
    }`;
    redirect(buildSignInRedirect(returnTo));
  }

  // Resolve member for this clerk user (and pull member email for matching).
  const m = await sql`
    select id, email
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = (m.rows[0]?.id as string | undefined) ?? null;
  const memberEmail = (m.rows[0]?.email as string | undefined) ?? null;
  if (!memberId) redirect("/player?gift=missing");

  // Load gift (including return_to if present).
  const g = await sql`
    select
      id,
      status,
      entitlement_key,
      recipient_member_id,
      recipient_email,
      gift_claim_code_hash,
      return_to
    from gifts
    where id = ${giftId}::uuid
    limit 1
  `;
  const row = g.rows[0] as
    | {
        id: string;
        status: string;
        entitlement_key: string;
        recipient_member_id: string | null;
        recipient_email: string | null;
        gift_claim_code_hash: string | null;
        return_to: string | null;
      }
    | undefined;

  // Determine deterministic landing surface (fallback neutral).
  const baseReturnTo = safeReturnToFromDb(row?.return_to, "/player");

  if (!row) redirect(withGiftBanner(baseReturnTo, "missing"));

  if (row.status === "pending_payment" || row.status === "draft") {
    redirect(withGiftBanner(baseReturnTo, "not_paid"));
  }

  // Intended recipient check (prevents “forward to someone else”)
  const intendedById =
    row.recipient_member_id != null && row.recipient_member_id === memberId;
  const intendedByEmail =
    !!row.recipient_email &&
    !!memberEmail &&
    row.recipient_email.toLowerCase() === memberEmail.toLowerCase();
  const intended = intendedById || intendedByEmail;

  if (!intended) {
    redirect(withGiftBanner(baseReturnTo, "wrong_account"));
  }

  // If claim hash exists, require and validate claim code.
  if (row.gift_claim_code_hash) {
    if (!claimCodeTrimmed) {
      redirect(withGiftBanner(baseReturnTo, "claim_code_missing"));
    }
    const h = sha256Hex(claimCodeTrimmed);
    if (h !== row.gift_claim_code_hash) {
      redirect(withGiftBanner(baseReturnTo, "invalid_claim"));
    }
  }

  // Mark claimed + clear claim hash (idempotent)
  await sql`
    update gifts
    set status = 'claimed'::gift_status,
        claimed_at = coalesce(claimed_at, now()),
        recipient_member_id = coalesce(recipient_member_id, ${memberId}::uuid),
        gift_claim_code_hash = null
    where id = ${giftId}::uuid
      and status in ('paid'::gift_status, 'claimed'::gift_status)
  `;

  // Ensure entitlement exists (idempotent on your grantEntitlement path)
  await grantEntitlement({
    memberId,
    entitlementKey: row.entitlement_key,
    grantedBy: "system",
    grantReason: "gift_claimed",
    grantSource: "gift_claim",
    grantSourceRef: giftId,
    expiresAt: null,
    correlationId: giftId,
    eventSource: "server",
  });

  redirect(withGiftBanner(baseReturnTo, "ready"));
}