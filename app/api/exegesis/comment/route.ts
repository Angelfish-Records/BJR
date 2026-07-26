// web/app/api/exegesis/comment/route.ts
import "server-only";
import crypto from "crypto";
import type { NextRequest, NextResponse } from "next/server";
import { sql } from "@vercel/postgres";

import type { IdentityDTO } from "@/lib/exegesisIdentityDto";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ensureMemberIdentity } from "@/lib/memberIdentityServer";
import { ENTITLEMENTS } from "@/lib/vocab";
import {
  runAutoBadgeAwardsForMember,
  type NewlyAwardedBadge,
} from "@/lib/badgeAutoAward";
import { markOverlayAnnouncedForAwardedBadges } from "@/lib/badgeAwardAnnouncementServer";

import { resolveGroupKeyForAnchor } from "@/lib/exegesis/resolveGroupKey";
import { validateAndSanitizeTipTapDoc } from "@/lib/exegesis/richText";
import { correlationIdFromRequest, gateError, jsonOk } from "@/app/api/_gate";
import {
  bodyRecord,
  isUuid,
  jsonExegesisErr,
  normString,
  requireExegesisMemberId,
  type ExegesisApiErr,
} from "@/lib/exegesis/apiRouteHelpers";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  recordingId: string;
  groupKey: string;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
  identities: Record<string, IdentityDTO>;
  newlyAwardedBadges: NewlyAwardedBadge[];
};

type ApiErr = ExegesisApiErr;

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

type CommentContent = {
  bodyPlain: string;
  bodyRichJson: string;
};

type CommentCommandDraft = CommentContent & {
  recordingId: string;
  lineKey: string;
  groupKeyClient: string;
  parentId: string | null;
  lineTextSnapshot: string;
  lyricsVersion: string | null;
  tMs: number | null;
};

type CommentCommand = Omit<CommentCommandDraft, "groupKeyClient"> & {
  groupKey: string;
};

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

type PostingIdentity = Awaited<ReturnType<typeof ensureMemberIdentity>>;

type PostingAuthorityResult =
  | { ok: true; memberId: string; identity: PostingIdentity }
  | { ok: false; response: NextResponse };

type CommentInsertRow = {
  inserted_count: number;
  guard_err: string | null;
  id: string | null;
  track_id: string | null;
  group_key: string | null;
  line_key: string | null;
  parent_id: string | null;
  root_id: string | null;
  depth: number | null;
  body_rich: unknown | null;
  body_plain: string | null;
  t_ms: number | null;
  line_text_snapshot: string | null;
  lyrics_version: string | null;
  created_by_member_id: string | null;
  status: "live" | "hidden" | "deleted" | null;
  created_at: string | null;
  edited_at: string | null;
  edit_count: number | null;
  vote_count: number | null;
  meta_track_id: string;
  meta_group_key: string;
  meta_pinned_comment_id: string | null;
  meta_locked: boolean;
  meta_comment_count: number;
  meta_last_activity_at: string;
  meta_created_at: string;
  meta_updated_at: string;
  ident_member_id: string;
  ident_public_name_unlocked_at: string | null;
  ident_contribution_count: number;
};

type InsertedCommentRow = CommentInsertRow & {
  inserted_count: 1;
  id: string;
  track_id: string;
  group_key: string;
  line_key: string;
  root_id: string;
  depth: number;
  body_plain: string;
  line_text_snapshot: string;
  created_by_member_id: string;
  status: "live" | "hidden" | "deleted";
  created_at: string;
  edit_count: number;
  vote_count: number;
};

type InsertResolution =
  | { ok: true; row: InsertedCommentRow }
  | { ok: false; response: NextResponse };

const EMPTY_BODY_RICH_JSON = JSON.stringify({
  type: "doc",
  content: [{ type: "paragraph" }],
});

function jsonErr(correlationId: string, status: number, body: ApiErr) {
  return jsonExegesisErr(correlationId, status, body);
}

