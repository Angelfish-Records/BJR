// web/lib/anon.ts
import "server-only";
import crypto from "crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const ANON_COOKIE = "af_anon";
const ONE_YEAR = 60 * 60 * 24 * 365;

function isPlausibleAnonId(v: string) {
  // base64url-ish, reasonably long; don’t be too strict (don’t brick old cookies)
  return /^[a-zA-Z0-9_-]{16,}$/.test(v);
}

export function mintAnonId(): string {
  // opaque, short, cookie-safe
  return crypto.randomBytes(18).toString("base64url");
}

/**
 * Ensure anon id exists. If `res` is provided, we will persist it when newly created.
 */
export function ensureAnonId(
  req: NextRequest,
  res?: NextResponse,
): { anonId: string; isNew: boolean } {
  const existing = (req.cookies.get(ANON_COOKIE)?.value ?? "").trim();
  if (existing && isPlausibleAnonId(existing))
    return { anonId: existing, isNew: false };

  const anonId = mintAnonId();
  if (res) persistAnonId(res, anonId);
  return { anonId, isNew: true };
}

export function persistAnonId(res: NextResponse, anonId: string) {
  res.cookies.set(ANON_COOKIE, anonId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // IMPORTANT: local http dev
    path: "/",
    maxAge: ONE_YEAR,
  });
}
