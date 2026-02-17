import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function isUuid(x: unknown): x is string {
  return (
    typeof x === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      x,
    )
  );
}

export async function POST(req: Request) {
  try {
    await requireAdminMemberId();

    const body = (await req.json().catch(() => null)) as unknown;
    const idsRaw =
      body && typeof body === "object"
        ? (body as Record<string, unknown>).ids
        : null;

    const ids = Array.isArray(idsRaw) ? idsRaw.filter(isUuid) : [];
    if (ids.length === 0) return json(400, { ok: false, code: "NO_IDS" });

    // Build parameter placeholders: $1::uuid, $2::uuid, ...
    const placeholders = ids.map((_, i) => `$${i + 1}::uuid`).join(", ");

    // Use sql.query so we can pass a dynamic params list safely.
    const r = await sql.query(
      `
  UPDATE mailbag_questions
  SET status = 'discarded'::mailbag_question_status, updated_at = now()
  WHERE id IN (${placeholders})
    AND status = 'open'::mailbag_question_status
  RETURNING 1
  `,
      ids,
    );

    return json(200, { ok: true, updated: r.rowCount ?? 0 });

    return json(200, { ok: true, updated: r.rowCount ?? 0 });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false });
  }
}
