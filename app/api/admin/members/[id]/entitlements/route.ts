// web/app/api/admin/members/[id]/entitlements/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

function looksLikeUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminMemberId();

    const { id } = await ctx.params;
    if (!looksLikeUuid(id))
      return NextResponse.json(
        { ok: false, error: "Bad member id" },
        { status: 400 },
      );

    const grants = await sql<{
      id: string;
      entitlement_key: string;
      scope_id: string | null;
      scope_meta: unknown;
      expires_at: string | null;
      revoked_at: string | null;
      created_at: string;
      granted_by: string | null;
      grant_reason: string | null;
      grant_source: string | null;
    }>`
      select
        id, entitlement_key, scope_id, scope_meta, expires_at, revoked_at,
        created_at, granted_by, grant_reason, grant_source
      from entitlement_grants
      where member_id = ${id}
      order by created_at desc
      limit 200
    `;

    const current = await sql<{
      entitlement_key: string;
      scope_id: string | null;
      scope_meta: unknown;
      granted_at: string | null;
      expires_at: string | null;
    }>`
      select
        entitlement_key,
        scope_id,
        scope_meta,
        granted_at,
        expires_at
      from member_entitlements_current
      where member_id = ${id}
      order by entitlement_key asc, scope_id asc nulls first
    `;

    const member = await sql<{
      id: string;
      email: string;
      clerk_user_id: string | null;
      stripe_customer_id: string | null;
      source: string;
      created_at: string;
      updated_at: string;
    }>`
      select
        id,
        email,
        clerk_user_id,
        stripe_customer_id,
        source,
        created_at,
        updated_at
      from members
      where id = ${id}
      limit 1
    `;

    return NextResponse.json({
      ok: true,
      memberId: id,
      member: member.rows[0] ?? null,
      grants: grants.rows,
      current: current.rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}
