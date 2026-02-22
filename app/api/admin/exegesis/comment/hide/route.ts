// web/app/api/admin/exegesis/comment/hide/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  comment: {
    id: string;
    trackId: string;
    groupKey: string;
    status: "live" | "hidden" | "deleted";
    updatedAt: string; // server time
  };
};

type ApiErr = { ok: false; error: string; code?: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function must<T>(v: T | null | undefined, msg: string): T {
  if (v === null || v === undefined) throw new Error(msg);
  return v;
}

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function asStatus(v: unknown): "live" | "hidden" {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s === "live" ? "live" : "hidden";
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  const commentId = norm(body?.commentId);
  const next = asStatus(body?.nextStatus);

  if (!commentId) return json(400, { ok: false, error: "Missing commentId." });
  if (!isUuid(commentId))
    return json(400, { ok: false, error: "Invalid commentId." });

  const r = await sql<{
    err: "NOT_FOUND" | "DELETED" | null;
    id: string | null;
    track_id: string | null;
    group_key: string | null;
    status: string | null;
    updated_at: string | null;
  }>`
    with c as (
      select id, track_id, group_key, status::text as status
      from exegesis_comment
      where id = ${commentId}::uuid
      limit 1
    ),
    guard as (
      select
        case
          when (select id from c) is null then 'NOT_FOUND'
          when (select status from c) = 'deleted' then 'DELETED'
          else null
        end as err
    ),
    upd as (
      update exegesis_comment
      set status = ${next}::exegesis_comment_status
      where id = ${commentId}::uuid
        and (select err from guard) is null
      returning id, track_id, group_key, status::text as status, now()::timestamptz as updated_at
    )
    select
      coalesce((select err from guard), null) as err,
      (select id from upd) as id,
      (select track_id from upd) as track_id,
      (select group_key from upd) as group_key,
      (select status from upd) as status,
      (select updated_at from upd)::text as updated_at
  `;

  const row = r.rows?.[0];
  const err = row?.err ?? null;

  if (err === "NOT_FOUND")
    return json(404, { ok: false, error: "Comment not found." });
  if (err === "DELETED")
    return json(400, { ok: false, error: "Cannot change a deleted comment." });

  if (!row?.id) return json(500, { ok: false, error: "Update failed." });

  return json(200, {
    ok: true,
    comment: {
      id: must(row?.id, "Expected id on success."),
      trackId: must(row?.track_id, "Expected track_id on success."),
      groupKey: must(row?.group_key, "Expected group_key on success."),
      status: must(row?.status, "Expected status on success.") as
        | "live"
        | "hidden"
        | "deleted",
      updatedAt: must(row?.updated_at, "Expected updated_at on success."),
    },
  });
}
