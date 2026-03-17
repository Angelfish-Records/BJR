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

type Visibility = "public" | "friend" | "patron" | "partner";
type SubmissionKind = "question" | "suggestion" | "bug_report";

type Body = {
  questionIds?: unknown;
  ids?: unknown;
  selectedIds?: unknown;
  title?: unknown;
  answer?: unknown;
  body?: unknown;
  content?: unknown;
  text?: unknown;
  answerText?: unknown;
  visibility?: unknown;
  pinned?: unknown;
};

type PTSpan = { _type: "span"; _key: string; text: string; marks?: string[] };
type PTMarkDef = { _key: string; _type: string; href?: string };
type PTBlock = {
  _type: "block";
  _key: string;
  style: string;
  children: PTSpan[];
  markDefs?: PTMarkDef[];
};
type PortableText = PTBlock[];

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

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2brHtml(input: string): string {
  return escapeHtml(input).replace(/\n/g, "<br />");
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

function k(prefix = "k"): string {
  const u =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${u
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 16)
    .toLowerCase()}`;
}

function span(text: string, marks?: string[]): PTSpan {
  return marks?.length
    ? { _type: "span", _key: k("s"), text, marks }
    : { _type: "span", _key: k("s"), text };
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
  for (const kk of keys) {
    const v = body?.[kk];
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return { key: String(kk), value: t };
    }
  }
  return { key: null, value: "" };
}

function asVisibility(v: unknown): Visibility {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (s === "friend" || s === "patron" || s === "partner") return s;
  return "public";
}

function kindLabel(kind: SubmissionKind): string {
  if (kind === "suggestion") return "suggestion";
  if (kind === "bug_report") return "bug report";
  return "question";
}

function privateReplySubject(kind: SubmissionKind): string {
  if (kind === "suggestion") return "Your suggestion received a reply";
  if (kind === "bug_report") return "Your bug report received a reply";
  return "Your question was answered";
}

function buildPrivateReplyHtml(params: {
  appName: string;
  kind: SubmissionKind;
  originalText: string;
  replyText: string;
  supportEmail?: string;
}) {
  const { appName, kind, originalText, replyText, supportEmail } = params;
  const kindName = kindLabel(kind);

  return [
    "<!doctype html>",
    '<html><body style="margin:0;padding:0;background:#0b0b0d;color:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif;">',
    '<div style="max-width:640px;margin:0 auto;padding:32px 20px;">',
    `<div style="font-size:22px;font-weight:800;line-height:1.2;margin-bottom:16px;">${escapeHtml(appName)}</div>`,
    `<div style="font-size:18px;font-weight:700;line-height:1.35;margin-bottom:14px;">We’ve replied to your ${escapeHtml(kindName)}.</div>`,
    '<div style="font-size:14px;line-height:1.7;opacity:0.95;margin-bottom:18px;">Thank you for helping shape the site.</div>',
    '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:16px;background:rgba(255,255,255,0.04);margin-bottom:14px;">',
    '<div style="font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;opacity:0.7;margin-bottom:8px;">Your submission</div>',
    `<div style="font-size:14px;line-height:1.7;white-space:normal;">${nl2brHtml(originalText)}</div>`,
    "</div>",
    '<div style="border:1px solid rgba(255,255,255,0.12);border-radius:14px;padding:16px;background:rgba(255,255,255,0.04);margin-bottom:14px;">',
    '<div style="font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;opacity:0.7;margin-bottom:8px;">Reply</div>',
    `<div style="font-size:14px;line-height:1.7;white-space:normal;">${nl2brHtml(replyText)}</div>`,
    "</div>",
    supportEmail
      ? `<div style="font-size:12px;line-height:1.6;opacity:0.72;">Need help? ${escapeHtml(
          supportEmail,
        )}</div>`
      : "",
    "</div></body></html>",
  ].join("");
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

  const seen = new Set<string>();
  const questionIds = rawList.filter((id) =>
    seen.has(id) ? false : (seen.add(id), true),
  );

  const pickedTitle = pickText(body, ["title"]);
  const title = pickedTitle.value;

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

  const inPh1 = placeholders(questionIds.length, 1);
  const qRes = await sql.query<{
    id: string;
    question_text: string;
    asker_name: string | null;
    kind: SubmissionKind;
    member_email: string | null;
    status: string;
    notify_email_sent_at: string | null;
  }>(
    `
    SELECT
      q.id::text AS id,
      q.question_text,
      q.asker_name,
      q.kind::text AS kind,
      m.email::text AS member_email,
      q.status::text AS status,
      q.notify_email_sent_at
    FROM mailbag_questions q
    JOIN members m ON m.id = q.member_id
    WHERE q.id IN (${inPh1})
    `,
    questionIds,
  );

  if (qRes.rows.length !== questionIds.length) {
    return json(404, { ok: false, code: "NOT_FOUND" });
  }

  const selectedKinds = Array.from(new Set(qRes.rows.map((row) => row.kind)));
  if (selectedKinds.length !== 1) {
    return json(400, {
      ok: false,
      code: "MIXED_KINDS_NOT_ALLOWED",
      kinds: selectedKinds,
    });
  }

  const kind = selectedKinds[0] as SubmissionKind;

  if (kind !== "question" && questionIds.length !== 1) {
    return json(400, {
      ok: false,
      code: "PRIVATE_REPLY_REQUIRES_SINGLE_SELECTION",
    });
  }

  if (kind === "question") {
    const blocks: PortableText = [];

    blocks.push({
      _type: "block",
      _key: k("intro"),
      style: "normal",
      markDefs: [
        {
          _key: "mailbagIntro",
          _type: "mailbagIntro",
        },
      ],
      children: [
        {
          _type: "span",
          _key: k("s"),
          text: "This post responds to mailbag questions from Patrons and Partners.",
          marks: ["mailbagIntro"],
        },
      ],
    });

    for (const q of qRes.rows) {
      const name = (q.asker_name ?? "").trim();
      const children: PTSpan[] = [span((q.question_text || "").trim())];

      if (name) {
        children.push(span("\n"));
        children.push(span(`— ${name}`, ["mailbagAsker"]));
      }

      blocks.push({
        _type: "block",
        _key: k("bq"),
        style: "blockquote",
        children,
      });
    }

    blocks.push(...answerToPortableTextBlocks(answer));

    const fallbackTitle = `Q&A — ${new Date().toISOString().slice(0, 10)}`;
    const finalTitle = title || fallbackTitle;
    const slugCurrent = `${slugify(finalTitle)}-${shortId()}`;

    const doc: SanityDocumentStub = {
      _type: "artistPost",
      title: finalTitle,
      postType: "qa",
      slug: { current: slugCurrent },
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

    const inPh3 = placeholders(questionIds.length, 3);
    await sql.query(
      `
      UPDATE mailbag_questions
      SET status = 'answered',
          answered_at = now(),
          answer_post_id = $1,
          answer_post_slug = $2,
          admin_reply_text = $3,
          updated_at = now()
      WHERE id IN (${inPh3})
      `,
      [created._id, slug, answer, ...questionIds],
    );

    const postUrl = `${appOrigin()}/journal?post=${encodeURIComponent(slug)}`;

    const notifyRes = await sql.query<{
      question_id: string;
      question_text: string;
      to_email: string;
    }>(
      `
      SELECT
        q.id::text AS question_id,
        q.question_text,
        m.email::text AS to_email
      FROM mailbag_questions q
      JOIN members m ON m.id = q.member_id
      LEFT JOIN email_suppressions s ON s.email = m.email
      WHERE q.id IN (${inPh1})
        AND q.status = 'answered'
        AND q.notify_email_sent_at IS NULL
        AND s.email IS NULL
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
          (result as { data?: { id?: string } })?.data?.id ?? null;

        await sql`
          INSERT INTO email_outbox (
            kind,
            entity_key,
            to_email,
            from_email,
            subject,
            provider,
            provider_email_id,
            sent_at
          )
          VALUES (
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
        UPDATE mailbag_questions
        SET notify_email_sent_at = now(),
            updated_at = now()
        WHERE id IN (${sentPh1})
          AND notify_email_sent_at IS NULL
        `,
        sentQuestionIds,
      );
    }

    return json(200, {
      ok: true,
      mode: "published_post",
      kind,
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

  const target = qRes.rows[0];
  const toEmail = normalizeEmail(target.member_email || "");
  const questionId = target.id;

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

  const subject = privateReplySubject(kind);

  let sent = false;
  let providerId: string | null = null;

  if (toEmail) {
    const html = buildPrivateReplyHtml({
      appName,
      kind,
      originalText: target.question_text,
      replyText: answer,
      supportEmail,
    });

    const text = [
      `We've replied to your ${kindLabel(kind)}.`,
      "",
      `Your ${kindLabel(kind)}:`,
      target.question_text.trim(),
      "",
      "Reply:",
      answer,
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
          {
            name: "purpose",
            value:
              kind === "suggestion"
                ? "suggestion-replied"
                : "bug-report-replied",
          },
          { name: "submissionId", value: questionId },
        ],
      });

      providerId = (result as { data?: { id?: string } })?.data?.id ?? null;
      sent = true;

      await sql`
        INSERT INTO email_outbox (
          kind,
          entity_key,
          to_email,
          from_email,
          subject,
          provider,
          provider_email_id,
          sent_at
        )
        VALUES (
          ${kind === "suggestion" ? "mailbag_suggestion_replied" : "mailbag_bug_report_replied"},
          ${questionId},
          ${toEmail},
          ${fromEmail},
          ${subject},
          'resend',
          ${providerId},
          now()
        )
      `;
    } catch {
      sent = false;
    }
  }

  await sql`
    UPDATE mailbag_questions
    SET status = 'answered',
        answered_at = now(),
        admin_reply_text = ${answer},
        admin_reply_sent_at = ${sent ? new Date().toISOString() : null}::timestamptz,
        notify_email_sent_at = CASE
          WHEN ${sent} THEN now()
          ELSE notify_email_sent_at
        END,
        updated_at = now()
    WHERE id = ${questionId}::uuid
  `;

  return json(200, {
    ok: true,
    mode: "private_reply",
    kind,
    notified: {
      attempted: toEmail ? 1 : 0,
      sent: sent ? 1 : 0,
    },
    debug: {
      acceptedAnswerKey: pickedAnswer.key,
      acceptedTitleKey: pickedTitle.key,
      providerId,
    },
  });
}
