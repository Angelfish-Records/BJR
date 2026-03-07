// web/app/api/exegesis/thread/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { ensureAnonId } from "@/lib/anon";
import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";
import {
  resolveGroupKeyForAnchor,
  isGroupKeyV1,
  isKnownCanonicalGroupKey,
} from "@/lib/exegesis/resolveGroupKey";
import type { GatePayload } from "@/app/home/gating/gateTypes";
import {
  correlationIdFromRequest,
  gateError,
  jsonOk,
  withCorrelationId,
} from "@/app/api/_gate";
import { stableAnonLabel } from "@/lib/exegesis/stableAnonLabel";

export const runtime = "nodejs";

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
  recordingId: string;
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
  recordingId: string;
  groupKey: string;
  pinnedCommentId: string | null;
  locked: boolean;
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

type ViewerDTO =
  | { kind: "anon" }
  | {
      kind: "member";
      memberId: string;
      cap: {
        canVote: boolean;
        canReport: boolean;
        canPost: boolean;
        canClaimName: boolean;
      };
    };

type ApiOk = {
  ok: true;
  recordingId: string;
  groupKey: string;
  sort: ThreadSort;
  meta: ThreadMetaDTO | null;
  roots: Array<{
    rootId: string;
    comments: CommentDTO[];
  }>;
  identities: Record<string, IdentityDTO>;
  viewer: ViewerDTO;
};

type ApiErr = { ok: false; error: string; gate?: GatePayload };

function jsonErr(
  correlationId: string,
  status: number,
  body: ApiErr,
  headers?: HeadersInit,
) {
  const res = NextResponse.json<ApiErr>(body, { status, headers });
  return withCorrelationId(res, correlationId);
}

function norm(s: string | null): string {
  return (s ?? "").trim();
}

