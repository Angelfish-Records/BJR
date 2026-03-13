// web/app/(site)/exegesis/[displayId]/hooks/useExegesisThread.ts
"use client";

import React from "react";
import { gateResultFromPayload } from "@/app/home/gating/fromPayload";
import type { GateResult } from "@/app/home/gating/gate";
import type {
  CommentDTO,
  CommentEditErr,
  CommentEditOk,
  CommentPostOk,
  EditDraft,
  IdentityDTO,
  ReplyDraft,
  ReportDraft,
  ReportErr,
  ReportOk,
  ThreadApiErr,
  ThreadApiOk,
  ThreadSort,
  VoteErr,
  VoteOk,
} from "../exegesisTypes";
import type { ExegesisSelectedLine } from "./useExegesisHashState";
import {
  reorderRootsPinnedFirst,
  rootRecentTs,
  rootTopScore,
} from "../exegesisUi";
import { useBadgeAwardOverlay } from "@/app/home/badges/BadgeAwardOverlayProvider";
import { normalizeBadgeAwardNotices } from "@/app/home/badges/badgeAwardTypes";

export default function useExegesisThread(props: {
  recordingId: string;
  lyricsVersion: string | null | undefined;
  selected: ExegesisSelectedLine | null;
  sort: ThreadSort;
  userId: string | null | undefined;
  authLoaded: boolean;
  inlineGateOpen: boolean;
  applyGateResult: (res: GateResult, opts?: { dismissible?: boolean }) => void;
  onAuthChangedClearGate: () => void;
  setHash: (next: {
    lineKey?: string;
    commentId?: string;
    rootId?: string;
  }) => void;
  pendingScrollCommentIdRef: React.MutableRefObject<string>;
  focusedRootId: string;
  draft: string;
  draftDoc: unknown | null;
  setDraft: React.Dispatch<React.SetStateAction<string>>;
  setDraftDoc: React.Dispatch<React.SetStateAction<unknown | null>>;
  setPosting: React.Dispatch<React.SetStateAction<boolean>>;
  replyByCommentId: Record<string, ReplyDraft>;
  setReplyByCommentId: React.Dispatch<
    React.SetStateAction<Record<string, ReplyDraft>>
  >;
  editByCommentId: Record<string, EditDraft>;
  setEditByCommentId: React.Dispatch<
    React.SetStateAction<Record<string, EditDraft>>
  >;
  reportByCommentId: Record<string, ReportDraft>;
  setReportByCommentId: React.Dispatch<
    React.SetStateAction<Record<string, ReportDraft>>
  >;
  claimName: string;
  setClaimName: React.Dispatch<React.SetStateAction<string>>;
  setClaimOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setClaimErr: React.Dispatch<React.SetStateAction<string>>;
  setClaimBusy: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    recordingId,
    lyricsVersion,
    selected,
    sort,
    userId,
    authLoaded,
    inlineGateOpen,
    applyGateResult,
    onAuthChangedClearGate,
    setHash,
    pendingScrollCommentIdRef,
    focusedRootId,
    draft,
    draftDoc,
    setDraft,
    setDraftDoc,
    setPosting,
    replyByCommentId,
    setReplyByCommentId,
    editByCommentId,
    setEditByCommentId,
    reportByCommentId,
    setReportByCommentId,
    claimName,
    setClaimName,
    setClaimOpen,
    setClaimErr,
    setClaimBusy,
  } = props;

  const [thread, setThread] = React.useState<ThreadApiOk | null>(null);
  const [threadErr, setThreadErr] = React.useState<string>("");
  const [threadLoading, setThreadLoading] = React.useState<boolean>(false);
  const [threadLoadedKey, setThreadLoadedKey] = React.useState<string>("");
  const { announceBadges } = useBadgeAwardOverlay();

  const isAnon = authLoaded ? !userId : false;
  const viewerKey = userId ?? "anon";

  const threadWantedCoreKey = React.useMemo(() => {
    const lk = (selected?.lineKey ?? "").trim();
    const gk = (selected?.groupKey ?? "").trim();
    if (!recordingId || !lk) return "";
    return `${recordingId}::${lk}::${gk}::${viewerKey}`;
  }, [recordingId, selected?.lineKey, selected?.groupKey, viewerKey]);

  const threadWantedFetchKey = threadWantedCoreKey;

  const threadUI =
    thread &&
    threadLoadedKey &&
    threadWantedCoreKey &&
    threadLoadedKey === threadWantedCoreKey
      ? thread
      : null;

  const shouldShowInitialShimmer =
    Boolean(threadWantedCoreKey) && !threadUI && !threadErr && threadLoading;

  const viewerMemberId =
    threadUI?.viewer?.kind === "member" ? threadUI.viewer.memberId : "";

  const viewerIdentity: IdentityDTO | undefined = viewerMemberId
    ? threadUI?.identities?.[viewerMemberId]
    : undefined;

  const meta = threadUI?.meta ?? null;
  const isLocked = Boolean(meta?.locked);

  const canVote =
    threadUI?.viewer?.kind === "member"
      ? threadUI.viewer.cap.canVote && !isLocked
      : false;

  const canReport =
    threadUI?.viewer?.kind === "member" ? threadUI.viewer.cap.canReport : false;

  const canPost =
    threadUI?.viewer?.kind === "member" ? threadUI.viewer.cap.canPost : false;

  const canClaimName =
    threadUI?.viewer?.kind === "member"
      ? threadUI.viewer.cap.canClaimName
      : false;

  const rootsForRender = React.useMemo(() => {
    const roots = [...(threadUI?.roots ?? [])];
    roots.sort((a, b) => {
      if (sort === "recent") return rootRecentTs(b) - rootRecentTs(a);
      return rootTopScore(b) - rootTopScore(a);
    });
    const pinnedId = meta?.pinnedCommentId ?? null;
    return reorderRootsPinnedFirst(roots, pinnedId);
  }, [threadUI?.roots, meta?.pinnedCommentId, sort]);

  const threadKey = thread
    ? `${thread.recordingId}::${thread.groupKey}::${thread.meta?.commentCount ?? 0}`
    : "";

  const prevUserIdRef = React.useRef<string | null>(null);

  const announceAwardPayload = React.useCallback(
    (payload: unknown) => {
      const badges = normalizeBadgeAwardNotices(payload);
      if (badges.length === 0) return;
      announceBadges(badges);
    },
    [announceBadges],
  );

  React.useEffect(() => {
    const prev = prevUserIdRef.current;
    const next = userId ?? null;
    prevUserIdRef.current = next;

    if (prev === next) return;

    setThreadLoadedKey("");
    setThreadErr("");
    setThread(null);
    onAuthChangedClearGate();
  }, [userId, onAuthChangedClearGate]);

  React.useEffect(() => {
    let alive = true;

    async function run() {
      if (!selected?.lineKey) return;
      if (inlineGateOpen) return;

      const wantedFetch = threadWantedFetchKey;
      const wantedCore = threadWantedCoreKey;
      if (!wantedFetch || !wantedCore) return;

      setThreadLoading(true);
      setThreadErr("");

      const gk = (selected.groupKey ?? "").trim();

      const url =
        `/api/exegesis/thread?recordingId=${encodeURIComponent(recordingId)}` +
        (gk
          ? `&groupKey=${encodeURIComponent(gk)}&lineKey=${encodeURIComponent(
              selected.lineKey,
            )}`
          : `&lineKey=${encodeURIComponent(selected.lineKey)}`);

      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as ThreadApiOk | ThreadApiErr;
        if (!alive) return;

        if (!j.ok) {
          setThread((prev) => (prev ? prev : null));

          if (j.gate) {
            const res = gateResultFromPayload({
              payload: j.gate,
              attempt: { verb: "readFullThread", domain: "exegesis" },
              isSignedIn: Boolean(userId),
              intent: "passive",
            });

            if (res.ok) {
              setThreadErr(j.error || "Failed to load thread.");
              return;
            }

            applyGateResult(res);
            setThreadErr("");
            return;
          }

          setThreadErr(j.error || "Failed to load thread.");
          return;
        }

        setThread(j);
        setThreadErr("");
        setThreadLoadedKey(wantedCore);
      } catch {
        if (!alive) return;
        setThread((prev) => (prev ? prev : null));
        setThreadErr("Failed to load thread.");
      } finally {
        if (!alive) return;
        setThreadLoading(false);
      }
    }

    void run();
    return () => {
      alive = false;
    };
  }, [
    recordingId,
    selected?.lineKey,
    selected?.groupKey,
    threadWantedFetchKey,
    threadWantedCoreKey,
    userId,
    inlineGateOpen,
    applyGateResult,
  ]);

  function closeEdit(commentId: string) {
    setEditByCommentId((prev) => {
      if (!prev[commentId]) return prev;
      const next = { ...prev };
      delete next[commentId];
      return next;
    });
  }

  async function submitReport(commentId: string) {
    if (!canReport) return;

    const draft0 = reportByCommentId[commentId];
    if (!draft0) return;

    const category = (draft0.category ?? "").trim();
    const reason = (draft0.reason ?? "").trim();

    setReportByCommentId((prev) => ({
      ...prev,
      [commentId]: { ...draft0, busy: true, err: "" },
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
            ...draft0,
            busy: false,
            err: j.error || "Report failed.",
          },
        }));
        return;
      }

      setReportByCommentId((prev) => ({
        ...prev,
        [commentId]: { ...draft0, busy: false, done: true, err: "" },
      }));
    } catch {
      setReportByCommentId((prev) => ({
        ...prev,
        [commentId]: { ...draft0, busy: false, err: "Report failed." },
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
      const r = await fetch("/api/identity/claim-name", {
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

      setClaimErr("");
      setClaimOpen(false);
      setClaimName("");
    } catch {
      setClaimErr("Failed to claim name.");
    } finally {
      setClaimBusy(false);
    }
  }

  async function submitEdit(comment: CommentDTO) {
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
    if (!viewerMemberId || comment.createdByMemberId !== viewerMemberId) {
      setThreadErr("You can only edit your own comments.");
      return;
    }
    if (comment.status !== "live") {
      setThreadErr("Only live comments can be edited.");
      return;
    }

    const draft0 = editByCommentId[comment.id];
    if (!draft0 || !draft0.open) return;

    const text = (draft0.plain ?? "").trim();
    if (!text) {
      setEditByCommentId((prev) => ({
        ...prev,
        [comment.id]: { ...draft0, err: "Edit is empty." },
      }));
      return;
    }

    setEditByCommentId((prev) => ({
      ...prev,
      [comment.id]: { ...draft0, posting: true, err: "" },
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
          commentId: comment.id,
          bodyPlain: text,
          bodyRich: doc,
        }),
      });

      const j = (await r.json()) as CommentEditOk | CommentEditErr;

      if (!j.ok) {
        setEditByCommentId((prev) => ({
          ...prev,
          [comment.id]: {
            ...draft0,
            posting: false,
            err: j.error || "Edit failed.",
          },
        }));
        return;
      }

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

      closeEdit(comment.id);
    } finally {
      setEditByCommentId((prev) => {
        const cur = prev[comment.id];
        if (!cur) return prev;
        if (!cur.posting) return prev;
        return { ...prev, [comment.id]: { ...cur, posting: false } };
      });
    }
  }

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
          recordingId,
          lineKey: selected.lineKey,
          groupKey: (thread?.groupKey ?? "").trim(),
          parentId: null,
          bodyPlain: text,
          bodyRich: doc,
          tMs: selected.tMs,
          lineTextSnapshot: selected.lineText,
          lyricsVersion: lyricsVersion ?? null,
        }),
      });

      const j = (await r.json()) as
        | (CommentPostOk & { newlyAwardedBadges?: unknown })
        | {
            ok: false;
            error: string;
            gate?: ThreadApiErr["gate"];
            newlyAwardedBadges?: unknown;
          };

      if (!j.ok) {
        if (j.gate) {
          const res = gateResultFromPayload({
            payload: j.gate,
            attempt: { verb: "postComment", domain: "exegesis" },
            isSignedIn: Boolean(userId),
            intent: "explicit",
          });

          if (!res.ok) {
            applyGateResult(res);
            setThreadErr("");
            return;
          }
        }

        setThreadErr(j.error || "Failed to post comment.");
        return;
      }

      setDraft("");
      setDraftDoc(null);
      announceAwardPayload(j.newlyAwardedBadges);

      pendingScrollCommentIdRef.current = j.comment.id;
      setHash({
        lineKey: selected.lineKey,
        commentId: j.comment.id,
        rootId: focusedRootId || undefined,
      });

      setThread((prev) => {
        if (!prev) return prev;
        if (
          prev.recordingId !== j.recordingId ||
          prev.groupKey !== j.groupKey
        ) {
          return prev;
        }

        const newRoot = { rootId: j.comment.rootId, comments: [j.comment] };
        return {
          ...prev,
          meta: j.meta,
          roots: [newRoot, ...prev.roots],
          identities: { ...prev.identities, ...j.identities },
        };
      });

      const url =
        `/api/exegesis/thread?recordingId=${encodeURIComponent(recordingId)}` +
        `&groupKey=${encodeURIComponent(groupKey)}`;

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
          recordingId,
          lineKey: selected.lineKey,
          groupKey,
          parentId,
          bodyPlain: text,
          bodyRich: doc,
          tMs: selected.tMs,
          lineTextSnapshot: selected.lineText,
          lyricsVersion: lyricsVersion ?? null,
        }),
      });

      const j = (await r.json()) as
        | (CommentPostOk & { newlyAwardedBadges?: unknown })
        | {
            ok: false;
            error: string;
            gate?: ThreadApiErr["gate"];
            newlyAwardedBadges?: unknown;
          };

      if (!j.ok) {
        if (j.gate) {
          const res = gateResultFromPayload({
            payload: j.gate,
            attempt: { verb: "postComment", domain: "exegesis" },
            isSignedIn: Boolean(userId),
            intent: "explicit",
          });

          if (!res.ok) {
            applyGateResult(res);
            setThreadErr("");
            return;
          }
        }

        setThreadErr(j.error || "Reply failed.");
        return;
      }

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
      announceAwardPayload(j.newlyAwardedBadges);

      pendingScrollCommentIdRef.current = j.comment.id;
      setHash({
        lineKey: selected.lineKey,
        commentId: j.comment.id,
        rootId: focusedRootId || undefined,
      });

      setThread((prev) => {
        if (!prev) return prev;
        if (
          prev.recordingId !== j.recordingId ||
          prev.groupKey !== j.groupKey
        ) {
          return prev;
        }

        const roots = (prev.roots ?? []).map((root) => {
          if (root.rootId !== j.comment.rootId) return root;
          return { ...root, comments: [...(root.comments ?? []), j.comment] };
        });

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

      const url =
        `/api/exegesis/thread?recordingId=${encodeURIComponent(recordingId)}` +
        `&groupKey=${encodeURIComponent(groupKey)}`;

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

    const j = (await r.json()) as
      | (VoteOk & { newlyAwardedBadges?: unknown })
      | (VoteErr & { newlyAwardedBadges?: unknown });

    if (!j.ok) {
      if (j.gate) {
        const res = gateResultFromPayload({
          payload: j.gate,
          attempt: { verb: "vote", domain: "exegesis" },
          isSignedIn: Boolean(userId),
          intent: "explicit",
        });

        if (!res.ok) {
          applyGateResult(res);
          setThreadErr("");
          return;
        }
      }

      setThreadErr(j.error || "Vote failed.");

      if (selected) {
        const gk = (thread?.groupKey ?? "").trim();
        const url =
          `/api/exegesis/thread?recordingId=${encodeURIComponent(recordingId)}` +
          (gk
            ? `&groupKey=${encodeURIComponent(gk)}`
            : `&lineKey=${encodeURIComponent(selected.lineKey)}`);
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

    announceAwardPayload(j.newlyAwardedBadges);
  }

  return {
    thread,
    setThread,
    threadErr,
    setThreadErr,
    threadUI,
    shouldShowInitialShimmer,
    viewerMemberId,
    viewerIdentity,
    meta,
    isLocked,
    canVote,
    canReport,
    canPost,
    canClaimName,
    rootsForRender,
    threadKey,
    isAnon,
    submitReport,
    submitClaimName,
    submitEdit,
    postComment,
    postReply,
    toggleVote,
  };
}
