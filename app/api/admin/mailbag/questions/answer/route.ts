// web/app/api/admin/mailbag/questions/answer/route.ts
import "server-only";
import { NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";
import { sanityWrite } from "@/lib/sanityClient";

export const runtime = "nodejs";

type Visibility = "public" | "friend" | "patron" | "partner";

type AnswerRequest = {
  ids: string[];
  title: string;
  answerText: string;
  visibility?: Visibility;
  pinned?: boolean;
};

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(x: unknown): x is string {
  return typeof x === "string" && UUID_RE.test(x);
}

function clampLen(s: string, max: number) {
  const v = s.trim();
  return v.length > max ? v.slice(0, max).trim() : v;
}

function slugify(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function makeUniqueSlug(title: string) {
  const base = slugify(title) || "qa";
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(
    d.getUTCDate(),
  )}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
  return `${base}-${ts}`;
}

/**
 * Minimal Portable Text builder:
 * - One blockquote per question
 * - Then answer paragraphs (split on blank lines)
 */
type PTSpan = { _type: "span"; text: string; marks?: string[] };
type PTBlock = {
  _type: "block";
  style: "normal" | "h1" | "h2" | "h3" | "blockquote";
  children: PTSpan[];
  markDefs?: Array<Record<string, unknown>>;
};

function block(
  style: PTBlock["style"],
  text: string,
  extra?: Partial<PTBlock>,
): PTBlock {
  return {
    _type: "block",
    style,
    children: [{ _type: "span", text }],
    markDefs: [],
    ...extra,
  };
}

function answerTextToBlocks(answerText: string): PTBlock[] {
  const cleaned = answerText.replace(/\r\n/g, "\n").trim();
  if (!cleaned) return [];

  const paras = cleaned
    .split(/\n\s*\n+/g)
    .map((p) => p.trim())
    .filter(Boolean);

  return paras.map((p) => block("normal", p));
}

export async function POST(req: Request) {
  try {
    await requireAdminMemberId();

    const raw = (await req.json().catch(() => null)) as unknown;
    if (!raw || typeof raw !== "object") {
      return json(400, { ok: false, code: "BAD_REQUEST" });
    }

    const r = raw as Partial<AnswerRequest>;

    const ids = Array.isArray(r.ids) ? r.ids.filter(isUuid) : [];
    const title = typeof r.title === "string" ? clampLen(r.title, 140) : "";
    const answerText =
      typeof r.answerText === "string" ? r.answerText.trim() : "";

    const visibility: Visibility =
      r.visibility === "friend" ||
      r.visibility === "patron" ||
      r.visibility === "partner" ||
      r.visibility === "public"
        ? r.visibility
        : "public";

    const pinned = Boolean(r.pinned);

    if (ids.length === 0) return json(400, { ok: false, code: "NO_IDS" });
    if (!title) return json(400, { ok: false, code: "NO_TITLE" });
    if (!answerText) return json(400, { ok: false, code: "NO_ANSWER" });

    // Fetch ONLY open questions (safe default)
    const placeholders = ids.map((_, i) => `$${i + 1}::uuid`).join(", ");

    const q = await sql.query<{
      id: string;
      member_id: string;
      question_text: string;
      created_at: string;
    }>(
      `
  SELECT id, member_id, question_text, created_at
  FROM mailbag_questions
  WHERE id IN (${placeholders})
    AND status = 'open'::mailbag_question_status
  ORDER BY created_at ASC, id ASC
  `,
      ids,
    );

    const questions = q.rows ?? [];

    // Build Portable Text body
    const blocks: PTBlock[] = [];
    blocks.push(block("normal", "Mailbag Q&A — selected questions."));
    blocks.push(block("h3", "Questions"));

    for (const qu of questions) {
      const t = qu.question_text.trim();
      blocks.push(block("blockquote", t || "(empty)"));
    }

    blocks.push(block("h3", "Answer"));
    blocks.push(...answerTextToBlocks(answerText));

    const postSlug = makeUniqueSlug(title);
    const publishedAt = new Date().toISOString();

    // Create Sanity artistPost
    const doc = {
      _type: "artistPost",
      title,
      slug: { _type: "slug", current: postSlug },
      publishedAt,
      visibility,
      pinned,
      body: blocks,
    };

    const created = await sanityWrite.create(doc);
    const postId = String((created as { _id?: unknown })._id ?? "");
    if (!postId) {
      return json(500, { ok: false, code: "SANITY_CREATE_FAILED" });
    }

    const answeredIds = questions.map((x) => x.id);
    const inPlaceholders = answeredIds
      .map((_, i) => `$${i + 1}::uuid`)
      .join(", ");

    // postId + postSlug are appended after the uuids
    const postIdParam = `$${answeredIds.length + 1}`;
    const postSlugParam = `$${answeredIds.length + 2}`;

    const upd = await sql.query(
      `
  UPDATE mailbag_questions
  SET
    status = 'answered'::mailbag_question_status,
    answered_at = now(),
    answer_post_id = ${postIdParam},
    answer_post_slug = ${postSlugParam},
    updated_at = now()
  WHERE id IN (${inPlaceholders})
    AND status = 'open'::mailbag_question_status
  `,
      [...answeredIds, postId, postSlug],
    );

    return json(200, {
      ok: true,
      postId,
      postSlug,
      updated: upd.rowCount ?? 0,
      answeredCount: answeredIds.length,
    });
  } catch (e) {
    console.error(e);
    return json(500, { ok: false, code: "SERVER_ERROR" });
  }
}
