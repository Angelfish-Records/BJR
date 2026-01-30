// web/lib/unsubscribe.ts
import crypto from "crypto";

export type UnsubscribeTokenPayload = {
  v: 1;
  email: string;
  memberId?: string;
  campaignId?: string;
  sendId?: string;
  iat: number; // unix seconds
  exp: number; // unix seconds
};

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(s: string): Buffer {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

function hmacSha256(secret: string, data: string): string {
  const mac = crypto.createHmac("sha256", secret).update(data).digest();
  return base64UrlEncode(mac);
}

function safeJsonParse<T>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function issueUnsubscribeToken(input: {
  email: string;
  memberId?: string | null;
  campaignId?: string | null;
  sendId?: string | null;
  ttlSeconds?: number;
  now?: number;
}): string {
  const secret = mustEnv("UNSUBSCRIBE_SECRET");
  const now =
    typeof input.now === "number" ? input.now : Math.floor(Date.now() / 1000);
  const ttl = Math.max(
    60,
    Math.min(
      60 * 60 * 24 * 30,
      Math.floor(input.ttlSeconds ?? 60 * 60 * 24 * 14),
    ),
  ); // default 14 days

  const payload: UnsubscribeTokenPayload = {
    v: 1,
    email: normalizeEmail(input.email),
    memberId: input.memberId ? String(input.memberId) : undefined,
    campaignId: input.campaignId ? String(input.campaignId) : undefined,
    sendId: input.sendId ? String(input.sendId) : undefined,
    iat: now,
    exp: now + ttl,
  };

  const body = base64UrlEncode(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = hmacSha256(secret, body);
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; payload: UnsubscribeTokenPayload }
  | {
      ok: false;
      error:
        | "MISSING"
        | "MALFORMED"
        | "BAD_SIG"
        | "EXPIRED"
        | "INVALID_PAYLOAD";
    };

export function verifyUnsubscribeToken(
  token: string,
  now?: number,
): VerifyResult {
  const t = token.trim();
  if (!t) return { ok: false, error: "MISSING" };

  const parts = t.split(".");
  if (parts.length !== 2) return { ok: false, error: "MALFORMED" };

  const [body, sig] = parts;
  if (!body || !sig) return { ok: false, error: "MALFORMED" };

  const secret = mustEnv("UNSUBSCRIBE_SECRET");
  const expected = hmacSha256(secret, body);

  // constant-time compare
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return { ok: false, error: "BAD_SIG" };

  const decoded = safeJsonParse<UnsubscribeTokenPayload>(
    base64UrlDecode(body).toString("utf8"),
  );
  if (!decoded || decoded.v !== 1)
    return { ok: false, error: "INVALID_PAYLOAD" };

  if (typeof decoded.email !== "string" || !decoded.email.trim())
    return { ok: false, error: "INVALID_PAYLOAD" };
  if (typeof decoded.iat !== "number" || typeof decoded.exp !== "number")
    return { ok: false, error: "INVALID_PAYLOAD" };

  const nowSec = typeof now === "number" ? now : Math.floor(Date.now() / 1000);
  if (decoded.exp < nowSec) return { ok: false, error: "EXPIRED" };

  return {
    ok: true,
    payload: { ...decoded, email: normalizeEmail(decoded.email) },
  };
}

export function maskEmail(email: string): string {
  const e = normalizeEmail(email);
  const at = e.indexOf("@");
  if (at <= 1) return "***";
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  const localMasked = local[0] + "***" + local.slice(-1);
  const dot = domain.lastIndexOf(".");
  const domMain = dot > 0 ? domain.slice(0, dot) : domain;
  const tld = dot > 0 ? domain.slice(dot) : "";
  const domMasked =
    domMain.length <= 2 ? "***" : domMain[0] + "***" + domMain.slice(-1);
  return `${localMasked}@${domMasked}${tld}`;
}
