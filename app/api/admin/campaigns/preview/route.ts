//api/admin/campaigns/preview/route.ts
import "server-only";
import * as React from "react";
import { NextRequest, NextResponse } from "next/server";
import { render as renderEmail } from "@react-email/render";
import { requireAdminMemberId } from "@/lib/adminAuth";
import CampaignEmail from "@/emails/CampaignEmail";

export const runtime = "nodejs";

function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function clampString(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as null | {
    brandName?: unknown;
    logoUrl?: unknown;
    subject?: unknown;
    bodyText?: unknown;
    unsubscribeUrl?: unknown;
  };

  const brandName = clampString(
    asString(body?.brandName).trim() || "Brendan John Roch",
    120,
  );
  const logoUrl = clampString(asString(body?.logoUrl).trim(), 2048);
  const subject = clampString(asString(body?.subject).trim(), 200);
  const bodyText = clampString(asString(body?.bodyText), 60_000); // generous but bounded
  const unsubscribeUrl = clampString(
    asString(body?.unsubscribeUrl).trim(),
    2048,
  );

  try {
    const html = await renderEmail(
      React.createElement(CampaignEmail, {
        brandName,
        logoUrl: logoUrl || undefined,
        bodyMarkdown: bodyText,
        unsubscribeUrl: unsubscribeUrl || undefined,
      }),
      { pretty: true },
    );

    return NextResponse.json({ ok: true, subject, html });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Render failed";
    return NextResponse.json(
      { ok: false, error: "PREVIEW_RENDER_FAILED", message: msg },
      { status: 500 },
    );
  }
}
