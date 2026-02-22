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

function safeJsonStringify(v: unknown): string {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return "null";
  }
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

type DbParentRow = {
  id: string;
  track_id: string;
  group_key: string;
  root_id: string;
  depth: number;
};

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

  const parentIdRaw = norm(b.parentId);
  const parentId = parentIdRaw ? parentIdRaw : null;

  const legacyBodyPlain = norm(b.bodyPlain);

  const hasBodyRich = "bodyRich" in b;
  const bodyRichInput: unknown = hasBodyRich ? (b.bodyRich ?? null) : null;

  // Phase C: if bodyRich present, it becomes canonical; derive bodyPlain server-side.
  // If bodyRich missing/null, fall back to legacy plain-only posting.
  let bodyPlain = legacyBodyPlain;
  let bodyRichJson = safeJsonStringify(null); // JSON "null" (still a jsonb value)

  if (bodyRichInput !== null && typeof bodyRichInput !== "undefined") {
    const v = validateAndSanitizeTipTapDoc(bodyRichInput);
    if (!v.ok) return json(400, { ok: false, error: v.error });
    bodyPlain = v.plain;
    bodyRichJson = JSON.stringify(v.doc);
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
      // comment
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

      // meta
      meta_track_id: string;
      meta_group_key: string;
      meta_pinned_comment_id: string | null;
      meta_locked: boolean;
      meta_comment_count: number;
      meta_last_activity_at: string;
      meta_created_at: string;
      meta_updated_at: string;

      // identity
      ident_member_id: string;
      ident_anon_label: string;
      ident_public_name: string | null;
      ident_public_name_unlocked_at: string | null;
      ident_contribution_count: number;

      // guard info
      guard_err: string | null;
    }>`
      with
      -- ensure thread meta exists
      meta_ins as (
        insert into exegesis_thread_meta (track_id, group_key)
        values (${trackId}, ${groupKey})
        on conflict (track_id, group_key) do nothing
        returning track_id, group_key
      ),
      meta as (
        select track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, created_at, updated_at
        from exegesis_thread_meta
        where track_id = ${trackId}
          and group_key = ${groupKey}
        limit 1
      ),
      -- lock guard
      guard as (
        select
          case
            when (select locked from meta) then 'LOCKED'
            else null
          end as err
      ),
      -- ensure identity exists
      ident_ins as (
        insert into exegesis_identity (member_id, anon_label)
        values (${memberId}::uuid, ${label})
        on conflict (member_id) do nothing
        returning member_id
      ),
      -- resolve parent (if any)
      parent as (
        select id, track_id, group_key, root_id, depth
        from exegesis_comment
        where id = ${parentUuid}::uuid
        limit 1
      ),
      parent_guard as (
        select
          case
            when ${parentUuid}::uuid is null then null
            when (select id from parent) is null then 'PARENT_NOT_FOUND'
            when (select track_id from parent) <> ${trackId} then 'PARENT_SCOPE'
            when (select group_key from parent) <> ${groupKey} then 'PARENT_SCOPE'
            when ((select depth from parent) + 1) > 6 then 'DEPTH'
            else null
          end as err
      ),
      resolved as (
        select
          case
  when ${parentUuid}::uuid is null then ${rootIdForRootComment}::uuid
  else (select root_id from parent)
end as root_id,
          case
            when ${parentUuid}::uuid is null then 0::int
            else ((select depth from parent) + 1)::int
          end as depth,
          case
  when ${parentUuid}::uuid is null then ${rootIdForRootComment}::uuid
  else ${commentIdForReply}::uuid
end as id
      ),
      inserted as (
        insert into exegesis_comment (
          id,
          track_id,
          group_key,
          line_key,
          parent_id,
          root_id,
          depth,
          body_rich,
          body_plain,
          t_ms,
          line_text_snapshot,
          lyrics_version,
          created_by_member_id,
          status
        )
        select
          (select id from resolved),
          ${trackId},
          ${groupKey},
          ${lineKey},
          ${parentUuid}::uuid,
          (select root_id from resolved),
          (select depth from resolved),
          ${bodyRichJson}::jsonb,
          ${bodyPlain},
          ${tMsOrNull}::int,
          ${lineTextSnapshot},
          ${lyricsVersion},
          ${memberId}::uuid,
          'live'
        where (select err from guard) is null
          and (select err from parent_guard) is null
        returning
          id,
          track_id,
          group_key,
          line_key,
          parent_id,
          root_id,
          depth,
          body_rich,
          body_plain,
          t_ms,
          line_text_snapshot,
          lyrics_version,
          created_by_member_id,
          status::text as status,
          created_at,
          edited_at,
          edit_count,
          vote_count
      ),
            meta_upd as (
        update exegesis_thread_meta
        set
          comment_count = comment_count + 1,
          last_activity_at = now(),
          updated_at = now()
        where track_id = ${trackId}
          and group_key = ${groupKey}
          and exists (select 1 from inserted)
        returning track_id
      ),
      ident_upd as (
        update exegesis_identity
        set
          contribution_count = contribution_count + 1,
          public_name_unlocked_at = case
            when public_name_unlocked_at is null and (contribution_count + 1) >= 5 then now()
            else public_name_unlocked_at
          end,
          updated_at = now()
        where member_id = ${memberId}::uuid
          and exists (select 1 from inserted)
        returning member_id
      ),
      meta_final as (
        select track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, created_at, updated_at
        from exegesis_thread_meta
        where track_id = ${trackId}
          and group_key = ${groupKey}
        limit 1
      ),
      ident_final as (
        select member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
        from exegesis_identity
        where member_id = ${memberId}::uuid
        limit 1
      )
      select
        i.*,

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
        u.contribution_count as ident_contribution_count,

        coalesce((select err from guard), (select err from parent_guard)) as guard_err
      from inserted i
      join meta_final m on true
      join ident_final u on true
    `;

    const row = q.rows?.[0] ?? null;

    // Guard errors that prevented insert (no row returned)
    if (!row) {
      // Re-run a tiny guard check to return a friendly message.
      // (Still no transaction; cheap and deterministic.)
      if (parentId) {
        const pRes = await sql<DbParentRow>`
          select id, track_id, group_key, root_id, depth
          from exegesis_comment
          where id = ${parentId}::uuid
          limit 1
        `;
        const p = pRes.rows?.[0] ?? null;
        if (!p) return json(404, { ok: false, error: "Parent not found." });
        if (p.track_id !== trackId || p.group_key !== groupKey) {
          return json(400, { ok: false, error: "Parent scope mismatch." });
        }
        if ((p.depth ?? 0) + 1 > 6) {
          return json(400, { ok: false, error: "Thread depth limit reached." });
        }
      }

      const lockRes = await sql<{ locked: boolean }>`
        select locked
        from exegesis_thread_meta
        where track_id = ${trackId}
          and group_key = ${groupKey}
        limit 1
      `;
      if (lockRes.rows?.[0]?.locked) {
        return json(403, { ok: false, error: "Thread is locked." });
      }

      return json(500, { ok: false, error: "Failed to insert comment." });
    }

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
    // (If you later want to redact in prod, we can gate on NODE_ENV.)
    const extra =
      errObj?.code || errObj?.detail || errObj?.hint
        ? ` (${[errObj?.code, errObj?.detail, errObj?.hint]
            .filter(Boolean)
            .join(" · ")})`
        : "";

    return json(500, { ok: false, error: (msg || "Unknown error.") + extra });
  }
}