function validationError(status: number, error: string): ValidationResult<never> {
  return { ok: false, status, error };
}

function clampInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function normNullableId(v: unknown): string | null {
  const value = normString(v);
  if (!value || value === "null" || value === "undefined") return null;
  return value;
}

async function requireCanPost(memberId: string): Promise<boolean> {
  return await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
}

function parseCommentContent(
  body: Record<string, unknown>,
): ValidationResult<CommentContent> {
  const legacyBodyPlain = normString(body.bodyPlain);
  const bodyRichInput = "bodyRich" in body ? (body.bodyRich ?? null) : null;

  if (bodyRichInput === null || typeof bodyRichInput === "undefined") {
    if (!legacyBodyPlain) return validationError(400, "Missing bodyPlain.");
    if (legacyBodyPlain.length > 5000) {
      return validationError(400, "bodyPlain too long.");
    }

    return {
      ok: true,
      value: {
        bodyPlain: legacyBodyPlain,
        bodyRichJson: EMPTY_BODY_RICH_JSON,
      },
    };
  }

  const validated = validateAndSanitizeTipTapDoc(bodyRichInput);
  if (!validated.ok) return validationError(400, validated.error);

  let bodyRichJson = "";
  try {
    bodyRichJson = JSON.stringify(validated.doc);
  } catch {
    return validationError(400, "Invalid bodyRich.");
  }

  if (bodyRichJson.length > 200_000) {
    return validationError(400, "bodyRich too large.");
  }

  return {
    ok: true,
    value: {
      bodyPlain: validated.plain,
      bodyRichJson,
    },
  };
}

function parseCommentCommandDraft(
  raw: unknown,
): ValidationResult<CommentCommandDraft> {
  const body = bodyRecord(raw);
  if (!body) return validationError(400, "Invalid JSON body.");

  const content = parseCommentContent(body);
  if (!content.ok) return content;

  const recordingId = normString(body.recordingId);
  if (!recordingId) return validationError(400, "Missing recordingId.");

  const lineKey = normString(body.lineKey);
  if (!lineKey) return validationError(400, "Missing lineKey.");

  return {
    ok: true,
    value: {
      ...content.value,
      recordingId,
      lineKey,
      groupKeyClient: normString(body.groupKey),
      parentId: normNullableId(body.parentId),
      lineTextSnapshot: normString(body.lineTextSnapshot),
      lyricsVersion: normString(body.lyricsVersion) || null,
      tMs: clampInt(body.tMs, 0, 60 * 60 * 1000),
    },
  };
}

async function resolveCommentCommand(
  draft: CommentCommandDraft,
): Promise<ValidationResult<CommentCommand>> {
  const resolved = await resolveGroupKeyForAnchor({
    recordingId: draft.recordingId,
    lineKey: draft.lineKey,
  });
  const groupKey = resolved.groupKey;

  if (!groupKey) return validationError(400, "Could not resolve groupKey.");

  if (draft.groupKeyClient && draft.groupKeyClient !== groupKey) {
    return validationError(409, "Group key changed. Refresh and try again.");
  }

  if (!draft.bodyPlain) return validationError(400, "Missing bodyPlain.");
  if (draft.bodyPlain.length > 5000) {
    return validationError(400, "bodyPlain too long.");
  }
  if (!draft.lineTextSnapshot) {
    return validationError(400, "Missing lineTextSnapshot.");
  }
  if (draft.lineTextSnapshot.length > 2000) {
    return validationError(400, "lineTextSnapshot too long.");
  }
  if (draft.parentId && !isUuid(draft.parentId)) {
    return validationError(400, "Invalid parentId.");
  }

  return {
    ok: true,
    value: {
      recordingId: draft.recordingId,
      lineKey: draft.lineKey,
      groupKey,
      parentId: draft.parentId,
      bodyRichJson: draft.bodyRichJson,
      bodyPlain: draft.bodyPlain,
      lineTextSnapshot: draft.lineTextSnapshot,
      lyricsVersion: draft.lyricsVersion,
      tMs: draft.tMs,
    },
  };
}

