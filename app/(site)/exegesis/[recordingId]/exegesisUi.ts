// web/app/(site)/exegesis/[recordingId]/exegesisUi.ts
import type { LyricCue } from "@/lib/types";
import type { CommentDTO, LyricsApiOk } from "./exegesisTypes";

export function reorderRootsPinnedFirst(
  roots: Array<{ rootId: string; comments: CommentDTO[] }>,
  pinnedCommentId: string | null,
) {
  const pid = (pinnedCommentId ?? "").trim();
  if (!pid) return roots;

  const idx = roots.findIndex((r) =>
    (r.comments ?? []).some((c) => c.id === pid),
  );
  if (idx <= 0) return roots;

  const pinned = roots[idx];
  const rest = roots.slice(0, idx).concat(roots.slice(idx + 1));
  return [pinned, ...rest];
}

export function parseHash(): {
  lineKey?: string;
  commentId?: string;
  rootId?: string;
} {
  if (typeof window === "undefined") return {};
  const raw = (window.location.hash ?? "").replace(/^#/, "").trim();
  if (!raw) return {};
  const sp = new URLSearchParams(raw);
  const lineKey = (sp.get("l") ?? "").trim();
  const commentId = (sp.get("c") ?? "").trim();
  const rootId = (sp.get("root") ?? "").trim();
  return {
    lineKey: lineKey || undefined,
    commentId: commentId || undefined,
    rootId: rootId || undefined,
  };
}

export function cueGroupKey(lyrics: LyricsApiOk, lineKey: string): string {
  const lk = (lineKey ?? "").trim();
  if (!lk) return "";
  const mapped = lyrics.groupMap?.[lk]?.canonicalGroupKey;
  if (typeof mapped === "string" && mapped.trim()) return mapped.trim();
  const cue = (lyrics.cues ?? []).find((x) => x.lineKey === lk);
  const groupKey = cue?.canonicalGroupKey;
  return typeof groupKey === "string" ? groupKey.trim() : "";
}

export function isSameGroup(a: string, b: string): boolean {
  const aa = (a ?? "").trim();
  const bb = (b ?? "").trim();
  return !!aa && !!bb && aa === bb;
}

export function cueCanonicalGroupKey(lyrics: LyricsApiOk, cue: LyricCue): string {
  return (cue.canonicalGroupKey ?? cueGroupKey(lyrics, cue.lineKey) ?? "").trim();
}

export function isTipTapDoc(
  value: unknown,
): value is { type: "doc"; content?: unknown[] } {
  if (!value || typeof value !== "object") return false;
  const obj = value as { type?: unknown; content?: unknown };
  if (obj.type !== "doc") return false;
  if (typeof obj.content === "undefined") return true;
  return Array.isArray(obj.content);
}

export function medalTier(
  votes: number,
): "copper" | "gold" | "adamantium" {
  const count = Math.max(0, votes || 0);
  if (count >= 7) return "adamantium";
  if (count >= 3) return "gold";
  return "copper";
}

export function medalClassForTier(
  tier: "copper" | "gold" | "adamantium",
): string {
  if (tier === "copper") return "text-[#b87333]";
  if (tier === "gold") return "text-[#f5d062]";
  return "afMedalAdamantium";
}

export function rootTopScore(root: {
  rootId: string;
  comments: CommentDTO[];
}) {
  return (root.comments ?? []).reduce(
    (sum, comment) => sum + (comment.voteCount ?? 0),
    0,
  );
}

export function rootRecentTs(root: {
  rootId: string;
  comments: CommentDTO[];
}) {
  let best = 0;
  for (const comment of root.comments ?? []) {
    const timestamp = Date.parse((comment.editedAt ?? comment.createdAt) as string);
    if (!Number.isNaN(timestamp)) best = Math.max(best, timestamp);
  }
  return best;
}

export function formatAgo(iso: string | null | undefined): string {
  const timestamp = Date.parse((iso ?? "") as string);
  if (!Number.isFinite(timestamp)) return "";

  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 52) return `${weeks}w ago`;
  const years = Math.floor(days / 365);
  return `${Math.max(1, years)}y ago`;
}