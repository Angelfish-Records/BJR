// web/app/api/admin/entitlements/grant/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

type Body = {
  memberId: string;
  key: string;
  scopeId?: string | null;
  scopeMeta?: Record<string, unknown>;
  expiresAt?: string | null;
  reason?: string | null;
};

export async function POST(req: Request) {
  try {
    await requireAdminMemberId();

    const raw: unknown = await req.json().catch(() => null);
    const b = raw as Partial<Body>;
    const memberId = (b.memberId ?? "").trim();
    const key = (b.key ?? "").trim();
    const scopeId = (b.scopeId ?? null) ? String(b.scopeId).trim() : null;
    const reason = (b.reason ?? "admin_grant").toString();

    if (!memberId || !key)
      return NextResponse.json(
        { ok: false, error: "Bad request" },
        { status: 400 },
      );

    await sql`
      insert into entitlement_grants (
        member_id,
        entitlement_key,
        scope_id,
        scope_meta,
        expires_at,
        granted_by,
        grant_reason,
        grant_source
      )
      select
        ${memberId},
        ${key},
        ${scopeId},
        ${JSON.stringify(b.scopeMeta ?? {})}::jsonb,
        ${b.expiresAt ?? null}::timestamptz,
        'admin',
        ${reason},
        'admin_ui'
      where not exists (
        select 1
        from entitlement_grants eg
        where eg.member_id = ${memberId}
          and eg.entitlement_key = ${key}
          and coalesce(eg.scope_id,'') = coalesce(${scopeId ?? ""},'')
          and eg.revoked_at is null
          and (eg.expires_at is null or eg.expires_at > now())
      )
    `;

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "error";
    return NextResponse.json({ ok: false, error: msg }, { status: 401 });
  }
}