async function readCommentCommand(
  req: NextRequest,
): Promise<ValidationResult<CommentCommand>> {
  let raw: unknown;

  try {
    raw = await req.json();
  } catch {
    return validationError(400, "Invalid JSON body.");
  }

  const draft = parseCommentCommandDraft(raw);
  if (!draft.ok) return draft;

  return resolveCommentCommand(draft.value);
}

async function resolvePostingAuthority(
  req: NextRequest,
  correlationId: string,
): Promise<PostingAuthorityResult> {
  const memberId = await requireExegesisMemberId();

  if (!memberId) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 401,
        domain: "exegesis",
        code: "AUTH_REQUIRED",
        action: "login",
        message: "Sign in to post a comment.",
      }),
    };
  }

  if (!isUuid(memberId)) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "PROVISIONING",
        action: "wait",
        message: "Still setting things up. Try again shortly.",
      }),
    };
  }

  const canPost = await requireCanPost(memberId);
  if (!canPost) {
    return {
      ok: false,
      response: gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "TIER_REQUIRED",
        action: "subscribe",
        message: "Posting requires Patron or Partner.",
      }),
    };
  }

  const canonicalIdentity = await ensureMemberIdentity(memberId);

  return {
    ok: true,
    memberId,
    identity: canonicalIdentity,
  };
}

