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

type Body = {
  questionIds: string[];
  title?: string;
  answer?: string;
  visibility?: "public" | "friend" | "patron" | "partner";
  pinned?: boolean;
};

type PTSpan = { _type: "span"; text: string };
type PTBlock = {
  _type: "block";
  style: string;
  children: PTSpan[];
};
type PortableText = PTBlock[];

function answerToPortableTextBlocks(answer: string): PortableText {
  const paras = answer
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean);

  if (!paras.length) {
    return [
      {
        _type: "block",
        style: "normal",
        children: [{ _type: "span", text: "—" }],
      },
    ];
  }

  return paras.map((p) => ({
    _type: "block",
    style: "normal",
    children: [{ _type: "span", text: p }],
  }));
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Body | null;

  const rawIds = Array.isArray(body?.questionIds) ? body!.questionIds : [];
  const questionIds = rawIds.map(String);

  if (!questionIds.length) return json(400, { ok: false, code: "BAD_IDS" });
  if (questionIds.some((id) => !isUuid(id)))
    return json(400, { ok: false, code: "BAD_IDS" });

  const title = (body?.title ?? "").trim();
  const answer = (body?.answer ?? "").trim();
  const visibility = (body?.visibility ?? "public") as
    | "public"
    | "friend"
    | "patron"
    | "partner";
  const pinned = Boolean(body?.pinned);

  if (!answer) return json(400, { ok: false, code: "EMPTY_ANSWER" });

  // Load questions
  const inPh1 = placeholders(questionIds.length, 1);
  const qRes = await sql.query<{
    id: string;
    question_text: string;
  }>(
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

  // Build Portable Text blocks
  const blocks: PortableText = [];

  if (title) {
    blocks.push({
      _type: "block",
      style: "h2",
      children: [{ _type: "span", text: title }],
    });
  }

  blocks.push({
    _type: "block",
    style: "normal",
    children: [{ _type: "span", text: "Mailbag answers." }],
  });

  for (const q of qRes.rows) {
    blocks.push({
      _type: "block",
      style: "blockquote",
      children: [{ _type: "span", text: q.question_text }],
    });
    blocks.push(...answerToPortableTextBlocks(answer));
    blocks.push({
      _type: "block",
      style: "normal",
      children: [{ _type: "span", text: " " }],
    });
  }

  // Create Sanity post
  const nowIso = new Date().toISOString();

  const doc: SanityDocumentStub = {
    _type: "artistPost",
    title: title || undefined,
    publishedAt: nowIso,
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

  const slug = created?.slug?.current;
  if (!slug) return json(500, { ok: false, code: "SANITY_SLUG_MISSING" });

  // Update rows -> answered (IDs start at $3)
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

  // Public link target (adjust param if your URL state differs)
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
      title ? `Post: ${title}` : "Post: (new post)",
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
  });
}
