// web/app/api/exegesis/thread/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { ensureAnonId } from "@/lib/anon";
import {
  buildExegesisIdentityDtoMap,
  ensureMemberIdentity,
} from "@/lib/memberIdentityServer";
import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";
import {
  resolveGroupKeyForAnchor,
  isGroupKeyV1,
  isKnownCanonicalGroupKey,
} from "@/lib/exegesis/resolveGroupKey";
import type { GatePayload } from "@/app/home/gating/gateTypes";
import type { IdentityDTO } from "@/lib/exegesisIdentityDto";
import {
  correlationIdFromRequest,
  gateError,
  jsonOk,
  withCorrelationId,
} from "@/app/api/_gate";
import {
  persistExegesisEmbargoReadIdentity,
  resolveExegesisEmbargoReadAccess,
} from "@/app/api/exegesis/_embargoReadAccess";

export const runtime = "nodejs";

type ThreadSort = "top" | "recent";

type Viewer =
  | { kind: "anon"; anonId: string }
  | { kind: "member"; memberId: string };

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

type ThreadRequest = {
  recordingId: string;
  sort: ThreadSort;
  rawGroupKey: string;
  lineKey: string;
};

type ThreadRequestResult =
  | { ok: true; value: ThreadRequest }
  | { ok: false; response: NextResponse };

type GroupKeyResult =
  | { ok: true; groupKey: string }
  | { ok: false; response: NextResponse };

function readThreadRequest(
  req: NextRequest,
  correlationId: string,
): ThreadRequestResult {
  const url = new URL(req.url);
  const recordingId = norm(url.searchParams.get("recordingId"));
  const sortParam = norm(url.searchParams.get("sort")) || "top";
  const sort: ThreadSort = isSort(sortParam) ? sortParam : "top";

  if (!recordingId) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Missing recordingId.",
      }),
    };
  }

  if (recordingId.length > 200) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Invalid recordingId.",
      }),
    };
  }

  return {
    ok: true,
    value: {
      recordingId,
      sort,
      rawGroupKey: norm(url.searchParams.get("groupKey")),
      lineKey: norm(url.searchParams.get("lineKey")),
    },
  };
}

async function resolveThreadGroupKey(
  request: ThreadRequest,
  correlationId: string,
): Promise<GroupKeyResult> {
  const { recordingId, rawGroupKey, lineKey } = request;

  if (lineKey) {
    const resolved = await resolveGroupKeyForAnchor({ recordingId, lineKey });
    const groupKey = resolved.groupKey;

    if (rawGroupKey && norm(rawGroupKey) !== groupKey) {
      return {
        ok: false,
        response: jsonErr(correlationId, 409, {
          ok: false,
          error: "Group key changed. Refresh and try again.",
        }),
      };
    }

    if (!groupKey) {
      return {
        ok: false,
        response: jsonErr(correlationId, 400, {
          ok: false,
          error: "Invalid group key.",
        }),
      };
    }

    return { ok: true, groupKey };
  }

  if (!rawGroupKey) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Missing lineKey (or groupKey).",
      }),
    };
  }

  const groupKey = norm(rawGroupKey);
  if (isGroupKeyV1(groupKey)) {
    return { ok: true, groupKey };
  }

  const known = await isKnownCanonicalGroupKey({ recordingId, groupKey });
  if (!known) {
    return {
      ok: false,
      response: jsonErr(correlationId, 400, {
        ok: false,
        error: "Unknown groupKey.",
      }),
    };
  }

  return { ok: true, groupKey };
}

function copySetCookieHeaders(from: Response, to: NextResponse): void {
  for (const [key, value] of from.headers.entries()) {
    if (key.toLowerCase() === "set-cookie") {
      to.headers.append(key, value);
    }
  }
}

async function enforceAnonThreadReadCap(params: {
  req: NextRequest;
  correlationId: string;
  bootstrapRes: NextResponse;
  anonId: string;
  recordingId: string;
  groupKey: string;
}): Promise<NextResponse | null> {
  const {
    req,
    correlationId,
    bootstrapRes,
    anonId,
    recordingId,
    groupKey,
  } = params;
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
  if (row?.allowed) return null;

  const message = "Sign in to keep reading.";

  return gateError(req, {
    correlationId,
    status: 403,
    domain: "exegesis",
    code: "EXEGESIS_THREAD_READ_CAP_REACHED",
    action: "login",
    message,
    onResponse: (res) => copySetCookieHeaders(bootstrapRes, res),
  });
}

async function loadThreadMeta(
  recordingId: string,
  groupKey: string,
): Promise<DbThreadMetaRow | null> {
  const metaRes = await sql<DbThreadMetaRow>`
    select track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, created_at, updated_at
    from exegesis_thread_meta
    where track_id = ${recordingId}
      and group_key = ${groupKey}
    limit 1
  `;

  return metaRes.rows?.[0] ?? null;
}

async function loadThreadComments(params: {
  recordingId: string;
  groupKey: string;
  viewerMemberId: string | null;
  sort: ThreadSort;
}): Promise<DbCommentRow[]> {
  const { recordingId, groupKey, viewerMemberId, sort } = params;

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

  return commentsRes.rows ?? [];
}

