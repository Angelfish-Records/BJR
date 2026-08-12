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

type QuestionRow = {
  id: string;
  question_text: string;
  asker_name: string | null;
  kind: SubmissionKind;
  member_email: string | null;
  status: string;
  notify_email_sent_at: string | null;
};

type NotificationRow = {
  question_id: string;
  question_text: string;
  to_email: string;
};

type PickedText = {
  key: string | null;
  value: string;
};

type AnswerRequest = {
  questionIds: string[];
  pickedTitle: PickedText;
  pickedAnswer: PickedText;
  title: string;
  answer: string;
  visibility: Visibility;
  pinned: boolean;
};

type ParseAnswerRequestResult =
  | { ok: true; value: AnswerRequest }
  | { ok: false; response: NextResponse };

type SelectionResult =
  | { ok: true; kind: SubmissionKind }
  | { ok: false; response: NextResponse };

type MailConfig = {
  fromEmail: string;
  appName: string;
  supportEmail?: string;
};

type CreatedPost = {
  _id: string;
  slug?: { current?: string };
};

type PublishedPost = {
  created: CreatedPost;
  slug: string;
  finalTitle: string;
};

type SendResult = {
  sent: boolean;
  providerId: string | null;
};

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
  return escapeHtml(input).replaceAll("\n", "<br />");
}

function placeholders(count: number, startAt = 1): string {
  return Array.from({ length: count }, (_, i) => `$${startAt + i}`).join(",");
}

function slugify(input: string): string {
  const normalized = input.trim().toLowerCase();
  let slug = "";
  let pendingDash = false;

  for (const char of normalized) {
    const code = char.codePointAt(0) ?? 0;
    const isAlphaNumeric =
      (code >= 97 && code <= 122) || (code >= 48 && code <= 57);

    if (isAlphaNumeric) {
      if (pendingDash && slug.length > 0) slug += "-";
      slug += char;
      pendingDash = false;
    } else if (char !== "'" && char !== '"') {
      pendingDash = slug.length > 0;
    }

    if (slug.length >= 80) return slug.slice(0, 80);
  }

  return slug;
}

function secureUuid(label: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;

  throw new Error(`Unable to create secure ${label}`);
}

function shortId(): string {
  return secureUuid("mailbag short id")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 10)
    .toLowerCase();
}

