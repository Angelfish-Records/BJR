// web/app/api/exegesis/comment/route.ts
import "server-only";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";

import { resolveGroupKeyForAnchor } from "@/lib/exegesis/resolveGroupKey";
import { validateAndSanitizeTipTapDoc } from "@/lib/exegesis/richText";

export const runtime = "nodejs";

type ApiOk = {
  ok: true;
  trackId: string;
  groupKey: string;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
  identities: Record<string, IdentityDTO>; // keyed by memberId (at least author)
};

type ApiErr = { ok: false; error: string };

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

function json(status: number, body: ApiOk | ApiErr) {
  return NextResponse.json(body, { status });
}

function norm(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function clampInt(v: unknown, min: number, max: number): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.trunc(v);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

function stableAnonLabel(memberId: string): string {
  const words = [
    "Amber",
    "Obsidian",
    "Juniper",
    "Cobalt",
    "Saffron",
    "Quartz",
    "Cedar",
    "Heliotrope",
    "Moss",
    "Ember",
    "Indigo",
    "Umber",
    "Lichen",
    "Aster",
    "Onyx",
    "Kauri",
    "Dusk",
    "Nimbus",
    "Salt",
    "Foxglove",
    "Kelp",
    "Aurora",
    "Fjord",
    "Cicada",
    "Vesper",
    "Drift",
    "Sable",
    "Pollen",
    "Basalt",
    "Mirage",
  ];

  const h = crypto.createHash("sha256").update(memberId).digest();
  const n = h.readUInt32BE(0);
  const w = words[n % words.length] ?? "Cipher";
  return `Anonymous ${w}`;
}

async function requireMemberId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = r.rows?.[0]?.id ?? "";
  return memberId || null;
}

async function requireCanPost(memberId: string): Promise<boolean> {
  return await hasAnyEntitlement(memberId, [
    ENTITLEMENTS.TIER_PATRON,
    ENTITLEMENTS.TIER_PARTNER,
  ]);
}

