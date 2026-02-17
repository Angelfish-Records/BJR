import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type Status = "open" | "answered" | "discarded";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function parseStatus(v: string | null): Status | null {
  if (v === "open" || v === "answered" || v === "discarded") return v;
  return null;
}

// Cursor format: `${created_at_iso}::${id}`
function encodeCursor(createdAtIso: string, id: string) {
  return `${createdAtIso}::${id}`;
}
function decodeCursor(cursor: string): { createdAtIso: string; id: string } | null {
  const parts = cursor.split("::");
  if (parts.length !== 2) return null;
  const [createdAtIso, id] = parts;
  if (!createdAtIso || !id) return null;
  return { createdAtIso, id };
}

export async function GET(req: Request) {
  try {
    await requireAdminMemberId();

    const url = new URL(req.url);
    const status = parseStatus(url.searchParams.get("status")) ?? "open";
    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.floor(limitRaw))) : 50;

    const cursor = (url.searchParams.get("cursor") ?? "").trim() || null;
    const decoded = cursor ? decodeCursor(cursor) : null;

    const rows = await sql<{
      id: string;
      member_id: string;
      member_email: string | null;
      question_text: string;
      status: Status;
      created_at: string; // timestamptz -> string
      updated_at: string;
      answered_at: string | null;
      answer_post_slug: string | null;
      notify_email_sent_at: string | null;
    }>`
      SELECT
        q.id,
        q.member_id,
        m.email AS member_email,
        q.question_text,
        q.status::text AS status,
        q.created_at,
        q.updated_at,
        q.answered_at,
        q.answer_post_slug,
        q.notify_email_sent_at
      FROM mailbag_questions q
      LEFT JOIN members m ON m.id = q.member_id
      WHERE q.status = ${status}::mailbag_question_status
        AND (
          ${decoded ? true : false} = false
          OR (q.created_at, q.id) < (${decoded?.createdAtIso ?? null}::timestamptz, ${decoded?.id ?? null}::uuid)
        )
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT ${limit}
    `;

    const items = rows.rows;
    const last = items[items.length - 1] ?? null;
    const nextCursor =
      last ? encodeCursor(String(last.created_at), String(last.id)) : null;

    return json(200, { ok: true, items, nextCursor });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false });
  }
}
