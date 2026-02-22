// web/app/api/admin/exegesis/threads/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ThreadRow = {
  trackId: string;
  groupKey: string;
  locked: boolean;
  pinnedCommentId: string | null;
  commentCount: number;
  lastActivityAt: string;
  updatedAt: string;
};

type ApiOk = { ok: true; threads: ThreadRow[] };
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
    track_id: string;
    group_key: string;
    locked: boolean;
    pinned_comment_id: string | null;
    comment_count: number;
    last_activity_at: string;
    updated_at: string;
  }>`
    select
      track_id,
      group_key,
      locked,
      pinned_comment_id,
      comment_count,
      last_activity_at,
      updated_at
    from exegesis_thread_meta
    order by last_activity_at desc
    limit ${limit}
  `;

  const threads: ThreadRow[] = (r.rows ?? []).map((x) => ({
    trackId: x.track_id,
    groupKey: x.group_key,
    locked: x.locked,
    pinnedCommentId: x.pinned_comment_id,
    commentCount: Number(x.comment_count ?? 0),
    lastActivityAt: x.last_activity_at,
    updatedAt: x.updated_at,
  }));

  return json(200, { ok: true, threads });
}