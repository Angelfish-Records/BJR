// web/app/api/exegesis/identity/claim-name/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

type IdentityDTO = {
  memberId: string;
  anonLabel: string;
  publicName: string | null;
  publicNameUnlockedAt: string | null;
  contributionCount: number;
};

type ApiOk = { ok: true; identity: IdentityDTO };
type ApiErr = { ok: false; error: string; code?: "TAKEN" | "NOT_UNLOCKED" };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function validatePublicName(
  raw: string,
): { ok: true; value: string; lowered: string } | { ok: false; error: string } {
  // Normalize whitespace (more user-friendly than rejection)
  const s = raw.replace(/\s+/g, " ").trim();

  if (s.length < 3)
    return { ok: false, error: "Name must be at least 3 characters." };
  if (s.length > 32)
    return { ok: false, error: "Name must be 32 characters or less." };

  // letters/numbers, spaces, underscores, hyphens, apostrophes, periods.
  // must start/end with alnum.
  if (!/^[A-Za-z0-9][A-Za-z0-9 _.'-]*[A-Za-z0-9]$/.test(s)) {
    return { ok: false, error: "Name contains invalid characters." };
  }

  // prevent “all punctuation-ish” names via the start/end rule above,
  // but also disallow runs of punctuation that look spammy.
  if (/[_.\-']{3,}/.test(s)) {
    return { ok: false, error: "Name contains too much punctuation." };
  }

  const lowered = s.toLowerCase();

  // IMPORTANT: reserved list must be lowercase to match `lowered`
  const reserved = new Set(
    [
      "admin",
      "administrator",
      "support",
      "moderator",
      "mod",
      "system",
      "anonymous",
      "null",
      "undefined",
      "bjr",
      "brendan john roch",
      "angelfish records",
      "angelfish records official",
      "brendan john roch official",
      "bjr official",
    ].map((x) => x.toLowerCase()),
  );

  if (reserved.has(lowered))
    return { ok: false, error: "That name is reserved." };

  return { ok: true, value: s, lowered };
}

const UNLOCK_AT = 5;

async function requireMemberId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = r.rows?.[0]?.id ?? "";
  return memberId || null;
}

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const b =
    typeof raw === "object" && raw !== null
      ? (raw as Record<string, unknown>)
      : null;
  if (!b) return json(400, { ok: false, error: "Invalid JSON body." });

  const desiredRaw = norm(b.publicName);
  const v = validatePublicName(desiredRaw);
  if (!v.ok) return json(400, { ok: false, error: v.error });

  const memberId = await requireMemberId();
  if (!memberId) return json(401, { ok: false, error: "Sign in required." });
  if (!isUuid(memberId))
    return json(403, { ok: false, error: "Provisioning required." });

    try {
    const r = await sql<{
      ok: boolean;
      err: string | null;
      member_id: string | null;
      anon_label: string | null;
      public_name: string | null;
      public_name_unlocked_at: string | null;
      contribution_count: number | null;
    }>`
      with
      me as (
        select member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
        from exegesis_identity
        where member_id = ${memberId}::uuid
        limit 1
      ),
      guard as (
        select
          case
            when (select member_id from me) is null then 'NO_IDENTITY'
            when coalesce((select contribution_count from me), 0) < ${UNLOCK_AT} then 'NOT_UNLOCKED'
            else null
          end as err
      ),
      upd as (
        update exegesis_identity
        set
          public_name = ${v.value}::citext,
          updated_at = now()
        where member_id = ${memberId}::uuid
          and (select err from guard) is null
          and (select public_name from me) is null
        returning member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
      ),
      out as (
        -- If already claimed, return existing row.
        select member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
        from me
        where (select public_name from me) is not null

        union all

        -- If we just updated, return updated row.
        select member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
        from upd
      )
      select
        (select err from guard) is null as ok,
        (select err from guard) as err,
        o.member_id,
        o.anon_label,
        o.public_name,
        o.public_name_unlocked_at,
        o.contribution_count
      from out o
      union all
      select
        false as ok,
        (select err from guard) as err,
        null::uuid as member_id,
        null::text as anon_label,
        null::citext as public_name,
        null::timestamptz as public_name_unlocked_at,
        null::int as contribution_count
      where (select err from guard) is not null
      limit 1
    `;

    const row = r.rows?.[0] ?? null;
    if (!row) return json(500, { ok: false, error: "Failed to update identity." });

    if (!row.ok) {
      if (row.err === "NO_IDENTITY") {
        return json(404, {
          ok: false,
          error: "Identity not found. Post a comment first.",
        });
      }
      if (row.err === "NOT_UNLOCKED") {
        return json(403, {
          ok: false,
          code: "NOT_UNLOCKED",
          error: `Public name unlocks after ${UNLOCK_AT} contributions.`,
        });
      }
      return json(400, { ok: false, error: "Cannot claim name." });
    }

    // If we got here, either:
    // - it was already claimed (out from me), OR
    // - we claimed it successfully (out from upd)
    return json(200, {
      ok: true,
      identity: {
        memberId: String(row.member_id),
        anonLabel: String(row.anon_label ?? ""),
        publicName: row.public_name ?? null,
        publicNameUnlockedAt: row.public_name_unlocked_at,
        contributionCount: Number(row.contribution_count ?? 0),
      },
    });
  } catch (e: unknown) {
    const anyErr = e as { code?: string; message?: string } | null;

    // Unique constraint violation => name already taken (citext makes this case-insensitive).
    if (anyErr?.code === "23505") {
      return json(409, {
        ok: false,
        code: "TAKEN",
        error: "That name is already taken.",
      });
    }

    return json(500, {
      ok: false,
      error: e instanceof Error ? e.message : "Unknown error.",
    });
  }
}