function assertInsertedRow(row: {
  inserted_count: number;
  id: string | null;
  track_id: string | null;
  group_key: string | null;
  line_key: string | null;
  root_id: string | null;
  depth: number | null;
  body_plain: string | null;
  line_text_snapshot: string | null;
  created_by_member_id: string | null;
  status: "live" | "hidden" | "deleted" | null;
  created_at: string | null;
  edit_count: number | null;
  vote_count: number | null;
}): asserts row is typeof row & {
  inserted_count: number;
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
} {
  if (!row || row.inserted_count !== 1) {
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

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const b =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;

  if (!b) {
    return json(400, { ok: false, error: "Invalid JSON body." });
  }

  const trackId = norm(b.trackId);
  const lineKey = norm(b.lineKey);

  // groupKey becomes optional (client may still send it, but we don't trust it)
  const groupKeyClient = norm(b.groupKey);

  function normNullableId(v: unknown): string | null {
    const s = norm(v);
    if (!s) return null;
    if (s === "null" || s === "undefined") return null;
    return s;
  }

  const parentIdRaw = norm(b.parentId);
  const parentId = normNullableId(b.parentId);

  const legacyBodyPlain = norm(b.bodyPlain);

  const hasBodyRich = "bodyRich" in b;
  const bodyRichInput: unknown = hasBodyRich ? (b.bodyRich ?? null) : null;

  // Phase C: if bodyRich present, it becomes canonical; derive bodyPlain server-side.
  // If bodyRich missing/null, fall back to legacy plain-only posting.
  let bodyPlain = legacyBodyPlain;
  let bodyRichJson = JSON.stringify({ type: "doc", content: [{ type: "paragraph" }] });

  if (bodyRichInput !== null && typeof bodyRichInput !== "undefined") {
    const v = validateAndSanitizeTipTapDoc(bodyRichInput);
    if (!v.ok) return json(400, { ok: false, error: v.error });
    bodyPlain = v.plain;
    try {
      bodyRichJson = JSON.stringify(v.doc);
    } catch {
      return json(400, { ok: false, error: "Invalid bodyRich." });
    }
  } else {
    // legacy mode
    if (!bodyPlain)
      return json(400, { ok: false, error: "Missing bodyPlain." });
    if (bodyPlain.length > 5000)
      return json(400, { ok: false, error: "bodyPlain too long." });
  }

  if (bodyRichJson.length > 200_000) {
    return json(400, { ok: false, error: "bodyRich too large." });
  }

  const lineTextSnapshot = norm(b.lineTextSnapshot);
  const lyricsVersion = norm(b.lyricsVersion) || null;

  const tMs = clampInt(b.tMs, 0, 60 * 60 * 1000);
  const tMsOrNull = tMs === null ? null : tMs;

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (!lineKey) return json(400, { ok: false, error: "Missing lineKey." });

  // Resolve canonical group key (map-first, v1 fallback)
  const resolved = await resolveGroupKeyForAnchor({ trackId, lineKey });
  const groupKey = resolved.groupKey;

  if (!groupKey) {
    return json(400, { ok: false, error: "Could not resolve groupKey." });
  }

  // If the client sent a groupKey, require it to match server resolution.
  // This prevents “posting into the wrong thread” if mappings changed mid-session.
  if (groupKeyClient && groupKeyClient !== groupKey) {
    return json(409, {
      ok: false,
      error: "Group key changed. Refresh and try again.",
    });
  }

  if (!bodyPlain) return json(400, { ok: false, error: "Missing bodyPlain." });
  if (bodyPlain.length > 5000)
    return json(400, { ok: false, error: "bodyPlain too long." });

  if (!lineTextSnapshot)
    return json(400, { ok: false, error: "Missing lineTextSnapshot." });
  if (lineTextSnapshot.length > 2000)
    return json(400, { ok: false, error: "lineTextSnapshot too long." });

  if (parentId && !isUuid(parentId))
    return json(400, { ok: false, error: "Invalid parentId." });

  const memberId = await requireMemberId();
  if (!memberId) {
    return json(401, { ok: false, error: "Sign in required." });
  }
  if (!isUuid(memberId)) {
    return json(403, { ok: false, error: "Provisioning required." });
  }

  const canPost = await requireCanPost(memberId);
  if (!canPost) {
    return json(403, { ok: false, error: "Patron or Partner required." });
  }

  const rootIdForRootComment = crypto.randomUUID(); // always generate
  const commentIdForReply = crypto.randomUUID(); // always generate

  try {
    // Precompute ids deterministically:
    // - root comments: id == rootId
    // - replies: id is a new uuid, rootId inherited from parent
    // We'll compute final ids inside SQL to avoid mismatches.

    const label = stableAnonLabel(memberId);

    const parentUuid = parentId; // string | null

    // Atomic statement: ensure meta, block if locked, ensure identity, resolve parent/root/depth,
    // insert comment, bump meta + identity, return comment + meta + identity.
    const q = await sql<{
      // diagnostic
      inserted_count: number;
      guard_err: string | null;

      // comment (nullable when insert suppressed)
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

      // meta (always present)
      meta_track_id: string;
      meta_group_key: string;
      meta_pinned_comment_id: string | null;
      meta_locked: boolean;
      meta_comment_count: number;
      meta_last_activity_at: string;
      meta_created_at: string;
      meta_updated_at: string;
      meta_exists: boolean;
      ident_exists: boolean;

      // identity (always present)
      ident_member_id: string;
      ident_anon_label: string;
      ident_public_name: string | null;
      ident_public_name_unlocked_at: string | null;
      ident_contribution_count: number;
    }>`
      with
params as (
  select
    ${trackId}::text          as track_id,
    ${groupKey}::text         as group_key,
    ${lineKey}::text          as line_key,
    nullif(${parentUuid}::text, '')::uuid as parent_id,
    ${memberId}::uuid         as member_id,
    ${label}::text            as anon_label,
    ${bodyRichJson}::jsonb    as body_rich,
    ${bodyPlain}::text        as body_plain,
    ${tMsOrNull}::int         as t_ms,
    ${lineTextSnapshot}::text as line_text_snapshot,
    ${lyricsVersion}::text    as lyrics_version,
    ${rootIdForRootComment}::uuid as root_id_for_root,
    ${commentIdForReply}::uuid    as id_for_reply
),

-- ensure thread meta exists (exactly one row)
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

-- ensure identity exists (exactly one row)
ident_base as (
  insert into exegesis_identity (member_id, anon_label)
  select p.member_id, p.anon_label
  from params p
  on conflict (member_id) do nothing
  returning member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
),
ident_existing as (
  select i.member_id, i.anon_label, i.public_name, i.public_name_unlocked_at, i.contribution_count
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

-- parent (0/1 row) + a single-row “parent facts” shim
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

-- single-row guard (this is the key structural change)
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
  returning i.member_id, i.anon_label, i.public_name, i.public_name_unlocked_at, i.contribution_count
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
  u.anon_label as ident_anon_label,
  u.public_name as ident_public_name,
  u.public_name_unlocked_at as ident_public_name_unlocked_at,
  u.contribution_count as ident_contribution_count

from stats s
join meta_out m on true
join ident_out u on true
left join inserted i on true
limit 1
    `;

    const row = q.rows?.[0] ?? null;

    if (!row) {
      return json(500, { ok: false, error: "No response row." });
    }

    if ((row.inserted_count ?? 0) === 0) {
      console.error("[exegesis/comment] insert suppressed", {
        trackId,
        parentIdRaw,
        groupKey,
        lineKey,
        parentId,
        memberId,
        guard_err: row.guard_err,
      });

      // Convert known guard errors into proper HTTP responses
      if (row.guard_err === "LOCKED") {
        return json(403, { ok: false, error: "Thread is locked." });
      }
      if (row.guard_err === "PARENT_NOT_FOUND") {
        return json(404, { ok: false, error: "Parent not found." });
      }
      if (row.guard_err === "PARENT_SCOPE") {
        return json(400, { ok: false, error: "Parent scope mismatch." });
      }
      if (row.guard_err === "DEPTH") {
        return json(400, { ok: false, error: "Thread depth limit reached." });
      }
      if (row.guard_err === "META_MISSING") {
        return json(500, { ok: false, error: "Thread meta missing." });
      }
      if (row.guard_err === "IDENT_MISSING") {
        return json(500, { ok: false, error: "Identity missing." });
      }

      // If guard_err is null but inserted_count is 0, that's the anomaly we are chasing.
      return json(500, { ok: false, error: "Insert suppressed unexpectedly." });
    }

    if (
      !row.id ||
      !row.track_id ||
      !row.group_key ||
      !row.line_key ||
      !row.root_id
    ) {
      console.error(
        "[exegesis/comment] inserted_count>0 but missing comment fields",
        row,
      );
      return json(500, { ok: false, error: "Insert returned incomplete row." });
    }

    assertInsertedRow(row);

    const comment: CommentDTO = {
      id: row.id,
      trackId: row.track_id,
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

    const meta: ThreadMetaDTO = {
      trackId: row.meta_track_id,
      groupKey: row.meta_group_key,
      pinnedCommentId: row.meta_pinned_comment_id,
      locked: row.meta_locked,
      commentCount: row.meta_comment_count,
      lastActivityAt: row.meta_last_activity_at,
      createdAt: row.meta_created_at,
      updatedAt: row.meta_updated_at,
    };

    const identities: Record<string, IdentityDTO> = {
      [row.ident_member_id]: {
        memberId: row.ident_member_id,
        anonLabel: row.ident_anon_label,
        publicName: row.ident_public_name,
        publicNameUnlockedAt: row.ident_public_name_unlocked_at,
        contributionCount: row.ident_contribution_count,
      },
    };

    return json(200, {
      ok: true,
      trackId,
      groupKey,
      comment,
      meta,
      identities,
    });
  } catch (e: unknown) {
    // Make sure it shows up in Vercel logs with details
    console.error("[exegesis/comment] POST failed", e);

    const errObj = e as {
      code?: string;
      message?: string;
      detail?: string;
      hint?: string;
      position?: string;
    } | null;

    const msg =
      typeof errObj?.message === "string" && errObj.message.trim()
        ? errObj.message.trim()
        : e instanceof Error && e.message.trim()
          ? e.message.trim()
          : "";

    // In dev, give yourself enough to debug without guessing.
    // (If we later want to redact in prod, we can gate on NODE_ENV.)
    const extra =
      errObj?.code || errObj?.detail || errObj?.hint
        ? ` (${[errObj?.code, errObj?.detail, errObj?.hint]
            .filter(Boolean)
            .join(" · ")})`
        : "";

    return json(500, { ok: false, error: (msg || "Unknown error.") + extra });
  }
}
