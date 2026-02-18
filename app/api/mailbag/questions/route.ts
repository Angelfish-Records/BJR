// web/app/api/mailbag/questions/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

export const runtime = "nodejs";

const MAX_CHARS = 800;
const MAX_NAME_CHARS = 48;
const MAX_PER_UTC_DAY = 3;

type FailCode =
  | "NOT_AUTHED"
  | "TIER_REQUIRED"
  | "RATE_LIMIT"
  | "TOO_LONG"
  | "EMPTY"
  | "BAD_REQUEST"
  | "SERVER_ERROR";

function json(status: number, body: unknown, headers?: HeadersInit) {
  return NextResponse.json(body, { status, headers });
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function normalizeAskerName(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!t) return null;
  return t.length > MAX_NAME_CHARS ? t.slice(0, MAX_NAME_CHARS) : t;
}

type MailbagSubmitBody = {
  questionText?: unknown;
  askerName?: unknown;
  name?: unknown;
  displayName?: unknown;
};

/**
 * Tier resolution: use member_entitlements_current as the canonical read model.
 * Assumes entitlement_key values like: "tier_friend" | "tier_patron" | "tier_partner"
 * If your keys differ, adjust ONLY this function.
 */
async function resolveTierForMember(
  memberId: string,
): Promise<"none" | "friend" | "patron" | "partner"> {
  const r = await sql<{ entitlement_key: string | null }>`
    SELECT entitlement_key
    FROM member_entitlements_current
    WHERE member_id = ${memberId}::uuid
      AND entitlement_key ILIKE 'tier\_%' ESCAPE '\'
  `;

  const keys = new Set(
    r.rows
      .map((x) => (x.entitlement_key ?? "").trim().toLowerCase())
      .filter(Boolean),
  );

  if (keys.has("tier_partner")) return "partner";
  if (keys.has("tier_patron")) return "patron";
  if (keys.has("tier_friend")) return "friend";
  return "none";
}

async function resolveOrCreateMemberId(params: {
  clerkUserId: string;
  email: string;
}): Promise<string> {
  const { clerkUserId, email } = params;

  // 1) Prefer clerk_user_id match (most stable)
  const byClerk = await sql<{ id: string }>`
    SELECT id
    FROM members
    WHERE clerk_user_id = ${clerkUserId}
    LIMIT 1
  `;
  if (byClerk.rows[0]?.id) return byClerk.rows[0].id;

  // 2) Fall back to email match (members.email is citext)
  const byEmail = await sql<{ id: string }>`
    SELECT id
    FROM members
    WHERE email = ${email}
    LIMIT 1
  `;
  if (byEmail.rows[0]?.id) {
    const id = byEmail.rows[0].id;

    // attach clerk_user_id for future stability
    await sql`
      UPDATE members
      SET clerk_user_id = ${clerkUserId}, updated_at = now()
      WHERE id = ${id}::uuid
    `;
    return id;
  }

  // 3) Create member row
  const created = await sql<{ id: string }>`
    INSERT INTO members (email, source, source_detail, clerk_user_id)
    VALUES (${email}, 'unknown', '{}'::jsonb, ${clerkUserId})
    RETURNING id
  `;
  return created.rows[0]!.id;
}

export async function POST(req: Request) {
  try {
    const a = await auth();
    const clerkUserId = a.userId;

    if (!clerkUserId) {
      return json(401, { ok: false, code: "NOT_AUTHED" satisfies FailCode });
    }

    const u = await currentUser();
    const emailRaw = u?.primaryEmailAddress?.emailAddress ?? "";
    const email = normalizeEmail(emailRaw);

    if (!email) {
      return json(400, { ok: false, code: "BAD_REQUEST" satisfies FailCode });
    }

    const body = (await req.json().catch(() => null)) as MailbagSubmitBody | null;

    const questionText =
      typeof body?.questionText === "string" ? body.questionText.trim() : "";

    if (!questionText) {
      return json(400, { ok: false, code: "EMPTY" satisfies FailCode });
    }

    if (questionText.length > MAX_CHARS) {
      return json(400, {
        ok: false,
        code: "TOO_LONG" satisfies FailCode,
        maxChars: MAX_CHARS,
      });
    }

    const memberId = await resolveOrCreateMemberId({ clerkUserId, email });

    // Tier gate (patron/partner)
    const tier = await resolveTierForMember(memberId);
    const allowed = tier === "patron" || tier === "partner";

    if (!allowed) {
      return json(403, { ok: false, code: "TIER_REQUIRED" satisfies FailCode });
    }

    // Rate limit: 3 per UTC day
    const countRes = await sql<{ n: number }>`
      SELECT COUNT(*)::int AS n
      FROM mailbag_questions
      WHERE member_id = ${memberId}::uuid
        AND created_at >= (date_trunc('day', now() AT TIME ZONE 'utc') AT TIME ZONE 'utc')
    `;

    const n = countRes.rows[0]?.n ?? 0;
    if (n >= MAX_PER_UTC_DAY) {
      return json(429, {
        ok: false,
        code: "RATE_LIMIT" satisfies FailCode,
        limitPerDay: MAX_PER_UTC_DAY,
      });
    }

    const askerName = normalizeAskerName(
      body?.askerName ?? body?.name ?? body?.displayName,
    );

    await sql`
      INSERT INTO mailbag_questions (member_id, question_text, asker_name, status)
      VALUES (${memberId}::uuid, ${questionText}, ${askerName}, 'open'::mailbag_question_status)
    `;

    return json(200, { ok: true });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, code: "SERVER_ERROR" satisfies FailCode });
  }
}
