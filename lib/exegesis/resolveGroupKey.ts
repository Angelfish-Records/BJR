// web/lib/exegesis/resolveGroupKey.ts
import "server-only";
import { sql } from "@vercel/postgres";

function norm(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function groupKeyV1FromLineKey(lineKey: string): string {
  const lk = norm(lineKey);
  return lk ? `lk:${lk}` : "";
}

export function isGroupKeyV1(groupKey: string): boolean {
  const g = norm(groupKey);
  if (!g.startsWith("lk:")) return false;
  const lk = g.slice(3).trim();
  return !!lk && lk.length <= 200;
}

export type ResolvedGroupKey = {
  groupKey: string; // canonical group key
  scheme: "v1" | "map"; // v1 derived or map-resolved
  kind?: string | null; // optional: 'rep' | 'span' | 'v1' | etc
  anchorLineKey: string; // the lineKey used for resolution
};

export async function resolveGroupKeyForAnchor(args: {
  trackId: string;
  lineKey: string;
}): Promise<ResolvedGroupKey> {
  const trackId = norm(args.trackId);
  const lineKey = norm(args.lineKey);
  if (!trackId || !lineKey) {
    return { groupKey: "", scheme: "v1", kind: null, anchorLineKey: lineKey };
  }

  // Uses your new table. Adjust column names here if your migration differed.
  const r = await sql<{
    canonical_group_key: string;
    kind: string;
    scheme_version: number;
  }>`
    select canonical_group_key, kind, scheme_version
    from exegesis_group_map
    where track_id = ${trackId}
      and anchor_line_key = ${lineKey}
    limit 1
  `;

  const mapped = norm(r.rows?.[0]?.canonical_group_key);
  const kind = norm(r.rows?.[0]?.kind) || null;

  // Only accept a mapped key if it looks sane.
  // (Avoid poisoning resolution if a row is malformed.)
  if (mapped && mapped.length <= 200 && !/\s/.test(mapped)) {
    return {
      groupKey: mapped,
      scheme: "map",
      kind,
      anchorLineKey: lineKey,
    };
  }

  return {
    groupKey: groupKeyV1FromLineKey(lineKey),
    scheme: "v1",
    kind: "v1",
    anchorLineKey: lineKey,
  };
}

export async function isKnownCanonicalGroupKey(args: {
  trackId: string;
  groupKey: string;
}): Promise<boolean> {
  const trackId = norm(args.trackId);
  const groupKey = norm(args.groupKey);
  if (!trackId || !groupKey) return false;

  const r = await sql<{ ok: boolean }>`
    select exists(
      select 1 from exegesis_thread_meta where track_id = ${trackId} and group_key = ${groupKey}
      union all
      select 1 from exegesis_comment where track_id = ${trackId} and group_key = ${groupKey}
      union all
      select 1 from exegesis_group_map where track_id = ${trackId} and canonical_group_key = ${groupKey}
    ) as ok
  `;
  return Boolean(r.rows?.[0]?.ok);
}
