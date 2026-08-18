// web/app/api/account/marketing-consent/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureMemberByClerk } from "@/lib/members";
import { setMarketingPreference } from "@/lib/marketingConsent";

export const runtime = "nodejs";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;

  try {
    return origin === new URL(req.url).origin;
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  if (!email) {
    return NextResponse.json(
      { ok: false, error: "Authenticated user has no email" },
      { status: 400 },
    );
  }

  const ensured = await ensureMemberByClerk({
    clerkUserId: userId,
    email,
    source: "marketing_consent",
    sourceDetail: { route: "/api/account/marketing-consent" },
  });

  await setMarketingPreference({
    memberId: ensured.id,
    optedIn: true,
    source: "activation_gate_signup",
    metadata: { surface: "activation_gate" },
  });

  return NextResponse.json({ ok: true });
}
