// web/app/api/admin/mailbag/questions/answer/route.ts
import "server-only";
import * as React from "react";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { Resend } from "resend";
import { render } from "@react-email/render";
import type { SanityDocumentStub } from "@sanity/client";

import { requireAdminMemberId } from "@/lib/adminAuth";
import { sanityWrite } from "@/lib/sanityClient";
import MailbagAnsweredEmail from "@/emails/MailbagAnswered";

export const runtime = "nodejs";

const resend = new Resend(process.env.RESEND_API_KEY ?? "re_dummy");

function must(v: string | undefined, name: string) {
  if (!v) throw new Error(`Missing ${name}`);
  return v;
}

function appOrigin(): string {
  return must(process.env.NEXT_PUBLIC_APP_URL, "NEXT_PUBLIC_APP_URL").replace(
    /\/$/,
    "",
  );
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s,
  );
}

function normalizeEmail(s: string): string {
  return s.trim().toLowerCase();
}

function placeholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, i) => `$${startAt + i}`).join(",");
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function shortId(): string {
  const u =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return u
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)
    .toLowerCase();
}

type Visibility = "public" | "friend" | "patron" | "partner";

type Body = {
  // ids (accept multiple keys)
  questionIds?: unknown;
  ids?: unknown;
  selectedIds?: unknown;

  // content (accept multiple keys)
  title?: unknown;
  answer?: unknown;
  body?: unknown;
  content?: unknown;
  text?: unknown;
  answerText?: unknown;

  // options
  visibility?: unknown;
  pinned?: unknown;
};

type PTSpan = { _type: "span"; _key: string; text: string };
type PTBlock = {
  _type: "block";
  _key: string;
  style: string;
  children: PTSpan[];
};
type PortableText = PTBlock[];