function isSort(v: string): v is ThreadSort {
  return v === "top" || v === "recent";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function getViewer(
  req: NextRequest,
  mintedAnonId: string,
): Promise<Viewer> {
  const { userId } = await auth();
  if (!userId) return { kind: "anon", anonId: mintedAnonId };

  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = r.rows?.[0]?.id ?? "";
  if (!memberId) return { kind: "anon", anonId: mintedAnonId };

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

async function capsForMember(memberId: string): Promise<{
  canVote: boolean;
  canReport: boolean;
  canPost: boolean;
}> {
  const canVote = await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_FRIEND,
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
  const canReport = canVote;
  const canPost = await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
  return { canVote, canReport, canPost };
}

export async function GET(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const url = new URL(req.url);

  const recordingId = norm(url.searchParams.get("recordingId"));
  const sortParam = norm(url.searchParams.get("sort")) || "top";
  const sort: ThreadSort = isSort(sortParam) ? sortParam : "top";

  if (!recordingId) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Missing recordingId.",
    });
  }
  if (recordingId.length > 200) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid recordingId.",
    });
  }

  const rawGroupKey = norm(url.searchParams.get("groupKey"));
  const lineKey = norm(url.searchParams.get("lineKey"));

  let groupKey = "";

  if (lineKey) {
    const resolved = await resolveGroupKeyForAnchor({ recordingId, lineKey });
    groupKey = resolved.groupKey;

    if (rawGroupKey && norm(rawGroupKey) !== groupKey) {
      return jsonErr(correlationId, 409, {
        ok: false,
        error: "Group key changed. Refresh and try again.",
      });
    }
  } else {
    if (!rawGroupKey) {
      return jsonErr(correlationId, 400, {
        ok: false,
        error: "Missing lineKey (or groupKey).",
      });
    }

    const g = norm(rawGroupKey);

    if (isGroupKeyV1(g)) {
      groupKey = g;
    } else {
      const ok = await isKnownCanonicalGroupKey({ recordingId, groupKey: g });
      if (!ok) {
        return jsonErr(correlationId, 400, {
          ok: false,
          error: "Unknown groupKey.",
        });
      }
      groupKey = g;
    }
  }

  if (!groupKey) {
    return jsonErr(correlationId, 400, {
      ok: false,
      error: "Invalid group key.",
    });
  }

  const bootstrapRes = jsonOk({ ok: true }, { correlationId });
  const ensured = ensureAnonId(req, bootstrapRes);
  const { anonId } = ensured;

  const viewer = await getViewer(req, anonId);

  const viewerMemberId =
    viewer.kind === "member" && isUuid(viewer.memberId)
      ? viewer.memberId
      : null;

  if (viewerMemberId) {
    const label = stableAnonLabel(viewerMemberId);
    await sql`
      insert into exegesis_identity (member_id, anon_label)
      values (${viewerMemberId}::uuid, ${label})
      on conflict (member_id) do nothing
    `;
  }

  if (viewer.kind === "anon") {
    const LIMIT = 8;
    const sessionId = anonId;

    await sql`
      insert into anon_exegesis_sessions (id, anon_id)
      values (${sessionId}, ${anonId})
      on conflict (id) do nothing
    `;

    const gateRes = await sql<{
      already: boolean;
      allowed: boolean;
      n_before: number;
      n_after: number;
    }>`
      with
      already as (
        select exists(
          select 1
          from anon_exegesis_thread_opens
          where session_id = ${sessionId}
            and track_id = ${recordingId}
            and group_key = ${groupKey}
        ) as already
      ),
      cnt_before as (
        select count(*)::int as n_before
        from anon_exegesis_thread_opens
        where session_id = ${sessionId}
      ),
      attempt as (
        insert into anon_exegesis_thread_opens (session_id, track_id, group_key)
        select ${sessionId}, ${recordingId}, ${groupKey}
        where (select already from already) = false
          and (select n_before from cnt_before) < ${LIMIT}
        on conflict (session_id, track_id, group_key) do nothing
        returning 1
      ),
      cnt_after as (
        select count(*)::int as n_after
        from anon_exegesis_thread_opens
        where session_id = ${sessionId}
      )
      select
        (select already from already) as already,
        ((select already from already) = true or exists(select 1 from attempt)) as allowed,
        (select n_before from cnt_before) as n_before,
        (select n_after from cnt_after) as n_after
    `;

    const row = gateRes.rows?.[0];
    const allowed = Boolean(row?.allowed);

    if (!allowed) {
      const message = "Sign in to keep reading.";

      return gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "EXEGESIS_THREAD_READ_CAP_REACHED",
        action: "login",
        message,
        onResponse: (res) => {
          for (const [k, v] of bootstrapRes.headers.entries()) {
            if (k.toLowerCase() === "set-cookie") res.headers.append(k, v);
          }
        },
      });
    }
  }

  const metaRes = await sql<DbThreadMetaRow>`
    select track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, created_at, updated_at
    from exegesis_thread_meta
    where track_id = ${recordingId}
      and group_key = ${groupKey}
    limit 1
  `;
  const metaRow = metaRes.rows?.[0] ?? null;

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
      where c.track_id = ${recordingId}
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
  const byRoot = new Map<string, CommentDTO[]>();
  const authorIds = new Set<string>();

  for (const r of rows) {
    authorIds.add(r.created_by_member_id);

    const dto: CommentDTO = {
      id: r.id,
      recordingId: r.track_id,
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

  const identities: Record<string, IdentityDTO> = {};
  const wantIds = new Set<string>();

  for (const id of Array.from(authorIds)) {
    const s = (id ?? "").trim();
    if (isUuid(s)) wantIds.add(s);
  }
  if (viewer.kind === "member") {
    const me = (viewer.memberId ?? "").trim();
    if (isUuid(me)) wantIds.add(me);
  }

  const uuids = Array.from(wantIds);

  if (uuids.length > 0) {
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

  const roots = Array.from(byRoot.entries()).map(([rootId, comments]) => ({
    rootId,
    comments,
  }));

  const meta: ThreadMetaDTO | null = metaRow
    ? {
        recordingId: metaRow.track_id,
        groupKey: metaRow.group_key,
        pinnedCommentId: metaRow.pinned_comment_id,
        locked: metaRow.locked,
        commentCount: metaRow.comment_count,
        lastActivityAt: metaRow.last_activity_at,
        createdAt: metaRow.created_at,
        updatedAt: metaRow.updated_at,
      }
    : null;

  let viewerDto: ViewerDTO;

  if (!viewerMemberId) {
    viewerDto = { kind: "anon" };
  } else {
    const cap0 = await capsForMember(viewerMemberId);
    const locked = Boolean(metaRow?.locked);
    const me = identities[viewerMemberId];
    const canClaimName =
      !!me && !me.publicName && me.publicNameUnlockedAt != null;

    viewerDto = {
      kind: "member",
      memberId: viewerMemberId,
      cap: {
        ...cap0,
        canPost: locked ? false : cap0.canPost,
        canClaimName,
      },
    };
  }

  const okRes = jsonOk<ApiOk>(
    {
      ok: true,
      recordingId,
      groupKey,
      sort,
      meta,
      roots,
      identities,
      viewer: viewerDto,
    },
    { correlationId },
  );

  for (const [k, v] of bootstrapRes.headers.entries()) {
    if (k.toLowerCase() === "set-cookie") okRes.headers.append(k, v);
  }

  return okRes;
}
