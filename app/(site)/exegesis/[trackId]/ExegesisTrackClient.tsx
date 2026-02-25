// web/app/(site)/exegesis/[trackId]/ExegesisTrackClient.tsx
"use client";

import React from "react";
import TipTapEditor from "./TipTapEditor";
import TipTapReadOnly from "./TipTapReadOnly";

type LyricsApiCue = {
  lineKey: string;
  tMs: number;
  text: string;
  endMs?: number;
};

type LyricsApiOk = {
  ok: true;
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricsApiCue[];
};

type ThreadSort = "top" | "recent";

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
        canVote: boolean;
        canReport: boolean;
        canPost: boolean;
        canClaimName: boolean;
      };
    };

type ThreadApiOk = {
  ok: true;
  trackId: string;
  groupKey: string;
  sort: ThreadSort;
  meta: ThreadMetaDTO | null;
  roots: Array<{ rootId: string; comments: CommentDTO[] }>;
  identities: Record<string, IdentityDTO>;
  viewer: ViewerDTO;
};

type ThreadApiErr = { ok: false; error: string; code?: "ANON_LIMIT" | string };

type CommentPostOk = {
  ok: true;
  trackId: string;
  groupKey: string;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
  identities: Record<string, IdentityDTO>;
};

type CommentEditOk = {
  ok: true;
  comment: CommentDTO;
  meta: ThreadMetaDTO;
};
type CommentEditErr = { ok: false; error: string; code?: string };

type VoteOk = {
  ok: true;
  commentId: string;
  viewerHasVoted: boolean;
  voteCount: number;
};
type VoteErr = { ok: false; error: string };

type ReportOk = { ok: true; reportId: string };
type ReportErr = { ok: false; error: string; code?: string };

const REPORT_CATEGORIES: Array<{ key: string; label: string }> = [
  { key: "spam", label: "Spam" },
  { key: "harassment", label: "Harassment" },
  { key: "hate", label: "Hate" },
  { key: "sexual", label: "Sexual content" },
  { key: "self_harm", label: "Self-harm" },
  { key: "violence", label: "Violence" },
  { key: "misinfo", label: "Misinformation" },
  { key: "copyright", label: "Copyright" },
  { key: "other", label: "Other" },
];

type ReportDraft = {
  open: boolean;
  category: string;
  reason: string;
  err: string;
  done: boolean;
  busy: boolean;
};