function k(prefix = "k"): string {
  return `${prefix}_${secureUuid("portable text key")
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
    const ids = raw.map(String).map((x) => x.trim()).filter(Boolean);
    return { raw, ids };
  }

  return { raw, ids: [] };
}

function pickText(body: Body | null, keys: Array<keyof Body>): PickedText {
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

function rawIdsType(rawIds: unknown): string {
  if (rawIds === null) return "null";
  if (Array.isArray(rawIds)) return "array";
  return typeof rawIds;
}

function uniqueIds(ids: string[]): string[] {
  return Array.from(new Set(ids));
}

function parseAnswerRequest(body: Body | null): ParseAnswerRequestResult {
  const { raw: rawIds, ids: rawList } = pickIds(body);
  const badIds = rawList.filter((id) => !isUuid(id));

  if (!rawList.length || badIds.length) {
    return {
      ok: false,
      response: json(400, {
        ok: false,
        code: "BAD_IDS",
        receivedKeys: body ? Object.keys(body) : [],
        receivedIdsType: rawIdsType(rawIds),
        badIds: badIds.slice(0, 10),
      }),
    };
  }

  const pickedTitle = pickText(body, ["title"]);
  const pickedAnswer = pickText(body, [
    "answer",
    "answerText",
    "body",
    "content",
    "text",
  ]);

  if (!pickedAnswer.value) {
    return {
      ok: false,
      response: json(400, {
        ok: false,
        code: "EMPTY_ANSWER",
        receivedKeys: body ? Object.keys(body) : [],
        hint: "Expected one of: answer | answerText | body | content | text",
      }),
    };
  }

  return {
    ok: true,
    value: {
      questionIds: uniqueIds(rawList),
      pickedTitle,
      pickedAnswer,
      title: pickedTitle.value,
      answer: pickedAnswer.value,
      visibility: asVisibility(body?.visibility),
      pinned: Boolean(body?.pinned),
    },
  };
}

async function loadQuestions(questionIds: string[]): Promise<QuestionRow[]> {
  const inPh1 = placeholders(questionIds.length, 1);
  const result = await sql.query<QuestionRow>(
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

  return result.rows;
}

function validateSelection(
  rows: QuestionRow[],
  questionIds: string[],
): SelectionResult {
  if (rows.length !== questionIds.length) {
    return {
      ok: false,
      response: json(404, { ok: false, code: "NOT_FOUND" }),
    };
  }

  const selectedKinds = Array.from(new Set(rows.map((row) => row.kind)));
  if (selectedKinds.length !== 1) {
    return {
      ok: false,
      response: json(400, {
        ok: false,
        code: "MIXED_KINDS_NOT_ALLOWED",
        kinds: selectedKinds,
      }),
    };
  }

  const kind = selectedKinds[0] as SubmissionKind;
  if (kind !== "question" && questionIds.length !== 1) {
    return {
      ok: false,
      response: json(400, {
        ok: false,
        code: "PRIVATE_REPLY_REQUIRES_SINGLE_SELECTION",
      }),
    };
  }

  return { ok: true, kind };
}

function mailConfig(): MailConfig {
  const fromEmail =
    process.env.RESEND_FROM_TRANSACTIONAL?.trim() ||
    must(process.env.RESEND_FROM_MARKETING, "RESEND_FROM_MARKETING");

  const appName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || "BJR";
  const supportEmail = process.env.SUPPORT_EMAIL?.trim() || undefined;

  return { fromEmail, appName, supportEmail };
}

function buildQuestionBlocks(
  rows: QuestionRow[],
  answer: string,
): PortableText {
  const blocks: PortableText = [
    {
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
    },
  ];

  for (const question of rows) {
    const name = (question.asker_name ?? "").trim();
    const children: PTSpan[] = [
      span((question.question_text || "").trim()),
    ];

    if (name) {
      children.push(span("\n"), span(`— ${name}`, ["mailbagAsker"]));
    }

    blocks.push({
      _type: "block",
      _key: k("bq"),
      style: "blockquote",
      children,
    });
  }

  blocks.push(...answerToPortableTextBlocks(answer));
  return blocks;
}

async function createPublishedPost(params: {
  title: string;
  answer: string;
  rows: QuestionRow[];
  visibility: Visibility;
  pinned: boolean;
}): Promise<PublishedPost | null> {
  const { title, answer, rows, visibility, pinned } = params;
  const blocks = buildQuestionBlocks(rows, answer);
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

  try {
    const created = (await sanityWrite.create(doc)) as unknown as CreatedPost;
    return {
      created,
      slug: created?.slug?.current || slugCurrent,
      finalTitle,
    };
  } catch {
    return null;
  }
}

async function markQuestionsPublished(params: {
  questionIds: string[];
  createdId: string;
  slug: string;
  answer: string;
}): Promise<void> {
  const { questionIds, createdId, slug, answer } = params;
  const inPh4 = placeholders(questionIds.length, 4);

  await sql.query(
    `
    UPDATE mailbag_questions
    SET status = 'answered',
        answered_at = now(),
        answer_post_id = $1,
        answer_post_slug = $2,
        admin_reply_text = $3,
        updated_at = now()
    WHERE id IN (${inPh4})
    `,
    [createdId, slug, answer, ...questionIds],
  );
}

async function loadPublishedNotificationRows(
  questionIds: string[],
): Promise<NotificationRow[]> {
  const inPh1 = placeholders(questionIds.length, 1);
  const result = await sql.query<NotificationRow>(
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

  return result.rows;
}

function providerIdFromResult(result: unknown): string | null {
  return (result as { data?: { id?: string } })?.data?.id ?? null;
}

async function recordEmailOutbox(params: {
  kind: string;
  entityKey: string;
  toEmail: string;
  fromEmail: string;
  subject: string;
  providerId: string | null;
}): Promise<void> {
  const { kind, entityKey, toEmail, fromEmail, subject, providerId } = params;

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
      ${kind},
      ${entityKey},
      ${toEmail},
      ${fromEmail},
      ${subject},
      'resend',
      ${providerId},
      now()
    )
  `;
}

