// web/app/api/unsubscribe/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { verifyUnsubscribeToken, normalizeEmail } from "@/lib/unsubscribe";

export const runtime = "nodejs";

function redirectToDone(req: NextRequest) {
  const url = new URL("/unsubscribe", req.url);
  url.searchParams.set("done", "1");
  return NextResponse.redirect(url, 303);
}

function redirectToInvalid(req: NextRequest) {
  const url = new URL("/unsubscribe", req.url);
  return NextResponse.redirect(url, 303);
}

async function ensureSuppressionRow(
  email: string,
  reason: string,
  source: string,
) {
  // No guarantee of unique constraint in schema JSON, so do a safe "update-then-insert".
  const upd = await sql`
    update email_suppressions
    set reason = ${reason}, source = ${source}, last_seen_at = now()
    where lower(email) = lower(${email})
  `;
  if ((upd.rowCount ?? 0) > 0) return;

  await sql`
    insert into email_suppressions (email, reason, source, first_seen_at, last_seen_at)
    values (${email}, ${reason}, ${source}, now(), now())
  `;
}

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") || "";
  let token = "";

  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("multipart/form-data")
  ) {
    const form = await req.formData().catch(() => null);
    token = typeof form?.get("t") === "string" ? String(form?.get("t")) : "";
  } else {
    const body = (await req.json().catch(() => null)) as null | { t?: unknown };
    token = typeof body?.t === "string" ? body.t : "";
  }

  const vr = token
    ? verifyUnsubscribeToken(token)
    : ({ ok: false, error: "MISSING" } as const);
  if (!vr.ok) return redirectToInvalid(req);

  const email = normalizeEmail(vr.payload.email);
  const memberId = vr.payload.memberId ? String(vr.payload.memberId) : null;

  try {
    // 1) Suppress globally for marketing mailouts (your enqueue already LEFT JOINs email_suppressions).
    await ensureSuppressionRow(email, "unsubscribe", "unsubscribe_page");

    // 2) Flip member opt-in off (belt + braces; view should exclude them)
    if (memberId) {
      await sql`
        update members
        set marketing_opt_in = false, updated_at = now()
        where id = ${memberId}::uuid
      `;
    } else {
      await sql`
        update members
        set marketing_opt_in = false, updated_at = now()
        where lower(email::text) = lower(${email})
      `;
    }

    return redirectToDone(req);
  } catch {
    // Don’t leak internals; just fall back to neutral page.
    return redirectToInvalid(req);
  }
}