async function insertComment(params: {
  command: CommentCommand;
  memberId: string;
  anonLabel: string;
}): Promise<CommentInsertRow | null> {
  const { command, memberId, anonLabel } = params;
  const {
    recordingId,
    groupKey,
    lineKey,
    parentId,
    bodyRichJson,
    bodyPlain,
    tMs,
    lineTextSnapshot,
    lyricsVersion,
  } = command;

  const rootIdForRootComment = crypto.randomUUID();
  const commentIdForReply = crypto.randomUUID();
  const parentUuid = parentId;

  const result = await sql<CommentInsertRow>`
      with
params as (
  select
    ${recordingId}::text          as track_id,
    ${groupKey}::text             as group_key,
    ${lineKey}::text              as line_key,
    nullif(${parentUuid}::text, '')::uuid as parent_id,
      ${memberId}::uuid             as member_id,
    ${canonicalIdentity.anonLabel}::text as anon_label,
    ${bodyRichJson}::jsonb        as body_rich,
    ${bodyPlain}::text            as body_plain,
    ${tMsOrNull}::int             as t_ms,
    ${lineTextSnapshot}::text     as line_text_snapshot,
    ${lyricsVersion}::text        as lyrics_version,
    ${rootIdForRootComment}::uuid as root_id_for_root,
    ${commentIdForReply}::uuid    as id_for_reply
),
meta_base as (
  insert into exegesis_thread_meta (track_id, group_key)
  select p.track_id, p.group_key
  from params p
  on conflict (track_id, group_key) do nothing
  returning track_id, group_key, pinned_comment_id, locked,
            comment_count, last_activity_at, created_at, updated_at
),
meta_existing as (
  select m.track_id, m.group_key, m.pinned_comment_id, m.locked,
         m.comment_count, m.last_activity_at, m.created_at, m.updated_at
  from exegesis_thread_meta m
  join params p
    on p.track_id = m.track_id and p.group_key = m.group_key
  limit 1
),
meta_pre as (
  select * from meta_base
  union all
  select * from meta_existing
  where not exists (select 1 from meta_base)
),
ident_base as (
  insert into exegesis_identity (member_id, anon_label)
  select p.member_id, p.anon_label
  from params p
  on conflict (member_id) do nothing
  returning member_id, public_name_unlocked_at, contribution_count
),
ident_existing as (
  select i.member_id, i.public_name_unlocked_at, i.contribution_count
  from exegesis_identity i
  join params p on p.member_id = i.member_id
  limit 1
),
ident_pre as (
  select * from ident_base
  union all
  select * from ident_existing
  where not exists (select 1 from ident_base)
),
parent_row as (
  select c.id, c.track_id, c.group_key, c.root_id, c.depth
  from exegesis_comment c
  join params p on c.id = p.parent_id
  limit 1
),
parent_facts as (
  select
    p.parent_id is not null                          as has_parent,
    (select id from parent_row)                      as parent_id_found,
    (select track_id from parent_row)                as parent_track_id,
    (select group_key from parent_row)               as parent_group_key,
    (select root_id from parent_row)                 as parent_root_id,
    (select depth from parent_row)                   as parent_depth
  from params p
),
guard_row as (
  select
    case
      when (select track_id from meta_pre) is null then 'META_MISSING'
      when (select member_id from ident_pre) is null then 'IDENT_MISSING'
      when (select locked from meta_pre) then 'LOCKED'
      when (select has_parent from parent_facts)
           and (select parent_id_found from parent_facts) is null then 'PARENT_NOT_FOUND'
      when (select has_parent from parent_facts)
           and (select parent_track_id from parent_facts) <> (select track_id from params) then 'PARENT_SCOPE'
      when (select has_parent from parent_facts)
           and (select parent_group_key from parent_facts) <> (select group_key from params) then 'PARENT_SCOPE'
      when (select has_parent from parent_facts)
           and ((select parent_depth from parent_facts) + 1) > 6 then 'DEPTH'
      else null
    end as err
),
resolved as (
  select
    case
      when (select parent_id from params) is null then (select root_id_for_root from params)
      else (select parent_root_id from parent_facts)
    end as root_id,
    case
      when (select parent_id from params) is null then 0::int
      else ((select parent_depth from parent_facts) + 1)::int
    end as depth,
    case
      when (select parent_id from params) is null then (select root_id_for_root from params)
      else (select id_for_reply from params)
    end as id
),
inserted as (
  insert into exegesis_comment (
    id, track_id, group_key, line_key, parent_id, root_id, depth,
    body_rich, body_plain, t_ms, line_text_snapshot, lyrics_version,
    created_by_member_id, status
  )
  select
    r.id,
    p.track_id,
    p.group_key,
    p.line_key,
    p.parent_id,
    r.root_id,
    r.depth,
    p.body_rich,
    p.body_plain,
    p.t_ms,
    p.line_text_snapshot,
    p.lyrics_version,
    p.member_id,
    'live'
  from params p
  cross join resolved r
  cross join guard_row g
  where g.err is null
  returning
    id, track_id, group_key, line_key, parent_id, root_id, depth,
    body_rich, body_plain, t_ms, line_text_snapshot, lyrics_version,
    created_by_member_id, status::text as status,
    created_at, edited_at, edit_count, vote_count
),
meta_upd as (
  update exegesis_thread_meta m
  set
    comment_count = m.comment_count + 1,
    last_activity_at = now(),
    updated_at = now()
  from params p
  where m.track_id = p.track_id
    and m.group_key = p.group_key
    and exists (select 1 from inserted)
  returning m.track_id, m.group_key, m.pinned_comment_id, m.locked,
            m.comment_count, m.last_activity_at, m.created_at, m.updated_at
),
ident_upd as (
  update exegesis_identity i
  set
    contribution_count = i.contribution_count + 1,
    public_name_unlocked_at = case
      when i.public_name_unlocked_at is null and (i.contribution_count + 1) >= 5 then now()
      else i.public_name_unlocked_at
    end,
    updated_at = now()
  from params p
  where i.member_id = p.member_id
    and exists (select 1 from inserted)
  returning i.member_id, i.public_name_unlocked_at, i.contribution_count
),
meta_out as (
  select * from meta_upd
  union all
  select * from meta_pre
  where not exists (select 1 from meta_upd)
),
ident_out as (
  select * from ident_upd
  union all
  select * from ident_pre
  where not exists (select 1 from ident_upd)
),
stats as (
  select
    (select err from guard_row) as guard_err,
    (select count(*)::int from inserted) as inserted_count
)
select
  s.inserted_count,
  s.guard_err,
  i.id,
  i.track_id,
  i.group_key,
  i.line_key,
  i.parent_id,
  i.root_id,
  i.depth,
  i.body_rich,
  i.body_plain,
  i.t_ms,
  i.line_text_snapshot,
  i.lyrics_version,
  i.created_by_member_id,
  i.status,
  i.created_at,
  i.edited_at,
  i.edit_count,
  i.vote_count,
  m.track_id as meta_track_id,
  m.group_key as meta_group_key,
  m.pinned_comment_id as meta_pinned_comment_id,
  m.locked as meta_locked,
  m.comment_count as meta_comment_count,
  m.last_activity_at as meta_last_activity_at,
  m.created_at as meta_created_at,
  m.updated_at as meta_updated_at,
   u.member_id as ident_member_id,
  u.public_name_unlocked_at as ident_public_name_unlocked_at,
  u.contribution_count as ident_contribution_count
from stats s
join meta_out m on true
join ident_out u on true
left join inserted i on true
limit 1
  `;

  return result.rows?.[0] ?? null;
}