function k(prefix = "k"): string {
  const u =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${u
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 16)
    .toLowerCase()}`;
}

function span(text: string): PTSpan {
  return { _type: "span", _key: k("s"), text };
}

function block(style: string, text: string): PTBlock {
  return { _type: "block", _key: k("b"), style, children: [span(text)] };
}

function answerToPortableTextBlocks(answer: string): PortableText {
  const paras = answer
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paras.length) return [block("normal", "—")];

  return paras.map((p) => block("normal", p));
}

function pickIds(body: Body | null): { raw: unknown; ids: string[] } {
  const raw = body?.questionIds ?? body?.ids ?? body?.selectedIds ?? null;

  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return { raw, ids: [] };
    const parts = s.includes(",") ? s.split(",") : [s];
    return { raw, ids: parts.map((x) => x.trim()).filter(Boolean) };
  }

  if (Array.isArray(raw)) {
    const ids = raw
      .map((x) => String(x))
      .map((x) => x.trim())
      .filter(Boolean);
    return { raw, ids };
  }

  return { raw, ids: [] };
}

function pickText(
  body: Body | null,
  keys: Array<keyof Body>,
): { key: string | null; value: string } {
  for (const k of keys) {
    const v = body?.[k];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return { key: String(k), value: t };
    }
  }
  return { key: null, value: "" };
}

function asVisibility(v: unknown): Visibility {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "friend" || s === "patron" || s === "partner") return s;
  return "public";
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Body | null;

  const { raw: rawIds, ids: rawList } = pickIds(body);
  const badIds = rawList.filter((id) => !isUuid(id));

  if (!rawList.length || badIds.length) {
    return json(400, {
      ok: false,
      code: "BAD_IDS",
      receivedKeys: body ? Object.keys(body) : [],
      receivedIdsType:
        rawIds === null
          ? "null"
          : Array.isArray(rawIds)
            ? "array"
            : typeof rawIds,
      badIds: badIds.slice(0, 10),
    });
  }

  // De-dupe while preserving order
  const seen = new Set<string>();
  const questionIds = rawList.filter((id) =>
    seen.has(id) ? false : (seen.add(id), true),
  );

  // Title optional, but we’ll force a fallback title for slug stability.
  const pickedTitle = pickText(body, ["title"]);
  const title = pickedTitle.value;

  // Answer required; accept multiple keys
  const pickedAnswer = pickText(body, [
    "answer",
    "answerText",
    "body",
    "content",
    "text",
  ]);
  const answer = pickedAnswer.value;

  const visibility = asVisibility(body?.visibility);
  const pinned = Boolean(body?.pinned);

  if (!answer) {
    return json(400, {
      ok: false,
      code: "EMPTY_ANSWER",
      receivedKeys: body ? Object.keys(body) : [],
      hint: "Expected one of: answer | answerText | body | content | text",
    });
  }

  // Load questions
  const inPh1 = placeholders(questionIds.length, 1);
  const qRes = await sql.query<{ id: string; question_text: string }>(
    `
    select id::text as id, question_text
    from mailbag_questions
    where id in (${inPh1})
    `,
    questionIds,
  );

  if (qRes.rows.length !== questionIds.length) {
    return json(404, { ok: false, code: "NOT_FOUND" });
  }

  // Build Portable Text blocks (with _key everywhere)
  const blocks: PortableText = [];

  blocks.push(
    block(
      "normal",
      "This post responds to mailbag questions from Patrons and Partners.",
    ),
  );

  for (const q of qRes.rows) {
    blocks.push({
      _type: "block",
      _key: k("bq"),
      style: "blockquote",
      children: [span(q.question_text)],
    });

    blocks.push(...answerToPortableTextBlocks(answer));

    // spacer
    blocks.push(block("normal", " "));
  }

  // Force a stable title + explicit slug so Sanity can never “miss” it
  const fallbackTitle = `Q&A — ${new Date().toISOString().slice(0, 10)}`;
  const finalTitle = title || fallbackTitle;
  const slugCurrent = `${slugify(finalTitle)}-${shortId()}`;

  // Create Sanity post
  const doc: SanityDocumentStub = {
    _type: "artistPost",
    title: finalTitle,
    postType: "qa",
    slug: { current: slugCurrent }, // ✅ simplest canonical shape
    publishedAt: new Date().toISOString(),
    visibility,
    pinned,
    body: blocks,
  };

  let created: { _id: string; slug?: { current?: string } };
  try {
    created = (await sanityWrite.create(doc)) as unknown as {
      _id: string;
      slug?: { current?: string };
    };
  } catch {
    return json(500, { ok: false, code: "SANITY_CREATE_FAILED" });
  }

  const slug = created?.slug?.current || slugCurrent;

  // Mark answered (IDs start at $3)
  const inPh3 = placeholders(questionIds.length, 3);
  await sql.query(
    `
    update mailbag_questions
    set status = 'answered',
        answered_at = now(),
        answer_post_id = $1,
        answer_post_slug = $2,
        updated_at = now()
    where id in (${inPh3})
    `,
    [created._id, slug, ...questionIds],
  );

  // Public URL (posts tab + slug param)
  const postUrl = `${appOrigin()}/home?p=posts&post=${encodeURIComponent(slug)}`;

  // Eligible notifications: answered + unstamped + not suppressed
  const notifyRes = await sql.query<{
    question_id: string;
    question_text: string;
    to_email: string;
  }>(
    `
    select
      q.id::text as question_id,
      q.question_text,
      m.email::text as to_email
    from mailbag_questions q
    join members m on m.id = q.member_id
    left join email_suppressions s on s.email = m.email
    where q.id in (${inPh1})
      and q.status = 'answered'
      and q.notify_email_sent_at is null
      and s.email is null
    `,
    questionIds,
  );

  const fromEmail =
    (process.env.RESEND_FROM_TRANSACTIONAL &&
      process.env.RESEND_FROM_TRANSACTIONAL.trim()) ||
    must(process.env.RESEND_FROM_MARKETING, "RESEND_FROM_MARKETING");

  const appName =
    (process.env.NEXT_PUBLIC_APP_NAME &&
      process.env.NEXT_PUBLIC_APP_NAME.trim()) ||
    "BJR";

  const supportEmail =
    (process.env.SUPPORT_EMAIL && process.env.SUPPORT_EMAIL.trim()) ||
    undefined;

  const subject = title
    ? `Your question was answered: ${title}`
    : "Your question was answered";

  const sentQuestionIds: string[] = [];

  for (const row of notifyRes.rows) {
    const toEmail = normalizeEmail(row.to_email || "");
    if (!toEmail) continue;

    const html = await render(
      React.createElement(MailbagAnsweredEmail, {
        appName,
        toEmail,
        questionText: row.question_text,
        postTitle: title || null,
        postUrl,
        supportEmail,
      }),
    );

    const text = [
      "Your question was answered.",
      "",
      title ? `Post: ${title}` : `Post: ${finalTitle}`,
      `Link: ${postUrl}`,
      "",
      "Your question:",
      (row.question_text || "").trim(),
      "",
      supportEmail ? `Need help? ${supportEmail}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const result = await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject,
        html,
        text,
        tags: [
          { name: "purpose", value: "mailbag-answered" },
          { name: "postSlug", value: slug },
        ],
      });

      const providerId =
        (result as unknown as { data?: { id?: string } })?.data?.id ?? null;

      await sql`
        insert into email_outbox (
          kind,
          entity_key,
          to_email,
          from_email,
          subject,
          provider,
          provider_email_id,
          sent_at
        )
        values (
          'mailbag_answered',
          ${row.question_id},
          ${toEmail},
          ${fromEmail},
          ${subject},
          'resend',
          ${providerId},
          now()
        )
      `;

      sentQuestionIds.push(row.question_id);
    } catch {
      continue;
    }
  }

  if (sentQuestionIds.length) {
    const sentPh1 = placeholders(sentQuestionIds.length, 1);
    await sql.query(
      `
      update mailbag_questions
      set notify_email_sent_at = now(),
          updated_at = now()
      where id in (${sentPh1})
        and notify_email_sent_at is null
      `,
      sentQuestionIds,
    );
  }

  return json(200, {
    ok: true,
    post: { id: created._id, slug, url: postUrl },
    notified: {
      attempted: notifyRes.rows.length,
      sent: sentQuestionIds.length,
    },
    debug: {
      acceptedAnswerKey: pickedAnswer.key,
      acceptedTitleKey: pickedTitle.key,
      finalTitle,
    },
  });
}
