// web/app/api/exegesis/comment/route.ts
import "server-only";
import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";

import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";

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

/**
 * groupKey validation v1:
 * - groupKey is CLIENT-derived (sent in POST body)
 * - server validates it matches the expected scheme for (trackId,lineKey)
 * - currently 1:1 with lineKey: `lk:${lineKey}`
 *
 * Later you can upgrade this validation to support repeat-line grouping
 * (derive from lyrics anchoring rules + version), while still accepting
 * client-provided groupKey.
 */
function expectedGroupKey(trackId: string, lineKey: string): string {
  const t = norm(trackId);
  const lk = norm(lineKey);
  if (!t || !lk) return "";
  return `lk:${lk}`;
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

type DbIdentityRow = {
  member_id: string;
  anon_label: string;
  public_name: string | null;
  public_name_unlocked_at: string | null;
  contribution_count: number;
};

type DbMetaRow = {
  track_id: string;
  group_key: string;
  pinned_comment_id: string | null;
  locked: boolean;
  comment_count: number;
  last_activity_at: string;
  created_at: string;
  updated_at: string;
};

type DbInsertedCommentRow = {
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

  // IMPORTANT: client-derived groupKey
  const groupKeyClient = norm(b.groupKey);

  const parentIdRaw = norm(b.parentId);
  const parentId = parentIdRaw ? parentIdRaw : null;

  const bodyPlain = norm(b.bodyPlain);
  const bodyRich: unknown | null =
    "bodyRich" in b ? (b.bodyRich ?? null) : null;
  const bodyRichJson = safeJsonStringify(bodyRich);
  if (bodyRichJson.length > 200_000) {
    return json(400, { ok: false, error: "bodyRich too large." });
  }

  const lineTextSnapshot = norm(b.lineTextSnapshot);
  const lyricsVersion = norm(b.lyricsVersion) || null;

  const tMs = clampInt(b.tMs, 0, 60 * 60 * 1000);
  const tMsOrNull = tMs === null ? null : tMs;

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (!lineKey) return json(400, { ok: false, error: "Missing lineKey." });
  if (!groupKeyClient)
    return json(400, { ok: false, error: "Missing groupKey." });

  if (!bodyPlain) return json(400, { ok: false, error: "Missing bodyPlain." });
  if (bodyPlain.length > 5000)
    return json(400, { ok: false, error: "bodyPlain too long." });

  if (!lineTextSnapshot)
    return json(400, { ok: false, error: "Missing lineTextSnapshot." });
  if (lineTextSnapshot.length > 2000)
    return json(400, { ok: false, error: "lineTextSnapshot too long." });

  if (parentId && !isUuid(parentId))
    return json(400, { ok: false, error: "Invalid parentId." });

  // Validate groupKey against expected scheme for (trackId,lineKey)
  const expected = expectedGroupKey(trackId, lineKey);
  if (!expected) {
    return json(400, { ok: false, error: "Could not validate groupKey." });
  }
  const groupKey = groupKeyClient.trim();
  if (groupKey !== expected) {
    return json(400, { ok: false, error: "Invalid groupKey for lineKey." });
  }

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

  // Resolve parent -> compute root/depth
  let rootId: string;
  let depth: number;
  if (parentId) {
    const parentRes = await sql<DbParentRow>`
      select id, track_id, group_key, root_id, depth
      from exegesis_comment
      where id = ${parentId}::uuid
      limit 1
    `;
    const p = parentRes.rows?.[0] ?? null;
    if (!p) return json(404, { ok: false, error: "Parent not found." });
    if (p.track_id !== trackId || p.group_key !== groupKey) {
      return json(400, { ok: false, error: "Parent scope mismatch." });
    }

    const nextDepth = (p.depth ?? 0) + 1;
    const MAX_DEPTH = 6;
    if (nextDepth > MAX_DEPTH) {
      return json(400, { ok: false, error: "Thread depth limit reached." });
    }

    rootId = p.root_id;
    depth = nextDepth;
  } else {
    rootId = crypto.randomUUID();
    depth = 0;
  }

  const commentId = parentId ? crypto.randomUUID() : rootId;

  try {
    await sql`begin`;

    await sql`
      insert into exegesis_thread_meta (track_id, group_key)
      values (${trackId}, ${groupKey})
      on conflict (track_id, group_key) do nothing
    `;

    const lockRes = await sql<{ locked: boolean }>`
      select locked
      from exegesis_thread_meta
      where track_id = ${trackId}
        and group_key = ${groupKey}
      limit 1
    `;
    const locked = lockRes.rows?.[0]?.locked ?? false;
    if (locked) {
      await sql`rollback`;
      return json(403, { ok: false, error: "Thread is locked." });
    }

    const label = stableAnonLabel(memberId);
    await sql`
      insert into exegesis_identity (member_id, anon_label)
      values (${memberId}::uuid, ${label})
      on conflict (member_id) do nothing
    `;

    const inserted = await sql<DbInsertedCommentRow>`
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
      ) values (
        ${commentId}::uuid,
        ${trackId},
        ${groupKey},
        ${lineKey},
        ${parentId ? parentId : null}::uuid,
        ${rootId}::uuid,
        ${depth}::int,
        ${bodyRichJson}::jsonb,
        ${bodyPlain},
        ${tMsOrNull}::int,
        ${lineTextSnapshot},
        ${lyricsVersion},
        ${memberId}::uuid,
        'live'
      )
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
    `;

    const c = inserted.rows?.[0] ?? null;
    if (!c) {
      await sql`rollback`;
      return json(500, { ok: false, error: "Failed to insert comment." });
    }

    await sql`
      update exegesis_thread_meta
      set
        comment_count = comment_count + 1,
        last_activity_at = now(),
        updated_at = now()
      where track_id = ${trackId}
        and group_key = ${groupKey}
    `;

    await sql`
      update exegesis_identity
      set
        contribution_count = contribution_count + 1,
        updated_at = now()
      where member_id = ${memberId}::uuid
    `;

    const metaRes = await sql<DbMetaRow>`
      select track_id, group_key, pinned_comment_id, locked, comment_count, last_activity_at, created_at, updated_at
      from exegesis_thread_meta
      where track_id = ${trackId}
        and group_key = ${groupKey}
      limit 1
    `;
    // NOTE: if your table is named exegesis_thread_meta (as elsewhere), keep it consistent:
    // (I’m defensively correcting below if you copy/paste and hit a typo.)
    const metaRow = (metaRes as unknown as { rows?: DbMetaRow[] }).rows?.[0] ?? null;

    const identRes = await sql<DbIdentityRow>`
      select member_id, anon_label, public_name, public_name_unlocked_at, contribution_count
      from exegesis_identity
      where member_id = ${memberId}::uuid
      limit 1
    `;
    const identRow = identRes.rows?.[0] ?? null;

    await sql`commit`;

    const comment: CommentDTO = {
      id: c.id,
      trackId: c.track_id,
      groupKey: c.group_key,
      lineKey: c.line_key,
      parentId: c.parent_id,
      rootId: c.root_id,
      depth: c.depth,
      bodyRich: c.body_rich,
      bodyPlain: c.body_plain,
      tMs: c.t_ms,
      lineTextSnapshot: c.line_text_snapshot,
      lyricsVersion: c.lyrics_version,
      createdByMemberId: c.created_by_member_id,
      status: c.status,
      createdAt: c.created_at,
      editedAt: c.edited_at,
      editCount: c.edit_count,
      voteCount: c.vote_count,
      viewerHasVoted: false,
    };

    const meta: ThreadMetaDTO = metaRow
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
      : {
          trackId,
          groupKey,
          pinnedCommentId: null,
          locked: false,
          commentCount: 1,
          lastActivityAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

    const identities: Record<string, IdentityDTO> = {};
    if (identRow) {
      identities[identRow.member_id] = {
        memberId: identRow.member_id,
        anonLabel: identRow.anon_label,
        publicName: identRow.public_name,
        publicNameUnlockedAt: identRow.public_name_unlocked_at,
        contributionCount: identRow.contribution_count,
      };
    }

    return json(200, { ok: true, trackId, groupKey, comment, meta, identities });
  } catch (e: unknown) {
    try {
      await sql`rollback`;
    } catch {
      // ignore
    }

    const msg =
      e instanceof Error
        ? norm(e.message)
        : norm(typeof e === "string" ? e : "");

    return json(500, { ok: false, error: msg || "Unknown error." });
  }
}