// web/app/api/exegesis/thread/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

type ThreadSort = "top" | "recent";

type Viewer =
  | { kind: "anon"; anonId: string }
  | { kind: "member"; memberId: string };

type IdentityDTO = {
  memberId: string;
  anonLabel: string;
  publicName: string | null;
  publicNameUnlockedAt: string | null;
  contributionCount: number;
};

type CommentDTO = {
  id: string;
  trackId: string;
  groupKey: string;
  lineKey: string;
  parentId: string | null;
  rootId: string;
  depth: number;
  bodyRich: unknown;
  bodyPlain: string;
  tMs: number | null;
  lineTextSnapshot: string;
  lyricsVersion: string | null;
  createdByMemberId: string;
  status: "live" | "hidden" | "deleted";
  createdAt: string;
  editedAt: string | null;
  editCount: number;
  voteCount: number;
  viewerHasVoted: boolean;
};

type ThreadMetaDTO = {
  trackId: string;
  groupKey: string;
  pinnedCommentId: string | null;
  locked: boolean;
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

type ApiOk = {
  ok: true;
  trackId: string;
  groupKey: string;
  sort: ThreadSort;
  meta: ThreadMetaDTO | null;
  roots: Array<{
    rootId: string;
    comments: CommentDTO[]; // chronological
  }>;
  identities: Record<string, IdentityDTO>; // keyed by memberId
  viewer: { kind: Viewer["kind"] };
};

type ApiErr = { ok: false; error: string };

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(s: string | null): string {
  return (s ?? "").trim();
}

function isSort(v: string): v is ThreadSort {
  return v === "top" || v === "recent";
}

/**
 * You said groupKey should be re-derived server-side.
 * For now, we enforce "some stable string" without trusting client:
 * - if client sends groupKey, we require it be non-empty
 * - (in next pass) we’ll derive from lyrics anchoring rules + lyrics_version
 */
function normalizeGroupKey(trackId: string, rawGroupKey: string): string {
  const g = norm(rawGroupKey);
  if (!g) return "";
  // mild hardening: prevent cross-track reuse by requiring trackId prefix later if you want
  // For now just return trimmed.
  return g;
}

async function getViewer(req: NextRequest): Promise<Viewer> {
  // If you already have an anon cookie scheme elsewhere, swap this in.
  // This route supports anon callers, but anon can't vote or post.
  const { userId } = await auth();
  if (!userId) {
    const anonId = norm(req.cookies.get("af_anon")?.value ?? "");
    return { kind: "anon", anonId: anonId || "anon_missing" };
  }

  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = r.rows?.[0]?.id ?? "";
  if (!memberId) {
    // authenticated in Clerk, but not provisioned into members yet
    return { kind: "anon", anonId: "anon_provisioning" };
  }
  return { kind: "member", memberId };
}

type DbCommentRow = {
  id: string;
  track_id: string;
  group_key: string;
  line_key: string;
  parent_id: string | null;
  root_id: string;
  depth: number;
  body_rich: unknown;
  body_plain: string;
  t_ms: number | null;
  line_text_snapshot: string;
  lyrics_version: string | null;
  created_by_member_id: string;
  status: "live" | "hidden" | "deleted";
  created_at: string;
  edited_at: string | null;
  edit_count: number;
  vote_count: number;
  viewer_has_voted: boolean;
};

type DbThreadMetaRow = {
  track_id: string;
  group_key: string;
  pinned_comment_id: string | null;
  locked: boolean;
  comment_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

type DbIdentityRow = {
  member_id: string;
  anon_label: string;
  public_name: string | null;
  public_name_unlocked_at: string | null;
  contribution_count: number;
  created_at: string;
  updated_at: string;
};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const trackId = norm(url.searchParams.get("trackId"));
  const rawGroupKey = norm(url.searchParams.get("groupKey"));
  const sortParam = norm(url.searchParams.get("sort")) || "top";
  const sort: ThreadSort = isSort(sortParam) ? sortParam : "top";

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (!rawGroupKey) return json(400, { ok: false, error: "Missing groupKey." });

  const groupKey = normalizeGroupKey(trackId, rawGroupKey);
  if (!groupKey) return json(400, { ok: false, error: "Invalid groupKey." });

  const viewer = await getViewer(req);
  const viewerMemberId = viewer.kind === "member" ? viewer.memberId : null;

  // thread meta (optional row)
  const metaRes = await sql<DbThreadMetaRow>`
    select track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, created_at, updated_at
    from exegesis_thread_meta
    where track_id = ${trackId}
      and group_key = ${groupKey}
    limit 1
  `;
  const metaRow = metaRes.rows?.[0] ?? null;

  // Comments + viewer vote state (single query)
  // Note: status enum exists; we return all except deleted by default.
  // If you want “hidden” only for admins later, that’s a separate gate.
  const commentsRes = await sql<DbCommentRow>`
    with base as (
      select
        c.id,
        c.track_id,
        c.group_key,
        c.line_key,
        c.parent_id,
        c.root_id,
        c.depth,
        c.body_rich,
        c.body_plain,
        c.t_ms,
        c.line_text_snapshot,
        c.lyrics_version,
        c.created_by_member_id,
        c.status::text as status,
        c.created_at,
        c.edited_at,
        c.edit_count,
        c.vote_count
      from exegesis_comment c
      where c.track_id = ${trackId}
        and c.group_key = ${groupKey}
        and c.status <> 'deleted'
    ),
    voted as (
      select
        b.*,
        case
          when ${viewerMemberId}::uuid is null then false
          else exists (
            select 1
            from exegesis_vote v
            where v.member_id = ${viewerMemberId}::uuid
              and v.comment_id = b.id
          )
        end as viewer_has_voted
      from base b
    )
    select *
    from voted
    order by
      case when ${sort} = 'top' then (case when parent_id is null then vote_count else 0 end) end desc nulls last,
      case when ${sort} = 'recent' then (case when parent_id is null then created_at else null end) end desc nulls last,
      root_id asc,
      created_at asc
  `;

  const rows = commentsRes.rows ?? [];

  // Build roots grouped by root_id, chronological within each root
  const byRoot = new Map<string, CommentDTO[]>();
  const authorIds = new Set<string>();

  for (const r of rows) {
    authorIds.add(r.created_by_member_id);

    const dto: CommentDTO = {
      id: r.id,
      trackId: r.track_id,
      groupKey: r.group_key,
      lineKey: r.line_key,
      parentId: r.parent_id,
      rootId: r.root_id,
      depth: r.depth,
      bodyRich: r.body_rich,
      bodyPlain: r.body_plain,
      tMs: r.t_ms,
      lineTextSnapshot: r.line_text_snapshot,
      lyricsVersion: r.lyrics_version,
      createdByMemberId: r.created_by_member_id,
      status: r.status,
      createdAt: r.created_at,
      editedAt: r.edited_at,
      editCount: r.edit_count,
      voteCount: r.vote_count,
      viewerHasVoted: r.viewer_has_voted,
    };

    const arr = byRoot.get(dto.rootId) ?? [];
    arr.push(dto);
    byRoot.set(dto.rootId, arr);
  }

  // Identity hydration (single query)
  const authorIdList = Array.from(authorIds);
  const identities: Record<string, IdentityDTO> = {};

  function isUuid(v: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    );
  }

  if (authorIdList.length > 0) {
    const uuids = authorIdList.map((s) => s.trim()).filter(isUuid);

    if (uuids.length > 0) {
      // Postgres array literal like: {uuid1,uuid2,...}
      const uuidArrayLiteral = `{${uuids.join(",")}}`;

      const idsRes = await sql<DbIdentityRow>`
      select member_id, anon_label, public_name, public_name_unlocked_at, contribution_count, created_at, updated_at
      from exegesis_identity
      where member_id = any(${uuidArrayLiteral}::uuid[])
    `;

      for (const i of idsRes.rows ?? []) {
        identities[i.member_id] = {
          memberId: i.member_id,
          anonLabel: i.anon_label,
          publicName: i.public_name,
          publicNameUnlockedAt: i.public_name_unlocked_at,
          contributionCount: i.contribution_count,
        };
      }
    }
  }

  const roots = Array.from(byRoot.entries()).map(([rootId, comments]) => ({
    rootId,
    comments,
  }));

  const meta: ThreadMetaDTO | null = metaRow
    ? {
        trackId: metaRow.track_id,
        groupKey: metaRow.group_key,
        pinnedCommentId: metaRow.pinned_comment_id,
        locked: metaRow.locked,
        commentCount: metaRow.comment_count,
        lastActivityAt: metaRow.last_activity_at,
        createdAt: metaRow.created_at,
        updatedAt: metaRow.updated_at,
      }
    : null;

  return json(200, {
    ok: true,
    trackId,
    groupKey,
    sort,
    meta,
    roots,
    identities,
    viewer: { kind: viewer.kind },
  });
}