function guardFailureResponse(
  req: NextRequest,
  correlationId: string,
  guardError: string | null,
): NextResponse {
  switch (guardError) {
    case "LOCKED":
      return gateError(req, {
        correlationId,
        status: 403,
        domain: "exegesis",
        code: "INVALID_REQUEST",
        action: "wait",
        message: "This thread is locked.",
      });
    case "PARENT_NOT_FOUND":
      return jsonErr(correlationId, 404, {
        ok: false,
        error: "Parent not found.",
      });
    case "PARENT_SCOPE":
      return jsonErr(correlationId, 400, {
        ok: false,
        error: "Parent scope mismatch.",
      });
    case "DEPTH":
      return jsonErr(correlationId, 400, {
        ok: false,
        error: "Thread depth limit reached.",
      });
    case "META_MISSING":
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "Thread meta missing.",
      });
    case "IDENT_MISSING":
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "Identity missing.",
      });
    default:
      return jsonErr(correlationId, 500, {
        ok: false,
        error: "Insert suppressed unexpectedly.",
      });
  }
}

function assertInsertedRow(
  row: CommentInsertRow,
): asserts row is InsertedCommentRow {
  if (row.inserted_count !== 1) {
    throw new Error("assertInsertedRow: inserted_count != 1");
  }

  if (
    !row.id ||
    !row.track_id ||
    !row.group_key ||
    !row.line_key ||
    !row.root_id ||
    typeof row.depth !== "number" ||
    row.body_plain === null ||
    row.line_text_snapshot === null ||
    !row.created_by_member_id ||
    !row.status ||
    !row.created_at ||
    typeof row.edit_count !== "number" ||
    typeof row.vote_count !== "number"
  ) {
    throw new Error("assertInsertedRow: missing required comment fields");
  }
}

function resolveInsertResult(
  req: NextRequest,
  correlationId: string,
  row: CommentInsertRow | null,
): InsertResolution {
  if (!row) {
    return {
      ok: false,
      response: jsonErr(correlationId, 500, {
        ok: false,
        error: "No response row.",
      }),
    };
  }

  if ((row.inserted_count ?? 0) === 0) {
    return {
      ok: false,
      response: guardFailureResponse(req, correlationId, row.guard_err),
    };
  }

  if (
    !row.id ||
    !row.track_id ||
    !row.group_key ||
    !row.line_key ||
    !row.root_id
  ) {
    return {
      ok: false,
      response: jsonErr(correlationId, 500, {
        ok: false,
        error: "Insert returned incomplete row.",
      }),
    };
  }

  assertInsertedRow(row);
  return { ok: true, row };
}

function buildCommentDto(row: InsertedCommentRow): CommentDTO {
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
    viewerHasVoted: false,
  };
}

