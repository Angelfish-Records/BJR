// web/app/api/admin/exegesis/reports/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ReportRow = {
  reportId: string;
  createdAt: string;
  category: string;
  reason: string;

  commentId: string;
  commentStatus: "live" | "hidden" | "deleted";
  trackId: string;
  groupKey: string;
  lineKey: string;
  bodyPlain: string;
  commentCreatedAt: string;
};

type ApiOk = { ok: true; reports: ReportRow[] };
type ApiErr = { ok: false; error: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function clampInt(v: string | null, def: number, min: number, max: number) {
  const n = v ? Number(v) : NaN;
  if (!Number.isFinite(n)) return def;
  const x = Math.trunc(n);
  if (x < min) return min;
  if (x > max) return max;
  return x;
}

export async function GET(req: NextRequest) {
  await requireAdminMemberId();

  const url = new URL(req.url);
  const limit = clampInt(url.searchParams.get("limit"), 50, 1, 200);

  const r = await sql<{
    report_id: string;
    report_created_at: string;
    category: string;
    reason: string;

    comment_id: string;
    comment_status: string;
    track_id: string;
    group_key: string;
    line_key: string;
    body_plain: string;
    comment_created_at: string;
  }>`
    select
      rep.id::text as report_id,
      rep.created_at::text as report_created_at,
      rep.category,
      rep.reason,

      c.id::text as comment_id,
      c.status::text as comment_status,
      c.track_id,
      c.group_key,
      c.line_key,
      c.body_plain,
      c.created_at::text as comment_created_at
    from exegesis_report rep
    join exegesis_comment c on c.id = rep.comment_id
    order by rep.created_at desc
    limit ${limit}
  `;

  const reports: ReportRow[] = (r.rows ?? []).map((x) => ({
    reportId: x.report_id,
    createdAt: x.report_created_at,
    category: x.category,
    reason: x.reason,

    commentId: x.comment_id,
    commentStatus: x.comment_status as "live" | "hidden" | "deleted",
    trackId: x.track_id,
    groupKey: x.group_key,
    lineKey: x.line_key,
    bodyPlain: x.body_plain,
    commentCreatedAt: x.comment_created_at,
  }));

  return json(200, { ok: true, reports });
}