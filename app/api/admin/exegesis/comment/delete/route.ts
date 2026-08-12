import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";
import { requireAdminMemberId } from "@/lib/adminAuth";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  requestedCount: number;
  foundCount: number;
  affectedCount: number;
  deletedCount: number;
  threadCount: number;
};

type ApiErr = {
  ok: false;
  error: string;
};

type DeleteResultRow = {
  requested_count: number | string;
  found_count: number | string;
  affected_count: number | string;
  deleted_count: number | string;
  thread_count: number | string;
};

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function readCommentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return Array.from(
    new Set(
      value
        .map(norm)
        .filter((id) => id.length > 0),
    ),
  );
}

export async function POST(req: NextRequest) {
  await requireAdminMemberId();

  const body = (await req.json().catch(() => null)) as
    | Record<string, unknown>
    | null;

  const commentIds = readCommentIds(body?.commentIds);

  if (commentIds.length === 0) {
    return json(400, {
      ok: false,
      error: "Select at least one comment.",
    });
  }

  if (commentIds.length > 100) {
    return json(400, {
      ok: false,
      error: "A maximum of 100 comments can be deleted at once.",
    });
  }

  if (commentIds.some((id) => !isUuid(id))) {
    return json(400, {
      ok: false,
      error: "One or more comment IDs are invalid.",
    });
  }

  const uuidArrayLiteral = `{${commentIds.join(",")}}`;

  const result = await sql<DeleteResultRow>`
    with recursive
    requested as (
      select unnest(${uuidArrayLiteral}::uuid[]) as id
    ),
    seed as (
      select
        comment.id,
        comment.track_id,
        comment.group_key
      from exegesis_comment comment
      join requested on requested.id = comment.id
    ),
    subtree as (
      select
        seed.id,
        seed.track_id,
        seed.group_key
      from seed

      union

      select
        child.id,
        child.track_id,
        child.group_key
      from exegesis_comment child
      join subtree parent
        on child.parent_id = parent.id
    ),
    affected_threads as (
      select distinct track_id, group_key
      from subtree
    ),
    deleted as (
      update exegesis_comment comment
      set
        status = 'deleted'
      where comment.id in (
        select subtree.id
        from subtree
      )
        and comment.status <> 'deleted'
      returning
        comment.id,
        comment.track_id,
        comment.group_key
    ),
    meta_upd as (
      update exegesis_thread_meta meta
      set
        pinned_comment_id = case
          when exists (
            select 1
            from subtree
            where subtree.id = meta.pinned_comment_id
          )
            then null
          else meta.pinned_comment_id
        end,
        comment_count = (
          select count(*)::int
          from exegesis_comment comment
          where comment.track_id = meta.track_id
            and comment.group_key = meta.group_key
            and comment.status <> 'deleted'
            and not exists (
              select 1
              from subtree
              where subtree.id = comment.id
            )
        ),
        last_activity_at = coalesce(
          (
            select max(comment.created_at)
            from exegesis_comment comment
            where comment.track_id = meta.track_id
              and comment.group_key = meta.group_key
              and comment.status <> 'deleted'
              and not exists (
                select 1
                from subtree
                where subtree.id = comment.id
              )
          ),
          meta.created_at
        ),
        updated_at = now()
      where exists (
        select 1
        from affected_threads affected
        where affected.track_id = meta.track_id
          and affected.group_key = meta.group_key
      )
      returning 1
    )
    select
      (select count(*) from requested) as requested_count,
      (select count(*) from seed) as found_count,
      (select count(*) from subtree) as affected_count,
      (select count(*) from deleted) as deleted_count,
      (select count(*) from meta_upd) as thread_count
  `;

  const row = result.rows[0];

  if (!row) {
    return json(500, {
      ok: false,
      error: "Delete operation returned no result.",
    });
  }

  const foundCount = Number(row.found_count ?? 0);

  if (foundCount === 0) {
    return json(404, {
      ok: false,
      error: "None of the selected comments were found.",
    });
  }

  return json(200, {
    ok: true,
    requestedCount: Number(row.requested_count ?? 0),
    foundCount,
    affectedCount: Number(row.affected_count ?? 0),
    deletedCount: Number(row.deleted_count ?? 0),
    threadCount: Number(row.thread_count ?? 0),
  });
}
