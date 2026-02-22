// web/app/api/exegesis/thread/route.ts
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { sql } from "@vercel/postgres";
import { ensureAnonId } from "@/lib/anon";
import { hasAnyEntitlement } from "@/lib/entitlements";
import { ENTITLEMENTS } from "@/lib/vocab";
import crypto from "crypto";
import {
  resolveGroupKeyForAnchor,
  isGroupKeyV1,
  isKnownCanonicalGroupKey,
} from "@/lib/exegesis/resolveGroupKey";

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

type ViewerDTO =
  | { kind: "anon" }
  | {
      kind: "member";
      memberId: string;
      cap: {
        canVote: boolean; // Friend+
        canReport: boolean; // Friend+
        canPost: boolean; // Patron/Partner
        canClaimName: boolean; // server-derived from identity row
      };
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
  viewer: ViewerDTO;
};

type ApiErr = { ok: false; error: string; code?: "ANON_LIMIT" };

function json(status: number, body: ApiOk | ApiErr, res?: NextResponse) {
  const r = res ?? NextResponse.json(body, { status });
  return r;
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

async function getViewer(req: NextRequest): Promise<Viewer> {
  const { userId } = await auth();
  if (!userId) {
    const anonId = (req.cookies.get("af_anon")?.value ?? "").trim();
    return { kind: "anon", anonId: anonId || "anon_missing" };
  }

  const r = await sql<{ id: string }>`
    select id
    from members
    where clerk_user_id = ${userId}
    limit 1
  `;
  const memberId = r.rows?.[0]?.id ?? "";
  if (!memberId) return { kind: "anon", anonId: "anon_provisioning" };
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
  // Keep this aligned with the write routes:
  // - vote: Friend+ (Friend, Patron, Partner)
  // - report: Friend+ (per your policy; default signed-in is Friend)
  // - post: Patron/Partner
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
  const url = new URL(req.url);

  const trackId = norm(url.searchParams.get("trackId"));

  const sortParam = norm(url.searchParams.get("sort")) || "top";
  const sort: ThreadSort = isSort(sortParam) ? sortParam : "top";

  if (!trackId) return json(400, { ok: false, error: "Missing trackId." });
  if (trackId.length > 200)
    return json(400, { ok: false, error: "Invalid trackId." });

  const rawGroupKey = norm(url.searchParams.get("groupKey"));
  const lineKey = norm(url.searchParams.get("lineKey"));

  let groupKey = "";

  if (lineKey) {
    const resolved = await resolveGroupKeyForAnchor({ trackId, lineKey });
    groupKey = resolved.groupKey;

    // If the client also sent groupKey, require it to match server resolution.
    // Prevents stale clients reading the wrong thread after mapping changes.
    if (rawGroupKey && norm(rawGroupKey) !== groupKey) {
      return json(409, {
        ok: false,
        error: "Group key changed. Refresh and try again.",
      });
    }
  } else {
    if (!rawGroupKey) {
      return json(400, { ok: false, error: "Missing lineKey (or groupKey)." });
    }

    const g = norm(rawGroupKey);

    // Back-compat: v1 still allowed as a direct groupKey
    if (isGroupKeyV1(g)) {
      groupKey = g;
    } else {
      // v2+ group keys only allowed if they are known on this track
      const ok = await isKnownCanonicalGroupKey({ trackId, groupKey: g });
      if (!ok) {
        return json(400, {
          ok: false,
          error: "Unknown groupKey.",
        });
      }
      groupKey = g;
    }
  }

  if (!groupKey) return json(400, { ok: false, error: "Invalid group key." });

  // Prepare a response so we can persist anon cookie when needed
  const res = NextResponse.json<ApiOk | ApiErr>(
    { ok: false, error: "init" },
    { status: 200 },
  );
  const { anonId } = ensureAnonId(req, res);

  const viewer0 = await getViewer(req);

  // If anon, force minted anonId (never operate on "anon_missing")
  const viewer: Viewer =
    viewer0.kind === "anon" && viewer0.anonId === "anon_missing"
      ? { kind: "anon", anonId }
      : viewer0;

  const viewerMemberId =
    viewer.kind === "member" && isUuid(viewer.memberId)
      ? viewer.memberId
      : null;

  // Ensure viewer identity exists (so we can always show anonLabel even before first post)
  if (viewerMemberId) {
    const label = stableAnonLabel(viewerMemberId);
    await sql`
    insert into exegesis_identity (member_id, anon_label)
    values (${viewerMemberId}::uuid, ${label})
    on conflict (member_id) do nothing
  `;
  }

  // ---- anon metering gate (read) ----
  if (viewer.kind === "anon") {
    const LIMIT = 8;

    const gate = await sql<{ already: boolean; n: number }>`
      with
      already as (
        select exists(
          select 1
          from anon_exegesis_thread_opens
          where anon_id = ${viewer.anonId}
            and track_id = ${trackId}
            and group_key = ${groupKey}
        ) as already
      ),
      cnt as (
        select count(*)::int as n
        from anon_exegesis_thread_opens
        where anon_id = ${viewer.anonId}
      ),
      ins as (
        insert into anon_exegesis_thread_opens (anon_id, track_id, group_key)
        select ${viewer.anonId}, ${trackId}, ${groupKey}
        where (select already from already) = false
          and (select n from cnt) < ${LIMIT}
        on conflict do nothing
        returning 1
      )
      select (select already from already) as already, (select n from cnt) as n
    `;

    const alreadyOpened = Boolean(gate.rows?.[0]?.already);
    const n = Number(gate.rows?.[0]?.n ?? 0);

    if (!alreadyOpened && n >= LIMIT) {
      return NextResponse.json<ApiErr>(
        {
          ok: false,
          code: "ANON_LIMIT",
          error:
            "You’ve hit the anon reading limit. Sign in to keep reading and voting.",
        },
        { status: 403, headers: res.headers },
      );
    }
  }

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

  // Identity hydration (single query) + always include viewer identity
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

  // Viewer DTO (server-authoritative caps)
  let viewerDto: ViewerDTO;

  if (!viewerMemberId) {
    viewerDto = { kind: "anon" };
  } else {
    const cap0 = await capsForMember(viewerMemberId);

    // Respect thread lock for UI (server-authoritative)
    const locked = Boolean(metaRow?.locked);

    const me = identities[viewerMemberId];
    const canClaimName =
      !!me &&
      !me.publicName &&
      typeof me.publicNameUnlockedAt === "string" &&
      me.publicNameUnlockedAt.trim().length > 0;

    viewerDto = {
      kind: "member",
      memberId: viewerMemberId,
      cap: {
        ...cap0,
        canPost: locked ? false : cap0.canPost,
        // voting can stay true (your vote route already blocks LOCKED),
        // but if you want the UI to disable voting as well, uncomment:
        // canVote: locked ? false : cap0.canVote,
        canClaimName,
      },
    };
  }

  return NextResponse.json<ApiOk>(
    {
      ok: true,
      trackId,
      groupKey,
      sort,
      meta,
      roots,
      identities,
      viewer: viewerDto,
    },
    { status: 200, headers: res.headers },
  );
}