function reorderRootsPinnedFirst(
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

function parseHash(): { lineKey?: string; commentId?: string } {
  if (typeof window === "undefined") return {};
  const raw = (window.location.hash ?? "").replace(/^#/, "").trim();
  if (!raw) return {};
  const sp = new URLSearchParams(raw);
  const lineKey = (sp.get("l") ?? "").trim();
  const commentId = (sp.get("c") ?? "").trim();
  return {
    lineKey: lineKey || undefined,
    commentId: commentId || undefined,
  };
}

function isTipTapDoc(v: unknown): v is { type: "doc"; content?: unknown[] } {
  if (!v || typeof v !== "object") return false;
  const o = v as { type?: unknown; content?: unknown };
  if (o.type !== "doc") return false;
  if (typeof o.content === "undefined") return true;
  return Array.isArray(o.content);
}

export default function ExegesisTrackClient(props: {
  trackId: string;
  trackTitle?: string | null;
  trackArtist?: string | null;
  lyrics: LyricsApiOk;
  canonicalPath?: string;
}) {
  const trackId = (props.trackId ?? "").trim();
  const lyrics = props.lyrics;

  const canonicalPath = (props.canonicalPath ?? "").trim();

  function setHash(next: { lineKey?: string; commentId?: string }) {
    if (typeof window === "undefined") return;

    const sp = new URLSearchParams();
    if (next.lineKey) sp.set("l", next.lineKey);
    if (next.commentId) sp.set("c", next.commentId);
    const h = sp.toString();

    // If a canonical base is provided, use it (and do NOT inherit portal query params).
    // Otherwise, preserve the current page's secondary query.
    const base = canonicalPath
      ? canonicalPath
      : window.location.pathname + window.location.search;

    window.history.replaceState(null, "", h ? `${base}#${h}` : base);
  }

  const [selected, setSelected] = React.useState<{
    lineKey: string;
    lineText: string;
    tMs: number;
  } | null>(null);

  const [thread, setThread] = React.useState<ThreadApiOk | null>(null);
  const [threadErr, setThreadErr] = React.useState<string>("");
  const [sort, setSort] = React.useState<ThreadSort>("top");
  const [draft, setDraft] = React.useState<string>("");
  const [draftDoc, setDraftDoc] = React.useState<unknown | null>(null);
  const [posting, setPosting] = React.useState<boolean>(false);

  type ReplyDraft = {
    open: boolean;
    plain: string;
    doc: unknown | null;
    posting: boolean;
    err: string;
  };

  type EditDraft = {
    open: boolean;
    plain: string;
    doc: unknown | null;
    posting: boolean;
    err: string;
  };

  const [editByCommentId, setEditByCommentId] = React.useState<
    Record<string, EditDraft>
  >({});

  const [replyByCommentId, setReplyByCommentId] = React.useState<
    Record<string, ReplyDraft>
  >({});

  const [claimOpen, setClaimOpen] = React.useState(false);
  const [claimName, setClaimName] = React.useState("");
  const [claimErr, setClaimErr] = React.useState("");
  const [claimBusy, setClaimBusy] = React.useState(false);

  const [reportByCommentId, setReportByCommentId] = React.useState<
    Record<string, ReportDraft>
  >({});

  const viewerMemberId =
    thread?.viewer?.kind === "member" ? thread.viewer.memberId : "";

  const viewerIdentity = viewerMemberId
    ? thread?.identities?.[viewerMemberId]
    : undefined;

  const meta = thread?.meta ?? null;
  const isLocked = Boolean(meta?.locked);

  const canVote =
    thread?.viewer?.kind === "member"
      ? thread.viewer.cap.canVote && !isLocked
      : false;
  const canReport =
    thread?.viewer?.kind === "member" ? thread.viewer.cap.canReport : false;
  const canPost =
    thread?.viewer?.kind === "member" ? thread.viewer.cap.canPost : false;
  const canClaimName =
    thread?.viewer?.kind === "member" ? thread.viewer.cap.canClaimName : false;

  function openReport(commentId: string) {
    if (!canReport) return;
    setReportByCommentId((prev) => {
      const cur = prev[commentId];
      const base: ReportDraft = cur ?? {
        open: true,
        category: "spam",
        reason: "",
        err: "",
        done: false,
        busy: false,
      };
      return {
        ...prev,
        [commentId]: {
          ...base,
          open: true,
          err: "",
          done: false,
          busy: false,
        },
      };
    });
  }

  function closeReport(commentId: string) {
    setReportByCommentId((prev) => {
      const cur = prev[commentId];
      if (!cur) return prev;
      return { ...prev, [commentId]: { ...cur, open: false, err: "" } };
    });
  }

  function openReply(commentId: string) {
    if (!canPost || isLocked) return;
    setReplyByCommentId((prev) => {
      const cur = prev[commentId];
      const base: ReplyDraft = cur ?? {
        open: true,
        plain: "",
        doc: null,
        posting: false,
        err: "",
      };
      return {
        ...prev,
        [commentId]: { ...base, open: true, err: "" },
      };
    });
  }

  function closeReply(commentId: string) {
    setReplyByCommentId((prev) => {
      if (!prev[commentId]) return prev;
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
  }

  function openEdit(c: CommentDTO) {
    if (!canPost || isLocked) return;
    if (!viewerMemberId) return;
    if (c.createdByMemberId !== viewerMemberId) return;
    if (c.status !== "live") return;

    setEditByCommentId((prev) => {
      const cur = prev[c.id];
      const base: EditDraft = cur ?? {
        open: true,
        plain: c.bodyPlain ?? "",
        doc: isTipTapDoc(c.bodyRich) ? c.bodyRich : null,
        posting: false,
        err: "",
      };
      return {
        ...prev,
        [c.id]: {
          ...base,
          open: true,
          // refresh from current comment snapshot when opening
          plain: c.bodyPlain ?? base.plain,
          doc: isTipTapDoc(c.bodyRich) ? c.bodyRich : base.doc,
          err: "",
        },
      };
    });
  }

  function closeEdit(commentId: string) {
    setEditByCommentId((prev) => {
      if (!prev[commentId]) return prev;
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
  }

  async function submitEdit(c: CommentDTO) {
    if (!canPost) {
      setThreadErr("Patron or Partner required to edit.");
      return;
    }
    if (isLocked) {
      setThreadErr("Thread is locked.");
      return;
    }
    if (!thread) {
      setThreadErr("Thread not loaded yet.");
      return;
    }
    if (!viewerMemberId || c.createdByMemberId !== viewerMemberId) {
      setThreadErr("You can only edit your own comments.");
      return;
    }
    if (c.status !== "live") {
      setThreadErr("Only live comments can be edited.");
      return;
    }

    const draft0 = editByCommentId[c.id];
    if (!draft0 || !draft0.open) return;

    const text = (draft0.plain ?? "").trim();
    if (!text) {
      setEditByCommentId((prev) => ({
        ...prev,
        [c.id]: { ...draft0, err: "Edit is empty." },
      }));
      return;
    }

    setEditByCommentId((prev) => ({
      ...prev,
      [c.id]: { ...draft0, posting: true, err: "" },
    }));
    setThreadErr("");

    const doc =
      draft0.doc ??
      ({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text }] }],
      } as const);

    try {
      const r = await fetch("/api/exegesis/comment/edit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          commentId: c.id,
          bodyPlain: text, // rollout: keep sending
          bodyRich: doc,
        }),
      });

      const j = (await r.json()) as CommentEditOk | CommentEditErr;

      if (!j.ok) {
        setEditByCommentId((prev) => ({
          ...prev,
          [c.id]: { ...draft0, posting: false, err: j.error || "Edit failed." },
        }));
        return;
      }

      // optimistic patch: replace the edited comment by id everywhere
      setThread((prev) => {
        if (!prev) return prev;

        const roots = (prev.roots ?? []).map((root) => ({
          ...root,
          comments: (root.comments ?? []).map((x) =>
            x.id === j.comment.id ? { ...x, ...j.comment } : x,
          ),
        }));

        return { ...prev, roots, meta: j.meta };
      });

      // close editor
      closeEdit(c.id);
    } finally {
      setEditByCommentId((prev) => {
        const cur = prev[c.id];
        if (!cur) return prev;
        if (!cur.posting) return prev;
        return { ...prev, [c.id]: { ...cur, posting: false } };
      });
    }
  }

  async function submitReport(commentId: string) {
    if (!canReport) return;

    const draft = reportByCommentId[commentId];
    if (!draft) return;

    const category = (draft.category ?? "").trim();
    const reason = (draft.reason ?? "").trim();

    setReportByCommentId((prev) => ({
      ...prev,
      [commentId]: { ...draft, busy: true, err: "" },
    }));

    try {
      const r = await fetch("/api/exegesis/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentId, category, reason }),
      });

      const j = (await r.json()) as ReportOk | ReportErr;

      if (!j.ok) {
        setReportByCommentId((prev) => ({
          ...prev,
          [commentId]: {
            ...draft,
            busy: false,
            err: j.error || "Report failed.",
          },
        }));
        return;
      }

      setReportByCommentId((prev) => ({
        ...prev,
        [commentId]: { ...draft, busy: false, done: true, err: "" },
      }));
    } catch {
      setReportByCommentId((prev) => ({
        ...prev,
        [commentId]: { ...draft, busy: false, err: "Report failed." },
      }));
    }
  }

  async function submitClaimName() {
    if (!canClaimName) return;

    const name = claimName.trim();
    if (!name) return;

    setClaimBusy(true);
    setClaimErr("");
    try {
      const r = await fetch("/api/exegesis/identity/claim-name", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicName: name }),
      });

      const j = (await r.json()) as
        | { ok: true; identity: IdentityDTO }
        | { ok: false; error: string; code?: string };

      if (!j.ok) {
        setClaimErr(j.error || "Failed to claim name.");
        return;
      }

      setThread((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          identities: {
            ...prev.identities,
            [j.identity.memberId]: j.identity,
          },
        };
      });

      setClaimOpen(false);
      setClaimName("");
    } finally {
      setClaimBusy(false);
    }
  }

  const threadScrollRef = React.useRef<HTMLDivElement | null>(null);
  const pendingScrollCommentIdRef = React.useRef<string>("");

  React.useEffect(() => {
    const cues = lyrics.cues ?? [];
    if (cues.length === 0) return;

    const h = parseHash();
    const byLineKey = h.lineKey
      ? cues.find((c) => c.lineKey === h.lineKey)
      : null;

    const pick = byLineKey ?? cues[0];

    setSelected({
      lineKey: pick.lineKey,
      lineText: pick.text,
      tMs: pick.tMs,
    });

    if (h.commentId) pendingScrollCommentIdRef.current = h.commentId;
  }, [lyrics.trackId, lyrics.cues]);

  const threadKey = thread
    ? `${thread.trackId}::${thread.groupKey}::${thread.meta?.commentCount ?? 0}`
    : "";

  React.useEffect(() => {
    const cid = pendingScrollCommentIdRef.current;
    if (!cid) return;
    if (!threadKey) return;

    const t = window.setTimeout(() => {
      const el = document.getElementById(`exegesis-c-${cid}`);
      if (el) {
        el.scrollIntoView({ block: "start", behavior: "smooth" });
        pendingScrollCommentIdRef.current = "";
      }
    }, 40);

    return () => window.clearTimeout(t);
  }, [threadKey]);

  React.useEffect(() => {
    let alive = true;

    async function run() {
      if (!selected?.lineKey) return;

      const url =
        `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
        `&lineKey=${encodeURIComponent(selected.lineKey)}` +
        `&sort=${encodeURIComponent(sort)}`;

      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as ThreadApiOk | ThreadApiErr;
        if (!alive) return;

        if (!j.ok) {
          if (j.code === "ANON_LIMIT") {
            setThreadErr(
              j.error ||
                "You’ve hit the anon reading limit. Sign in to continue.",
            );
          } else {
            setThreadErr(j.error || "Failed to load thread.");
          }
          return;
        }

        setThread(j);
        setThreadErr("");
      } catch {
        if (!alive) return;
        setThreadErr("Failed to load thread.");
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [trackId, selected?.lineKey, sort]);

  async function postComment() {
    if (!selected) return;
    if (!canPost) {
      setThreadErr("Patron or Partner required to post.");
      return;
    }

    if (thread?.meta?.locked) {
      setThreadErr("Thread is locked.");
      return;
    }

    const groupKey = (thread?.groupKey ?? "").trim();
    if (!groupKey) {
      setThreadErr("Thread not loaded yet.");
      return;
    }

    const text = draft.trim();
    if (!text) return;

    setPosting(true);
    setThreadErr("");

    try {
      const doc =
        draftDoc ??
        ({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text }],
            },
          ],
        } as const);
      const r = await fetch("/api/exegesis/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId,
          lineKey: selected.lineKey,
          groupKey: (thread?.groupKey ?? "").trim(), // server-canonical key for this anchor
          parentId: null,

          // Keep bodyPlain during rollout (server should ignore it when bodyRich is present)
          bodyPlain: text,
          bodyRich: doc,

          tMs: selected.tMs,
          lineTextSnapshot: selected.lineText,
          lyricsVersion: lyrics.version ?? null,
        }),
      });

      const j = (await r.json()) as
        | CommentPostOk
        | { ok: false; error: string };

      if (!j.ok) {
        setThreadErr(j.error || "Failed to post comment.");
        return;
      }

      setDraft("");
      setDraftDoc(null);

      pendingScrollCommentIdRef.current = j.comment.id;
      setHash({ lineKey: selected.lineKey, commentId: j.comment.id });

      // If we already have a thread loaded, we can optimistically insert.
      // If not, do NOT fabricate viewer state; rely on refetch.
      setThread((prev) => {
        if (!prev) return prev;
        if (prev.trackId !== j.trackId || prev.groupKey !== j.groupKey)
          return prev;

        const newRoot = { rootId: j.comment.rootId, comments: [j.comment] };
        return {
          ...prev,
          meta: j.meta,
          roots: [newRoot, ...prev.roots],
          identities: { ...prev.identities, ...j.identities },
        };
      });

      // Reconcile with server truth
      const url =
        `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
        `&groupKey=${encodeURIComponent(groupKey)}` +
        `&sort=${encodeURIComponent(sort)}`;

      fetch(url, { cache: "no-store" })
        .then((r2) => r2.json())
        .then((jj: ThreadApiOk | ThreadApiErr) => {
          if (jj && (jj as ThreadApiOk).ok) {
            setThread(jj as ThreadApiOk);
            setThreadErr("");
          }
        })
        .catch(() => {});
    } finally {
      setPosting(false);
    }
  }

  async function postReply(parentComment: CommentDTO) {
    if (!selected) return;
    if (!canPost) {
      setThreadErr("Patron or Partner required to post.");
      return;
    }
    if (isLocked) {
      setThreadErr("Thread is locked.");
      return;
    }
    if (!thread) {
      setThreadErr("Thread not loaded yet.");
      return;
    }

    const parentId = parentComment.id;
    const draft0 = replyByCommentId[parentId];
    if (!draft0 || !draft0.open) return;

    const text = (draft0.plain ?? "").trim();
    if (!text) {
      setReplyByCommentId((prev) => ({
        ...prev,
        [parentId]: { ...draft0, err: "Reply is empty." },
      }));
      return;
    }

    // depth cap: server enforces, but keep UI aligned
    if ((parentComment.depth ?? 0) + 1 > 6) {
      setReplyByCommentId((prev) => ({
        ...prev,
        [parentId]: { ...draft0, err: "Thread depth limit reached." },
      }));
      return;
    }

    setReplyByCommentId((prev) => ({
      ...prev,
      [parentId]: { ...draft0, posting: true, err: "" },
    }));
    setThreadErr("");

    const groupKey = (thread.groupKey ?? "").trim();

    try {
      const doc =
        draft0.doc ??
        ({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text }],
            },
          ],
        } as const);

      const r = await fetch("/api/exegesis/comment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId,
          lineKey: selected.lineKey,
          groupKey, // drift guard
          parentId,

          // rollout: still send bodyPlain; server derives when bodyRich present
          bodyPlain: text,
          bodyRich: doc,

          tMs: selected.tMs,
          lineTextSnapshot: selected.lineText,
          lyricsVersion: lyrics.version ?? null,
        }),
      });

      const j = (await r.json()) as
        | CommentPostOk
        | { ok: false; error: string };

      if (!j.ok) {
        setReplyByCommentId((prev) => ({
          ...prev,
          [parentId]: {
            ...draft0,
            posting: false,
            err: j.error || "Reply failed.",
          },
        }));
        return;
      }

      // clear reply draft
      setReplyByCommentId((prev) => ({
        ...prev,
        [parentId]: {
          ...draft0,
          posting: false,
          open: false,
          plain: "",
          doc: null,
          err: "",
        },
      }));

      pendingScrollCommentIdRef.current = j.comment.id;
      setHash({ lineKey: selected.lineKey, commentId: j.comment.id });

      // optimistic insert into the correct root bucket (append chronologically)
      setThread((prev) => {
        if (!prev) return prev;
        if (prev.trackId !== j.trackId || prev.groupKey !== j.groupKey)
          return prev;

        const roots = (prev.roots ?? []).map((root) => {
          if (root.rootId !== j.comment.rootId) return root;
          return { ...root, comments: [...(root.comments ?? []), j.comment] };
        });

        // if we didn't find the root (shouldn't happen), fall back by creating it
        const found = roots.some((r0) => r0.rootId === j.comment.rootId);
        const roots2 = found
          ? roots
          : roots.concat([{ rootId: j.comment.rootId, comments: [j.comment] }]);

        return {
          ...prev,
          meta: j.meta,
          roots: roots2,
          identities: { ...prev.identities, ...j.identities },
        };
      });

      // reconcile with server truth (same as root post)
      const url =
        `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
        `&groupKey=${encodeURIComponent(groupKey)}` +
        `&sort=${encodeURIComponent(sort)}`;

      fetch(url, { cache: "no-store" })
        .then((r2) => r2.json())
        .then((jj: ThreadApiOk | ThreadApiErr) => {
          if (jj && (jj as ThreadApiOk).ok) {
            setThread(jj as ThreadApiOk);
            setThreadErr("");
          }
        })
        .catch(() => {});
    } finally {
      // ensure posting flag is cleared even on throw
      setReplyByCommentId((prev) => {
        const cur = prev[parentId];
        if (!cur) return prev;
        if (!cur.posting) return prev;
        return { ...prev, [parentId]: { ...cur, posting: false } };
      });
    }
  }

  async function toggleVote(commentId: string) {
    if (!thread) return;

    if (!canVote) {
      setThreadErr(
        thread.viewer.kind === "anon"
          ? "Sign in to vote."
          : "Friend tier or higher required to vote.",
      );
      return;
    }

    setThreadErr("");

    // optimistic update
    setThread((prev) => {
      if (!prev) return prev;
      const roots = prev.roots.map((r) => ({
        ...r,
        comments: r.comments.map((c) => {
          if (c.id !== commentId) return c;
          const nextHas = !c.viewerHasVoted;
          const nextCount = Math.max(0, c.voteCount + (nextHas ? 1 : -1));
          return { ...c, viewerHasVoted: nextHas, voteCount: nextCount };
        }),
      }));
      return { ...prev, roots };
    });

    const r = await fetch("/api/exegesis/vote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ commentId }),
    });

    const j = (await r.json()) as VoteOk | VoteErr;
    if (!j.ok) {
      setThreadErr(j.error || "Vote failed.");

      // refetch authoritative thread
      if (selected) {
        const gk = (thread?.groupKey ?? "").trim();
        const url =
          `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
          (gk
            ? `&groupKey=${encodeURIComponent(gk)}`
            : `&lineKey=${encodeURIComponent(selected.lineKey)}`) +
          `&sort=${encodeURIComponent(sort)}`;
        const rr = await fetch(url, { cache: "no-store" });
        const jj = (await rr.json()) as ThreadApiOk | ThreadApiErr;
        if (jj.ok) {
          setThread(jj);
          setThreadErr("");
        }
      }
      return;
    }

    setThread((prev) => {
      if (!prev) return prev;
      const roots = prev.roots.map((r0) => ({
        ...r0,
        comments: r0.comments.map((c) =>
          c.id === j.commentId
            ? { ...c, viewerHasVoted: j.viewerHasVoted, voteCount: j.voteCount }
            : c,
        ),
      }));
      return { ...prev, roots };
    });
  }

  const identityLabel =
    viewerIdentity?.publicName || viewerIdentity?.anonLabel || "";

  const showIdentityPanel =
    thread?.viewer.kind === "member" && !!viewerMemberId && !!viewerIdentity;

  const rootsForRender = React.useMemo(() => {
    const roots = thread?.roots ?? [];
    const pinnedId = meta?.pinnedCommentId ?? null;
    return reorderRootsPinnedFirst(roots, pinnedId);
  }, [thread?.roots, meta?.pinnedCommentId]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-xs opacity-60 tracking-[0.14em]">EXEGESIS</div>
          <h1 className="mt-1 text-xl font-semibold">
            Track:{" "}
            <span className="opacity-90">
              {(props.trackTitle ?? "").trim() || lyrics.trackId}
            </span>
          </h1>

          {(props.trackArtist ?? "").trim() ? (
            <div className="mt-1 text-sm opacity-70">{props.trackArtist}</div>
          ) : null}
          <div className="mt-1 text-sm opacity-70">
            Lyrics version: {lyrics.version} · Offset: {lyrics.offsetMs}ms
          </div>
          {lyrics.geniusUrl ? (
            <div className="mt-1 text-sm opacity-75">
              <a
                href={lyrics.geniusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Genius link
              </a>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${
              sort === "top" ? "bg-white/10" : "bg-white/5"
            }`}
            onClick={() => setSort("top")}
          >
            Top
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm ${
              sort === "recent" ? "bg-white/10" : "bg-white/5"
            }`}
            onClick={() => setSort("recent")}
          >
            Recent
          </button>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_420px]">
        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm opacity-70">Lyrics</div>
          <div className="mt-3 space-y-1">
            {(lyrics.cues ?? []).map((c) => {
              const active = selected?.lineKey === c.lineKey;
              return (
                <button
                  key={c.lineKey}
                  className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                    active ? "bg-white/10" : "bg-transparent hover:bg-white/5"
                  }`}
                  onClick={() => {
                    setSelected({
                      lineKey: c.lineKey,
                      lineText: c.text,
                      tMs: c.tMs,
                    });
                    setHash({ lineKey: c.lineKey });
                  }}
                >
                  <div className="text-[11px] opacity-55">
                    {c.lineKey} · {c.tMs}ms
                  </div>
                  <div className="mt-0.5 opacity-90">{c.text}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl bg-white/5 p-4">
          <div className="text-sm opacity-70">Thread</div>
          {isLocked ? (
            <div className="mt-2 rounded-md bg-white/5 p-3 text-sm">
              <div className="opacity-80">This thread is locked.</div>
              <div className="mt-1 text-xs opacity-60">
                You can still read and vote (if enabled), but posting is
                disabled.
              </div>
            </div>
          ) : null}

          {selected ? (
            <div className="mt-2 rounded-md bg-black/20 p-3 text-sm">
              <div className="opacity-70">Selected line</div>
              <div className="mt-1">{selected.lineText}</div>
              <div className="mt-1 text-xs opacity-60">
                GroupKey:{" "}
                <span className="opacity-80">{thread?.groupKey ?? "—"}</span>
              </div>
            </div>
          ) : null}

          {showIdentityPanel ? (
            <div className="mt-3 rounded-md bg-black/20 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="opacity-70">Your identity</div>

                <button
                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                  disabled={!canClaimName}
                  onClick={() => {
                    setClaimErr("");
                    setClaimOpen((v) => !v);
                  }}
                  title={
                    canClaimName
                      ? "Claim a public name"
                      : "Claiming unlocks after contributions"
                  }
                >
                  {viewerIdentity?.publicName ? "Edit" : "Claim"} name
                </button>
              </div>

              <div className="mt-1 text-sm">
                Showing as{" "}
                <span className="font-semibold">{identityLabel}</span>
              </div>

              {!viewerIdentity?.publicName ? (
                <div className="mt-1 text-xs opacity-60">
                  Progress: {viewerIdentity?.contributionCount ?? 0}/5
                  contributions
                  {canClaimName ? " · Unlocked" : ""}
                </div>
              ) : null}

              {claimOpen ? (
                <div className="mt-3 space-y-2">
                  <input
                    className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
                    placeholder="Choose a public name"
                    value={claimName}
                    onChange={(e) => setClaimName(e.target.value)}
                  />
                  {claimErr ? (
                    <div className="text-xs opacity-70">{claimErr}</div>
                  ) : null}
                  <div className="flex items-center justify-end gap-2">
                    <button
                      className="rounded-md bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                      onClick={() => {
                        setClaimOpen(false);
                        setClaimErr("");
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                      disabled={!canClaimName || !claimName.trim() || claimBusy}
                      onClick={() => void submitClaimName()}
                    >
                      {claimBusy ? "Saving…" : "Claim"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {threadErr ? (
            <div className="mt-3 rounded-md bg-white/5 p-3 text-sm">
              {threadErr}
            </div>
          ) : null}

          <div
            ref={threadScrollRef}
            className="mt-3 space-y-3"
            style={{
              maxHeight: 520,
              overflowY: "auto",
              overscrollBehavior: "contain",
            }}
          >
            <div className="mt-3 space-y-3">
              {(thread?.roots ?? []).length === 0 ? (
                <div className="text-sm opacity-60">No comments yet.</div>
              ) : (
                (rootsForRender ?? []).map((root) => (
                  <div key={root.rootId} className="rounded-md bg-black/20 p-3">
                    {root.comments.map((c) => {
                      const ident = thread?.identities?.[c.createdByMemberId];
                      const name =
                        ident?.publicName || ident?.anonLabel || "Anonymous";
                      const replyBusy = Boolean(
                        replyByCommentId[c.id]?.posting,
                      );
                      const isAuthor =
                        !!viewerMemberId &&
                        c.createdByMemberId === viewerMemberId;
                      const canEdit =
                        canPost && !isLocked && isAuthor && c.status === "live";

                      const editBusy = Boolean(editByCommentId[c.id]?.posting);

                      // Phase A safety: respect status
                      if (c.status === "deleted") return null;

                      return (
                        <div
                          id={`exegesis-c-${c.id}`}
                          key={c.id}
                          className="py-2 scroll-mt-4"
                          style={{
                            paddingLeft: Math.min(24, (c.depth ?? 0) * 12),
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className="text-xs opacity-70">{name}</div>
                              {c.editedAt || (c.editCount ?? 0) > 0 ? (
                                <div className="text-[11px] opacity-50">
                                  edited
                                </div>
                              ) : null}
                            </div>

                            <div className="flex items-center gap-2">
                              {canVote ? (
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() => void toggleVote(c.id)}
                                  title="Vote"
                                >
                                  {c.viewerHasVoted ? "Voted" : "Vote"} ·{" "}
                                  {c.voteCount}
                                </button>
                              ) : (
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs opacity-70"
                                  disabled
                                  title={
                                    thread?.viewer.kind === "anon"
                                      ? "Sign in to vote"
                                      : "Friend tier or higher required to vote"
                                  }
                                >
                                  Vote · {c.voteCount}
                                </button>
                              )}

                              {canReport ? (
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() => openReport(c.id)}
                                  title="Report"
                                >
                                  Report
                                </button>
                              ) : null}

                              {canEdit ? (
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                  disabled={editBusy || replyBusy}
                                  onClick={() => openEdit(c)}
                                  title="Edit"
                                >
                                  Edit
                                </button>
                              ) : null}

                              {canPost && !isLocked ? (
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                  disabled={
                                    replyBusy ||
                                    c.status !== "live" ||
                                    c.depth >= 6
                                  }
                                  onClick={() => openReply(c.id)}
                                  title={
                                    c.depth >= 6
                                      ? "Max thread depth reached"
                                      : "Reply"
                                  }
                                >
                                  Reply
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {c.status === "hidden" ? (
                            <div className="mt-1 text-sm opacity-60 italic">
                              This comment is hidden.
                            </div>
                          ) : (
                            <div className="mt-1">
                              {isTipTapDoc(c.bodyRich) ? (
                                <TipTapReadOnly doc={c.bodyRich} />
                              ) : (
                                <div className="text-sm whitespace-pre-wrap">
                                  {c.bodyPlain}
                                </div>
                              )}
                            </div>
                          )}

                          {canPost &&
                          !isLocked &&
                          canEdit &&
                          editByCommentId[c.id]?.open ? (
                            <div className="mt-2 rounded-md bg-black/25 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs opacity-70">Edit</div>
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() => closeEdit(c.id)}
                                >
                                  Close
                                </button>
                              </div>

                              <div className="mt-2">
                                <TipTapEditor
                                  valuePlain={
                                    editByCommentId[c.id]?.plain ?? ""
                                  }
                                  valueDoc={editByCommentId[c.id]?.doc ?? null}
                                  disabled={editByCommentId[c.id]?.posting}
                                  onChangePlain={(plain) =>
                                    setEditByCommentId((prev) => ({
                                      ...prev,
                                      [c.id]: {
                                        ...(prev[c.id] as EditDraft),
                                        plain,
                                        err: "",
                                      },
                                    }))
                                  }
                                  onChangeDoc={(doc) =>
                                    setEditByCommentId((prev) => ({
                                      ...prev,
                                      [c.id]: {
                                        ...(prev[c.id] as EditDraft),
                                        doc,
                                        err: "",
                                      },
                                    }))
                                  }
                                />
                              </div>

                              {editByCommentId[c.id]?.err ? (
                                <div className="mt-2 text-xs opacity-75">
                                  {editByCommentId[c.id]?.err}
                                </div>
                              ) : null}

                              <div className="mt-2 flex items-center justify-between">
                                <div className="text-xs opacity-60">
                                  {
                                    (editByCommentId[c.id]?.plain ?? "").trim()
                                      .length
                                  }
                                  /5000
                                </div>
                                <button
                                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                                  disabled={
                                    editByCommentId[c.id]?.posting ||
                                    !(editByCommentId[c.id]?.plain ?? "").trim()
                                  }
                                  onClick={() => void submitEdit(c)}
                                >
                                  {editByCommentId[c.id]?.posting
                                    ? "Saving…"
                                    : "Save edit"}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {canPost &&
                          !isLocked &&
                          replyByCommentId[c.id]?.open ? (
                            <div className="mt-2 rounded-md bg-black/25 p-3">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-xs opacity-70">Reply</div>
                                <button
                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                  onClick={() => closeReply(c.id)}
                                >
                                  Close
                                </button>
                              </div>

                              <div className="mt-2">
                                <TipTapEditor
                                  valuePlain={
                                    replyByCommentId[c.id]?.plain ?? ""
                                  }
                                  disabled={replyByCommentId[c.id]?.posting}
                                  onChangePlain={(plain) =>
                                    setReplyByCommentId((prev) => ({
                                      ...prev,
                                      [c.id]: {
                                        ...(prev[c.id] as ReplyDraft),
                                        plain,
                                        err: "",
                                      },
                                    }))
                                  }
                                  onChangeDoc={(doc) =>
                                    setReplyByCommentId((prev) => ({
                                      ...prev,
                                      [c.id]: {
                                        ...(prev[c.id] as ReplyDraft),
                                        doc,
                                        err: "",
                                      },
                                    }))
                                  }
                                />
                              </div>

                              {replyByCommentId[c.id]?.err ? (
                                <div className="mt-2 text-xs opacity-75">
                                  {replyByCommentId[c.id]?.err}
                                </div>
                              ) : null}

                              <div className="mt-2 flex items-center justify-between">
                                <div className="text-xs opacity-60">
                                  {
                                    (replyByCommentId[c.id]?.plain ?? "").trim()
                                      .length
                                  }
                                  /5000
                                </div>
                                <button
                                  className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                                  disabled={
                                    replyByCommentId[c.id]?.posting ||
                                    !(
                                      replyByCommentId[c.id]?.plain ?? ""
                                    ).trim()
                                  }
                                  onClick={() => void postReply(c)}
                                >
                                  {replyByCommentId[c.id]?.posting
                                    ? "Posting…"
                                    : "Post reply"}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {canReport && reportByCommentId[c.id]?.open ? (
                            <div className="mt-2 rounded-md bg-black/25 p-3 text-sm">
                              {reportByCommentId[c.id]?.done ? (
                                <div className="text-xs opacity-75">
                                  Report submitted. Thanks — this helps keep the
                                  discourse usable.
                                </div>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-xs opacity-70">
                                      Report this comment
                                    </div>
                                    <button
                                      className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                      onClick={() => closeReport(c.id)}
                                    >
                                      Close
                                    </button>
                                  </div>

                                  <div className="mt-2 grid gap-2">
                                    <select
                                      className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
                                      value={
                                        reportByCommentId[c.id]?.category ??
                                        "spam"
                                      }
                                      onChange={(e) =>
                                        setReportByCommentId((prev) => ({
                                          ...prev,
                                          [c.id]: {
                                            ...(prev[c.id] as ReportDraft),
                                            category: e.target.value,
                                            err: "",
                                          },
                                        }))
                                      }
                                    >
                                      {REPORT_CATEGORIES.map((opt) => (
                                        <option key={opt.key} value={opt.key}>
                                          {opt.label}
                                        </option>
                                      ))}
                                    </select>

                                    <textarea
                                      className="min-h-[90px] w-full rounded-md bg-black/20 p-3 text-sm outline-none"
                                      placeholder="Describe the issue (20–300 chars)."
                                      value={
                                        reportByCommentId[c.id]?.reason ?? ""
                                      }
                                      onChange={(e) =>
                                        setReportByCommentId((prev) => ({
                                          ...prev,
                                          [c.id]: {
                                            ...(prev[c.id] as ReportDraft),
                                            reason: e.target.value,
                                            err: "",
                                          },
                                        }))
                                      }
                                    />

                                    {reportByCommentId[c.id]?.err ? (
                                      <div className="text-xs opacity-75">
                                        {reportByCommentId[c.id]?.err}
                                      </div>
                                    ) : null}

                                    <div className="flex items-center justify-between">
                                      <div className="text-xs opacity-60">
                                        {
                                          (
                                            reportByCommentId[c.id]?.reason ??
                                            ""
                                          ).trim().length
                                        }
                                        /300
                                      </div>
                                      <button
                                        className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                                        disabled={
                                          reportByCommentId[c.id]?.busy ||
                                          (
                                            reportByCommentId[c.id]?.reason ??
                                            ""
                                          ).trim().length < 20 ||
                                          (
                                            reportByCommentId[c.id]?.reason ??
                                            ""
                                          ).trim().length > 300
                                        }
                                        onClick={() => void submitReport(c.id)}
                                      >
                                        {reportByCommentId[c.id]?.busy
                                          ? "Submitting…"
                                          : "Submit report"}
                                      </button>
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4">
            <TipTapEditor
              valuePlain={draft}
              disabled={!canPost || isLocked}
              onChangePlain={(plain) => setDraft(plain)}
              onChangeDoc={(doc) => setDraftDoc(doc)}
            />
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="text-xs opacity-60">
                {draft.trim().length}/5000
              </div>
              <button
                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                disabled={
                  !canPost || isLocked || !selected || !draft.trim() || posting
                }
                onClick={() => void postComment()}
              >
                {posting ? "Posting…" : "Post"}
              </button>
            </div>

            {thread?.viewer.kind === "anon" ? (
              <div className="mt-2 text-xs opacity-60">
                Tip: sign in to vote; upgrade to post.
              </div>
            ) : !canPost ? (
              <div className="mt-2 text-xs opacity-60">
                Posting requires Patron or Partner.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
