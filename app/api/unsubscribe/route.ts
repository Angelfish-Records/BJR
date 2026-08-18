// web/app/api/unsubscribe/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { verifyUnsubscribeToken, normalizeEmail } from "@/lib/unsubscribe";
import { setMarketingPreference } from "@/lib/marketingConsent";

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

async function preserveEmailLevelOptOut(email: string) {
  // This fallback is only for a valid unsubscribe token that no longer resolves
  // to a member row. Do not overwrite a harder bounce/complaint suppression.
  await sql`
    insert into email_suppressions (email, reason, source, first_seen_at, last_seen_at)
    values (${email}, 'unsubscribe', 'unsubscribe_page', now(), now())
    on conflict (email) do update set
      source = case
        when email_suppressions.reason = 'unsubscribe' then excluded.source
        else email_suppressions.source
      end,
      last_seen_at = case
        when email_suppressions.reason = 'unsubscribe' then now()
        else email_suppressions.last_seen_at
      end
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
    const member = await sql<{ id: string }>`
      select id
      from members
      where lower(email::text) = lower(${email})
        and (${memberId}::text is null or id::text = ${memberId})
      limit 1
    `;

    const resolvedMemberId = member.rows[0]?.id ?? null;
    if (resolvedMemberId) {
      await setMarketingPreference({
        memberId: resolvedMemberId,
        optedIn: false,
        source: "unsubscribe_page",
        metadata: { surface: "campaign_unsubscribe" },
      });
    } else {
      await preserveEmailLevelOptOut(email);
    }

    return redirectToDone(req);
  } catch {
    // Don’t leak internals; just fall back to neutral page.
    return redirectToInvalid(req);
  }
}