function commentDtoFromRow(row: DbCommentRow): CommentDTO {
  return {
    id: row.id,
    recordingId: row.track_id,
    groupKey: row.group_key,
    lineKey: row.line_key,
    parentId: row.parent_id,
    rootId: row.root_id,
    depth: row.depth,
    bodyRich: row.body_rich,
    bodyPlain: row.body_plain,
    tMs: row.t_ms,
    lineTextSnapshot: row.line_text_snapshot,
    lyricsVersion: row.lyrics_version,
    createdByMemberId: row.created_by_member_id,
    status: row.status,
    createdAt: row.created_at,
    editedAt: row.edited_at,
    editCount: row.edit_count,
    voteCount: row.vote_count,
    viewerHasVoted: row.viewer_has_voted,
  };
}

function buildThreadRoots(rows: DbCommentRow[]): {
  roots: ApiOk["roots"];
  authorIds: Set<string>;
} {
  const byRoot = new Map<string, CommentDTO[]>();
  const authorIds = new Set<string>();

  for (const row of rows) {
    authorIds.add(row.created_by_member_id);

    const dto = commentDtoFromRow(row);
    const comments = byRoot.get(dto.rootId) ?? [];
    comments.push(dto);
    byRoot.set(dto.rootId, comments);
  }

  const roots = Array.from(byRoot.entries()).map(([rootId, comments]) => ({
    rootId,
    comments,
  }));

  return { roots, authorIds };
}

function collectIdentityIds(
  authorIds: Set<string>,
  viewer: Viewer,
): string[] {
  const wantIds = new Set<string>();

  for (const id of authorIds) {
    const normalized = (id ?? "").trim();
    if (isUuid(normalized)) {
      wantIds.add(normalized);
    }
  }

  if (viewer.kind === "member") {
    const memberId = (viewer.memberId ?? "").trim();
    if (isUuid(memberId)) {
      wantIds.add(memberId);
    }
  }

  return Array.from(wantIds);
}

async function loadThreadIdentities(
  authorIds: Set<string>,
  viewer: Viewer,
): Promise<Record<string, IdentityDTO>> {
  const identities: Record<string, IdentityDTO> = {};
  const memberIds = collectIdentityIds(authorIds, viewer);

  if (memberIds.length === 0) return identities;

  const built = await buildExegesisIdentityDtoMap(memberIds);
  for (const [memberId, identity] of Object.entries(built)) {
    identities[memberId] = identity;
  }

  return identities;
}

function threadMetaDtoFromRow(
  row: DbThreadMetaRow | null,
): ThreadMetaDTO | null {
  if (!row) return null;

  return {
    recordingId: row.track_id,
    groupKey: row.group_key,
    pinnedCommentId: row.pinned_comment_id,
    locked: row.locked,
    commentCount: row.comment_count,
    lastActivityAt: row.last_activity_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function buildViewerDto(params: {
  viewerMemberId: string | null;
  metaRow: DbThreadMetaRow | null;
  identities: Record<string, IdentityDTO>;
}): Promise<ViewerDTO> {
  const { viewerMemberId, metaRow, identities } = params;

  if (!viewerMemberId) return { kind: "anon" };

  const cap0 = await capsForMember(viewerMemberId);
  const locked = Boolean(metaRow?.locked);
  const identity = identities[viewerMemberId];
  const canClaimName =
    identity != null &&
    !identity.publicName &&
    identity.publicNameUnlockedAt != null;

  return {
    kind: "member",
    memberId: viewerMemberId,
    cap: {
      ...cap0,
      canPost: locked ? false : cap0.canPost,
      canClaimName,
    },
  };
}

export async function GET(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);
  const request = readThreadRequest(req, correlationId);
  if (!request.ok) return request.response;

  const { recordingId, sort } = request.value;
  const embargoAccess = await resolveExegesisEmbargoReadAccess({
    req,
    recordingId,
    correlationId,
  });
  if (!embargoAccess.ok) return embargoAccess.response;

  const groupKeyResult = await resolveThreadGroupKey(
    request.value,
    correlationId,
  );
  if (!groupKeyResult.ok) return groupKeyResult.response;

  const { groupKey } = groupKeyResult;

  const bootstrapRes = jsonOk({ ok: true }, { correlationId });
  persistExegesisEmbargoReadIdentity(bootstrapRes, embargoAccess);

  const embargoContext = embargoAccess.embargoed
    ? embargoAccess.context
    : null;
  const anonId =
    embargoContext?.anonId ?? ensureAnonId(req, bootstrapRes).anonId;
  const viewer: Viewer = embargoContext
    ? embargoContext.memberId
      ? { kind: "member", memberId: embargoContext.memberId }
      : { kind: "anon", anonId }
    : await getViewer(req, anonId);
  const viewerMemberId =
    viewer.kind === "member" && isUuid(viewer.memberId)
      ? viewer.memberId
      : null;

  if (viewerMemberId) {
    await ensureMemberIdentity(viewerMemberId);
  }

  if (viewer.kind === "anon") {
    const gateResponse = await enforceAnonThreadReadCap({
      req,
      correlationId,
      bootstrapRes,
      anonId,
      recordingId,
      groupKey,
    });

    if (gateResponse) return gateResponse;
  }

  const metaRow = await loadThreadMeta(recordingId, groupKey);
  const rows = await loadThreadComments({
    recordingId,
    groupKey,
    viewerMemberId,
    sort,
  });
  const { roots, authorIds } = buildThreadRoots(rows);
  const identities = await loadThreadIdentities(authorIds, viewer);
  const meta = threadMetaDtoFromRow(metaRow);
  const viewerDto = await buildViewerDto({
    viewerMemberId,
    metaRow,
    identities,
  });

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

  copySetCookieHeaders(bootstrapRes, okRes);
  return okRes;
}
