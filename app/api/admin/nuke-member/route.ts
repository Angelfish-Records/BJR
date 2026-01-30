// web/app/api/admin/nuke-member/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`Missing env var: ${name}`);
  return v.trim();
}

function normalizeEmail(input: string): string {
  return (input ?? "").toString().trim().toLowerCase();
}

const uuidOk = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );

type NukeRequestBody = {
  email?: string;
  memberId?: string;
};

type MemberRow = {
  id: string;
  email: string;
  clerk_user_id: string | null;
};

type ClerkDeleteResult = {
  ok: boolean;
  status: number;
};

async function deleteClerkUser(
  clerkUserId: string,
): Promise<ClerkDeleteResult> {
  const secret = mustEnv("CLERK_SECRET_KEY");

  const res = await fetch(
    `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    },
  );

  // Idempotency: already deleted is fine.
  if (res.status === 404) return { ok: true, status: 404 };
  return { ok: res.ok, status: res.status };
}

export async function POST(req: NextRequest) {
  const adminSecret = mustEnv("ADMIN_NUKE_SECRET");
  if ((req.headers.get("x-admin-secret") ?? "") !== adminSecret) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as NukeRequestBody | null;
  const email = body?.email ? normalizeEmail(body.email) : null;
  const memberId = body?.memberId?.toString().trim() ?? null;

  if (!email && !memberId) {
    return NextResponse.json(
      { ok: false, error: "Provide email or memberId" },
      { status: 400 },
    );
  }
  if (memberId && !uuidOk(memberId)) {
    return NextResponse.json(
      { ok: false, error: "Invalid memberId" },
      { status: 400 },
    );
  }

  // Locate member
  const found = await sql<MemberRow>`
    select id, email, clerk_user_id
    from members
    where
      (${memberId}::uuid is not null and id = ${memberId}::uuid)
      or
      (${email}::text is not null and email = ${email})
    limit 1
  `;
  const member = found.rows[0] ?? null;
  if (!member) {
    return NextResponse.json({ ok: true, memberFound: false });
  }

  // Delete Clerk user FIRST so a fresh sign-in truly recreates identity.
  // (If Clerk delete fails, we stop: no partial nukes that create confusion.)
  let clerk: ClerkDeleteResult | null = null;
  if (member.clerk_user_id) {
    clerk = await deleteClerkUser(member.clerk_user_id);
    if (!clerk.ok) {
      return NextResponse.json(
        { ok: false, error: "Clerk delete failed", clerk },
        { status: 502 },
      );
    }
  }

  // Now nuke DB state in a way that doesn't depend on unknown FK tables:
  // - delete member_id keyed tables we KNOW about
  // - anonymise the members row (free the email unique constraint; detach clerk id)
  const tombstoneEmail = `deleted+${member.id}@invalid.local`;

  try {
    await sql`begin`;

    // These tables are in your schema and keyed by member_id (from what you've shown).
    await sql`delete from entitlement_grants where member_id = ${member.id}::uuid`;
    await sql`delete from member_consents where member_id = ${member.id}::uuid`;
    await sql`delete from purchases where member_id = ${member.id}::uuid`;
    await sql`delete from member_events where member_id = ${member.id}::uuid`;

    // IMPORTANT: keep the row, but free the original email and detach identity.
    await sql`
      update members
      set email = ${tombstoneEmail},
          clerk_user_id = null,
          marketing_opt_in = false,
          consent_latest_at = null
      where id = ${member.id}::uuid
    `;

    await sql`commit`;
  } catch (err) {
    try {
      await sql`rollback`;
    } catch {}
    return NextResponse.json(
      {
        ok: false,
        error: "Neon nuke failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    memberFound: true,
    target: {
      memberId: member.id,
      emailWas: member.email,
      clerkUserIdWas: member.clerk_user_id,
    },
    emailNow: tombstoneEmail,
    clerk,
  });
}