function buildThreadMetaDto(row: InsertedCommentRow): ThreadMetaDTO {
  return {
    recordingId: row.meta_track_id,
    groupKey: row.meta_group_key,
    pinnedCommentId: row.meta_pinned_comment_id,
    locked: row.meta_locked,
    commentCount: row.meta_comment_count,
    lastActivityAt: row.meta_last_activity_at,
    createdAt: row.meta_created_at,
    updatedAt: row.meta_updated_at,
  };
}

function buildIdentityMap(
  row: InsertedCommentRow,
  identity: PostingIdentity,
): Record<string, IdentityDTO> {
  return {
    [row.ident_member_id]: {
      memberId: identity.memberId,
      anonLabel: identity.anonLabel,
      publicName: identity.publicName,
      publicNameUnlockedAt: row.ident_public_name_unlocked_at,
      contributionCount: row.ident_contribution_count,
      isAdmin: identity.isAdmin,
    },
  };
}

async function runPostCommitBadgeEffects(params: {
  memberId: string;
  recordingId: string;
  publicNameUnlockedAt: string | null;
  correlationId: string;
}): Promise<NewlyAwardedBadge[]> {
  let badges: NewlyAwardedBadge[];

  try {
    badges = await runAutoBadgeAwardsForMember({
      memberId: params.memberId,
      trigger:
        params.publicNameUnlockedAt !== null
          ? "public_name_unlocked"
          : "exegesis_contribution_created",
      recordingId: params.recordingId,
      grantedBy: "system",
      correlationId: params.correlationId,
    });
  } catch (error: unknown) {
    console.error("[exegesis/comment] post-commit badge award failed", error);
    return [];
  }

  if (badges.length === 0) return badges;

  try {
    await markOverlayAnnouncedForAwardedBadges({
      memberId: params.memberId,
      badges,
    });
  } catch (error: unknown) {
    console.error(
      "[exegesis/comment] post-commit badge announcement failed",
      error,
    );
  }

  return badges;
}

function describeUnexpectedError(error: unknown): string {
  const details =
    typeof error === "object" && error !== null
      ? (error as {
          code?: string;
          message?: string;
          detail?: string;
          hint?: string;
        })
      : null;

  let message = "";
  if (typeof details?.message === "string" && details.message.trim()) {
    message = details.message.trim();
  } else if (error instanceof Error && error.message.trim()) {
    message = error.message.trim();
  }

  const extras = [details?.code, details?.detail, details?.hint].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );

  return `${message || "Unknown error."}${
    extras.length > 0 ? ` (${extras.join(" · ")})` : ""
  }`;
}

export async function POST(req: NextRequest) {
  const correlationId = correlationIdFromRequest(req);

  const command = await readCommentCommand(req);
  if (!command.ok) {
    return jsonErr(correlationId, command.status, {
      ok: false,
      error: command.error,
    });
  }

  const authority = await resolvePostingAuthority(req, correlationId);
  if (!authority.ok) return authority.response;

  try {
    const insertRow = await insertComment({
      command: command.value,
      memberId: authority.memberId,
      anonLabel: authority.identity.anonLabel,
    });

    const insert = resolveInsertResult(req, correlationId, insertRow);
    if (!insert.ok) return insert.response;

    const { row } = insert;
    const identities = buildIdentityMap(row, authority.identity);
    const newlyAwardedBadges = await runPostCommitBadgeEffects({
      memberId: authority.memberId,
      recordingId: command.value.recordingId,
      publicNameUnlockedAt: row.ident_public_name_unlocked_at,
      correlationId,
    });

    return jsonOk<ApiOk>(
      {
        ok: true,
        recordingId: command.value.recordingId,
        groupKey: command.value.groupKey,
        comment: buildCommentDto(row),
        meta: buildThreadMetaDto(row),
        identities,
        newlyAwardedBadges,
      },
      { correlationId },
    );
  } catch (error: unknown) {
    console.error("[exegesis/comment] POST failed", error);

    return jsonErr(correlationId, 500, {
      ok: false,
      error: describeUnexpectedError(error),
    });
  }
}
