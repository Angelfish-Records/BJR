// web/app/api/admin/mailbag/questions/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type Status = "open" | "answered" | "discarded";
type SubmissionKind = "question" | "suggestion" | "bug_report";
type KindFilter = SubmissionKind | "all";

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function parseStatus(v: string | null): Status | null {
  if (v === "open" || v === "answered" || v === "discarded") return v;
  return null;
}

function parseKind(v: string | null): KindFilter | null {
  if (v === "all") return "all";
  if (v === "question" || v === "suggestion" || v === "bug_report") return v;
  if (v === "bug-report" || v === "bug report") return "bug_report";
  return null;
}

function encodeCursor(createdAtIso: string, id: string) {
  return `${createdAtIso}::${id}`;
}

function decodeCursor(
  cursor: string,
): { createdAtIso: string; id: string } | null {
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
    const kind = parseKind(url.searchParams.get("kind")) ?? "all";

    const limitRaw = Number(url.searchParams.get("limit") ?? "50");
    const limit = Number.isFinite(limitRaw)
      ? Math.max(1, Math.min(200, Math.floor(limitRaw)))
      : 50;

    const cursor = (url.searchParams.get("cursor") ?? "").trim() || null;
    const decoded = cursor ? decodeCursor(cursor) : null;

    const rows = await sql<{
      id: string;
      member_id: string;
      member_email: string | null;
      question_text: string;
      asker_name: string | null;
      kind: SubmissionKind;
      status: Status;
      created_at: string;
      updated_at: string;
      answered_at: string | null;
      answer_post_slug: string | null;
      notify_email_sent_at: string | null;
      admin_reply_sent_at: string | null;
    }>`
      SELECT
        q.id,
        q.member_id,
        m.email AS member_email,
        q.question_text,
        q.asker_name,
        q.kind::text AS kind,
        q.status::text AS status,
        q.created_at,
        q.updated_at,
        q.answered_at,
        q.answer_post_slug,
        q.notify_email_sent_at,
        q.admin_reply_sent_at
      FROM mailbag_questions q
      LEFT JOIN members m ON m.id = q.member_id
      WHERE q.status = ${status}::mailbag_question_status
        AND (
          ${kind === "all"} = true
          OR q.kind = ${kind === "all" ? "question" : kind}::mailbag_submission_kind
        )
        AND (
          ${decoded ? true : false} = false
          OR (q.created_at, q.id) < (${decoded?.createdAtIso ?? null}::timestamptz, ${decoded?.id ?? null}::uuid)
        )
      ORDER BY q.created_at DESC, q.id DESC
      LIMIT ${limit}
    `;

    const items = rows.rows;
    const last = items[items.length - 1] ?? null;
    const nextCursor = last
      ? encodeCursor(String(last.created_at), String(last.id))
      : null;

    return json(200, { ok: true, items, nextCursor });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false });
  }
}