function publishedNotificationText(params: {
  title: string;
  finalTitle: string;
  postUrl: string;
  questionText: string;
  supportEmail?: string;
}): string {
  const { title, finalTitle, postUrl, questionText, supportEmail } = params;
  const postTitle = title || finalTitle;

  return [
    "Your question was answered.",
    "",
    `Post: ${postTitle}`,
    `Link: ${postUrl}`,
    "",
    "Your question:",
    (questionText || "").trim(),
    "",
    supportEmail ? `Need help? ${supportEmail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendPublishedNotifications(params: {
  rows: NotificationRow[];
  config: MailConfig;
  title: string;
  finalTitle: string;
  slug: string;
  postUrl: string;
}): Promise<string[]> {
  const { rows, config, title, finalTitle, slug, postUrl } = params;
  const subject = title
    ? `Your question was answered: ${title}`
    : "Your question was answered";
  const sentQuestionIds: string[] = [];

  for (const row of rows) {
    const toEmail = normalizeEmail(row.to_email || "");
    if (!toEmail) continue;

    const html = await render(
      React.createElement(MailbagAnsweredEmail, {
        appName: config.appName,
        toEmail,
        questionText: row.question_text,
        postTitle: title || null,
        postUrl,
        supportEmail: config.supportEmail,
      }),
    );

    const text = publishedNotificationText({
      title,
      finalTitle,
      postUrl,
      questionText: row.question_text,
      supportEmail: config.supportEmail,
    });

    try {
      const result = await resend.emails.send({
        from: config.fromEmail,
        to: [toEmail],
        subject,
        html,
        text,
        tags: [
          { name: "purpose", value: "mailbag-answered" },
          { name: "postSlug", value: slug },
        ],
      });

      await recordEmailOutbox({
        kind: "mailbag_answered",
        entityKey: row.question_id,
        toEmail,
        fromEmail: config.fromEmail,
        subject,
        providerId: providerIdFromResult(result),
      });

      sentQuestionIds.push(row.question_id);
    } catch {
      continue;
    }
  }

  return sentQuestionIds;
}

async function markPublishedNotificationsSent(
  sentQuestionIds: string[],
): Promise<void> {
  if (!sentQuestionIds.length) return;

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

async function handlePublishedQuestionAnswer(params: {
  request: AnswerRequest;
  rows: QuestionRow[];
  kind: SubmissionKind;
}): Promise<NextResponse> {
  const { request, rows, kind } = params;
  const published = await createPublishedPost({
    title: request.title,
    answer: request.answer,
    rows,
    visibility: request.visibility,
    pinned: request.pinned,
  });

  if (!published) {
    return json(500, { ok: false, code: "SANITY_CREATE_FAILED" });
  }

  await markQuestionsPublished({
    questionIds: request.questionIds,
    createdId: published.created._id,
    slug: published.slug,
    answer: request.answer,
  });

  const postUrl = `${appOrigin()}/journal?post=${encodeURIComponent(
    published.slug,
  )}`;
  const notificationRows = await loadPublishedNotificationRows(
    request.questionIds,
  );
  const sentQuestionIds = await sendPublishedNotifications({
    rows: notificationRows,
    config: mailConfig(),
    title: request.title,
    finalTitle: published.finalTitle,
    slug: published.slug,
    postUrl,
  });

  await markPublishedNotificationsSent(sentQuestionIds);

  return json(200, {
    ok: true,
    mode: "published_post",
    kind,
    post: {
      id: published.created._id,
      slug: published.slug,
      url: postUrl,
    },
    notified: {
      attempted: notificationRows.length,
      sent: sentQuestionIds.length,
    },
    debug: {
      acceptedAnswerKey: request.pickedAnswer.key,
      acceptedTitleKey: request.pickedTitle.key,
      finalTitle: published.finalTitle,
    },
  });
}

function privatePurposeTag(kind: SubmissionKind): string {
  return kind === "suggestion"
    ? "suggestion-replied"
    : "bug-report-replied";
}

function privateOutboxKind(kind: SubmissionKind): string {
  return kind === "suggestion"
    ? "mailbag_suggestion_replied"
    : "mailbag_bug_report_replied";
}

function privateReplyText(params: {
  kind: SubmissionKind;
  originalText: string;
  replyText: string;
  supportEmail?: string;
}): string {
  const { kind, originalText, replyText, supportEmail } = params;
  const label = kindLabel(kind);

  return [
    `We've replied to your ${label}.`,
    "",
    `Your ${label}:`,
    originalText.trim(),
    "",
    "Reply:",
    replyText,
    "",
    supportEmail ? `Need help? ${supportEmail}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendPrivateReply(params: {
  target: QuestionRow;
  kind: SubmissionKind;
  answer: string;
  config: MailConfig;
  toEmail: string;
  subject: string;
}): Promise<SendResult> {
  const { target, kind, answer, config, toEmail, subject } = params;
  let providerId: string | null = null;

  if (!toEmail) return { sent: false, providerId };

  const html = buildPrivateReplyHtml({
    appName: config.appName,
    kind,
    originalText: target.question_text,
    replyText: answer,
    supportEmail: config.supportEmail,
  });

  const text = privateReplyText({
    kind,
    originalText: target.question_text,
    replyText: answer,
    supportEmail: config.supportEmail,
  });

  try {
    const result = await resend.emails.send({
      from: config.fromEmail,
      to: [toEmail],
      subject,
      html,
      text,
      tags: [
        { name: "purpose", value: privatePurposeTag(kind) },
        { name: "submissionId", value: target.id },
      ],
    });

    providerId = providerIdFromResult(result);

    await recordEmailOutbox({
      kind: privateOutboxKind(kind),
      entityKey: target.id,
      toEmail,
      fromEmail: config.fromEmail,
      subject,
      providerId,
    });

    return { sent: true, providerId };
  } catch {
    return { sent: false, providerId };
  }
}

async function markPrivateReplyAnswered(params: {
  questionId: string;
  answer: string;
  sent: boolean;
}): Promise<void> {
  const { questionId, answer, sent } = params;

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
}

async function handlePrivateAnswer(params: {
  request: AnswerRequest;
  rows: QuestionRow[];
  kind: SubmissionKind;
}): Promise<NextResponse> {
  const { request, rows, kind } = params;
  const target = rows[0];
  const toEmail = normalizeEmail(target.member_email || "");
  const config = mailConfig();
  const subject = privateReplySubject(kind);
  const result = await sendPrivateReply({
    target,
    kind,
    answer: request.answer,
    config,
    toEmail,
    subject,
  });

  await markPrivateReplyAnswered({
    questionId: target.id,
    answer: request.answer,
    sent: result.sent,
  });

  return json(200, {
    ok: true,
    mode: "private_reply",
    kind,
    notified: {
      attempted: toEmail ? 1 : 0,
      sent: result.sent ? 1 : 0,
    },
    debug: {
      acceptedAnswerKey: request.pickedAnswer.key,
      acceptedTitleKey: request.pickedTitle.key,
      providerId: result.providerId,
    },
  });
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Body | null;
  const parsed = parseAnswerRequest(body);
  if (!parsed.ok) return parsed.response;

  const rows = await loadQuestions(parsed.value.questionIds);
  const selection = validateSelection(rows, parsed.value.questionIds);
  if (!selection.ok) return selection.response;

  if (selection.kind === "question") {
    return handlePublishedQuestionAnswer({
      request: parsed.value,
      rows,
      kind: selection.kind,
    });
  }

  return handlePrivateAnswer({
    request: parsed.value,
    rows,
    kind: selection.kind,
  });
}