// web/app/api/account/marketing-consent/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { ensureMemberByClerk } from "@/lib/members";
import {
  getMarketingPreference,
  setMarketingPreference,
} from "@/lib/marketingConsent";

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

type AuthenticatedMemberResult =
  | Readonly<{ ok: true; memberId: string }>
  | Readonly<{ ok: false; response: Response }>;

async function resolveAuthenticatedMember(): Promise<AuthenticatedMemberResult> {
  const { userId } = await auth();
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 },
      ),
    };
  }

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    null;

  if (!email) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, error: "Authenticated user has no email" },
        { status: 400 },
      ),
    };
  }

  const ensured = await ensureMemberByClerk({
    clerkUserId: userId,
    email,
    source: "marketing_consent",
    sourceDetail: { route: "/api/account/marketing-consent" },
  });

  return { ok: true, memberId: ensured.id };
}

export async function GET() {
  const member = await resolveAuthenticatedMember();
  if (!member.ok) return member.response;

  const marketingOptIn = await getMarketingPreference(member.memberId);
  return NextResponse.json({ ok: true, marketingOptIn });
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Bad origin" }, { status: 403 });
  }

  const member = await resolveAuthenticatedMember();
  if (!member.ok) return member.response;

  const raw: unknown = await req.json().catch(() => null);
  const body =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;

  // Backward-compatible default for already-loaded signup clients that POST
  // without a body. Membership management always sends an explicit boolean.
  const optedIn = typeof body?.optedIn === "boolean" ? body.optedIn : true;
  const fromMembershipModal = body?.surface === "membership_modal";

  await setMarketingPreference({
    memberId: member.memberId,
    optedIn,
    source: fromMembershipModal ? "membership_modal" : "activation_gate_signup",
    metadata: {
      surface: fromMembershipModal ? "membership_modal" : "activation_gate",
    },
  });

  const marketingOptIn = await getMarketingPreference(member.memberId);
  return NextResponse.json({ ok: true, marketingOptIn });
}
