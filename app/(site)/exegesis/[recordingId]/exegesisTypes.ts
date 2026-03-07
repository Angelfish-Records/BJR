// web/app/(site)/exegesis/[recordingId]/exegesisTypes.ts
import type { LyricCue, LyricGroupMap } from "@/lib/types";
import type { GatePayload } from "@/app/home/gating/gateTypes";

export type LyricsApiOk = {
  ok: true;
  recordingId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricCue[];
  groupMap?: LyricGroupMap;
};

export type ThreadSort = "top" | "recent";

export type IdentityDTO = {
  memberId: string;
  anonLabel: string;
  publicName: string | null;
  publicNameUnlockedAt: string | null;
  contributionCount: number;
};

export type CommentDTO = {
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

export type ThreadMetaDTO = {
  recordingId: string;
  groupKey: string;
  pinnedCommentId: string | null;
  locked: boolean;
  commentCount: number;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
};

export type ViewerDTO =
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

export type ThreadApiOk = {
  ok: true;
  recordingId: string;
  groupKey: string;
  sort: ThreadSort;
  meta: ThreadMetaDTO | null;
  roots: Array<{ rootId: string; comments: CommentDTO[] }>;
  identities: Record<string, IdentityDTO>;
  viewer: ViewerDTO;
};

export type ThreadApiErr = { ok: false; error: string; gate?: GatePayload };

export type CommentPostOk = {
  ok: true;
  recordingId: string;
  groupKey: string;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
  identities: Record<string, IdentityDTO>;
};

export type CommentEditOk = {
  ok: true;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
};

export type CommentEditErr = { ok: false; error: string; code?: string };

export type VoteOk = {
  ok: true;
  commentId: string;
  viewerHasVoted: boolean;
  voteCount: number;
};

export type VoteErr = { ok: false; error: string; gate?: GatePayload };

export type ReportOk = { ok: true; reportId: string };
export type ReportErr = { ok: false; error: string; code?: string };

export const REPORT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment" },
  { key: "misinfo", label: "Misinformation" },
  { key: "copyright", label: "Copyright" },
  { key: "other", label: "Other" },
];

export type ReportDraft = {
  open: boolean;
  category: string;
  reason: string;
  err: string;
  done: boolean;
  busy: boolean;
};

export type ReplyDraft = {
  open: boolean;
  ui: MiniStage;
  plain: string;
  doc: unknown | null;
  posting: boolean;
  err: string;
};

export type EditDraft = {
  open: boolean;
  ui: MiniStage;
  plain: string;
  doc: unknown | null;
  posting: boolean;
  err: string;
};

export type ComposerStage = "collapsed" | "basic" | "full";
export type MiniStage = "basic" | "full";