// web/app/(site)/exegesis/[recordingId]/ExegesisTrackClient.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { useMembershipModal } from "@/app/home/MembershipModalProvider";
import { gate } from "@/app/home/gating/gate";
import type {
  GateAttempt,
  GateContext,
  GateResult,
} from "@/app/home/gating/gate";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import type { GateDomain } from "@/app/home/gating/gateTypes";
import { GeniusIcon } from "./icons";
import ExegesisDiscoursePanel from "./components/ExegesisDiscoursePanel";
import ExegesisLyricsRail from "./components/ExegesisLyricsRail";
import ExegesisRichComposer from "./components/ExegesisRichComposer";
import useExegesisHashState, {
  type ExegesisSelectedLine,
} from "./hooks/useExegesisHashState";
import useExegesisHover from "./hooks/useExegesisHover";
import useExegesisThread from "./hooks/useExegesisThread";
import type {
  CommentDTO,
  ComposerStage,
  EditDraft,
  LyricsApiOk,
  ReplyDraft,
  ReportDraft,
  ThreadSort,
} from "./exegesisTypes";
import { isTipTapDoc, parseHash } from "./exegesisUi";
import { resolveViewerDisplayIdentity } from "@/lib/memberIdentity";
import { identityFactsFromDTO } from "./exegesisIdentity";

function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false;

  const [matches, setMatches] = React.useState<boolean>(get);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);

    setMatches(m.matches);

    if (typeof m.addEventListener === "function") {
      m.addEventListener("change", onChange);
      return () => m.removeEventListener("change", onChange);
    } else {
      m.addListener(onChange);
      return () => m.removeListener(onChange);
    }
  }, [query]);

  return matches;
}

export default function ExegesisTrackClient(props: {
  recordingId: string;
  lyrics: LyricsApiOk;
  canonicalPath?: string;
  trackTitle?: string | null;
  trackArtist?: string | null;
  headerLeading?: React.ReactNode;
  headerArtwork?: React.ReactNode;
}) {
  const { openMembershipModal } = useMembershipModal();
  const broker = useGateBroker();

  const EXEGESIS_DOMAIN: GateDomain = "exegesis";

  type InlineGateState = {
    open: boolean;
    message: string;
    correlationId: string | null;
    dismissible: boolean;
  };

  const [inlineGate, setInlineGate] = React.useState<InlineGateState>({
    open: false,
    message: "",
    correlationId: null,
    dismissible: false,
  });

  function clearInlineGate() {
    setInlineGate({
      open: false,
      message: "",
      correlationId: null,
      dismissible: false,
    });
  }

  const { userId, isLoaded: authLoaded } = useAuth();

  const applyGateResult = React.useCallback(
    (res: GateResult, opts?: { dismissible?: boolean }) => {
      if (res.ok) {
        broker.clearGate({ domain: EXEGESIS_DOMAIN });
        clearInlineGate();
        return;
      }

      broker.reportGate({
        code: res.reason.code,
        action: res.reason.action,
        message: res.reason.message,
        domain: res.reason.domain,
        uiMode: res.uiMode,
        correlationId: res.reason.correlationId ?? null,
      });

      if (res.uiMode === "inline") {
        setInlineGate({
          open: true,
          message: (res.reason.message ?? "").trim(),
          correlationId: res.reason.correlationId ?? null,
          dismissible: Boolean(opts?.dismissible),
        });
      } else {
        clearInlineGate();
      }
    },
    [broker, EXEGESIS_DOMAIN],
  );

  const gateInlineFromEngine = React.useCallback(
    (opts: {
      attempt: GateAttempt;
      intent: "passive" | "explicit";
      messageOverride?: string;
      correlationId?: string | null;
      dismissible?: boolean;
      ctxExtra?: Omit<GateContext, "isSignedIn" | "intent">;
    }) => {
      const baseCtx: GateContext = {
        isSignedIn: Boolean(userId),
        intent: opts.intent,
        ...(opts.ctxExtra ?? {}),
      };

      const res0 = gate(opts.attempt, baseCtx);

      if (!res0.ok) {
        const msg = (opts.messageOverride || res0.reason.message || "").trim();
        const res: GateResult = {
          ...res0,
          reason: {
            ...res0.reason,
            message: msg,
            correlationId:
              opts.correlationId ?? res0.reason.correlationId ?? null,
          },
        };

        applyGateResult(res, { dismissible: Boolean(opts.dismissible) });
        return;
      }

      applyGateResult(res0);
    },
    [applyGateResult, userId],
  );

  const recordingId = (props.recordingId ?? "").trim();
  const lyrics = props.lyrics;
  const canonicalPath = (props.canonicalPath ?? "").trim();

  function setHash(next: {
    lineKey?: string;
    commentId?: string;
    rootId?: string;
  }) {
    if (typeof window === "undefined") return;

    const sp = new URLSearchParams();
    if (next.lineKey) sp.set("l", next.lineKey);
    if (next.commentId) sp.set("c", next.commentId);
    if (next.rootId) sp.set("root", next.rootId);
    const h = sp.toString();

    const base = canonicalPath
      ? canonicalPath
      : window.location.pathname + window.location.search;

    window.history.replaceState(null, "", h ? `${base}#${h}` : base);
  }

  const [selected, setSelected] = React.useState<ExegesisSelectedLine | null>(
    null,
  );

  const {
    hoverGroupKey,
    hoverLineKey,
    scheduleHover,
    clearHover,
    onLyricsPointerMove,
  } = useExegesisHover();

  const isMobile = useMediaQuery("(max-width: 767px)");
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const lyricsWrapRef = React.useRef<HTMLDivElement | null>(null);
  const panelInnerRef = React.useRef<HTMLDivElement | null>(null);
  const threadScrollRef = React.useRef<HTMLDivElement | null>(null);

  const lineBtnByKeyRef = React.useRef<
    Record<string, HTMLButtonElement | null>
  >({});

  const [panelY, setPanelY] = React.useState<number>(0);
  const [desktopPanelH, setDesktopPanelH] = React.useState<number>(0);

  function measureDesktopPanelH() {
    if (typeof window === "undefined") return;
    if (isMobile) return;
    const wrapEl = lyricsWrapRef.current;
    if (!wrapEl) return;
    const w = wrapEl.getBoundingClientRect();
    setDesktopPanelH(Math.max(0, Math.floor(w.height)));
  }

  const [sort, setSort] = React.useState<ThreadSort>("top");
  const PREVIEW_MAX_DEPTH = 2;
  const PREVIEW_MAX_COMMENTS = 8;

  const [focusedRootId, setFocusedRootId] = React.useState<string>("");
  const panelScrollTopRef = React.useRef<number>(0);

  function focusRoot(rootId: string) {
    const rid = (rootId ?? "").trim();
    if (!rid) return;

    panelScrollTopRef.current = threadScrollRef.current?.scrollTop ?? 0;

    const h = parseHash();
    setFocusedRootId(rid);

    setHash({
      lineKey: selected?.lineKey || h.lineKey,
      commentId: h.commentId,
      rootId: rid,
    });
  }

  function clearRootFocus() {
    setFocusedRootId("");
    if (selected?.lineKey) setHash({ lineKey: selected.lineKey });
    else setHash({});

    window.requestAnimationFrame(() => {
      const el = threadScrollRef.current;
      if (el) el.scrollTop = panelScrollTopRef.current || 0;
    });
  }

  const rootElByIdRef = React.useRef<Record<string, HTMLDivElement | null>>({});
  const flipRectsRef = React.useRef<Record<string, DOMRect>>({});
  const flipPendingRef = React.useRef(false);

  function prefersReducedMotion(): boolean {
    if (typeof window === "undefined") return true;
    return (
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false
    );
  }

  function beginFlip() {
    if (prefersReducedMotion()) return;
    const next: Record<string, DOMRect> = {};
    for (const [id, el] of Object.entries(rootElByIdRef.current)) {
      if (!el) continue;
      next[id] = el.getBoundingClientRect();
    }
    flipRectsRef.current = next;
    flipPendingRef.current = true;
  }

  function setSortWithFlip(next: ThreadSort) {
    if (next === sort) return;
    beginFlip();
    setSort(next);
  }

  const { pendingScrollCommentIdRef } = useExegesisHashState({
    lyrics,
    setSelected,
    setFocusedRootId,
    threadKey: "",
    isMobile,
    selectedLineKey: (selected?.lineKey ?? "").trim(),
    setDrawerOpen,
  });

  const [draft, setDraft] = React.useState<string>("");
  const [draftDoc, setDraftDoc] = React.useState<unknown | null>(null);
  const [posting, setPosting] = React.useState<boolean>(false);

  const [composerStage, setComposerStage] =
    React.useState<ComposerStage>("collapsed");

  const [composerMountKey, setComposerMountKey] = React.useState<number>(0);
  const [replyMountKey, setReplyMountKey] = React.useState<number>(0);
  const [editMountKey, setEditMountKey] = React.useState<number>(0);

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

  const composerWrapRef = React.useRef<HTMLDivElement | null>(null);
  const replyWrapByIdRef = React.useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const editWrapByIdRef = React.useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const reportWrapByIdRef = React.useRef<Record<string, HTMLDivElement | null>>(
    {},
  );

  const draftRef = React.useRef(draft);
  const replyDraftsRef = React.useRef(replyByCommentId);
  const editDraftsRef = React.useRef(editByCommentId);
  const reportDraftsRef = React.useRef(reportByCommentId);

  React.useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  React.useEffect(() => {
    replyDraftsRef.current = replyByCommentId;
  }, [replyByCommentId]);

  React.useEffect(() => {
    editDraftsRef.current = editByCommentId;
  }, [editByCommentId]);

  React.useEffect(() => {
    reportDraftsRef.current = reportByCommentId;
  }, [reportByCommentId]);

  const {
    thread,
    threadErr,
    shouldShowInitialShimmer,
    viewerMemberId,
    viewerIdentity,
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
  } = useExegesisThread({
    recordingId,
    lyricsVersion: lyrics.version ?? null,
    selected,
    sort,
    userId,
    authLoaded,
    inlineGateOpen: inlineGate.open,
    applyGateResult,
    onAuthChangedClearGate: () => {
      broker.clearGate({ domain: EXEGESIS_DOMAIN });
      clearInlineGate();
    },
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
  });

  function openComposer(stage: ComposerStage) {
    if (!canPost || isLocked) return;
    setComposerStage(stage);
    setComposerMountKey((n) => n + 1);
  }

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

  function openReply(commentId: string) {
    if (!canPost || isLocked) return;
    setReplyMountKey((n) => n + 1);
    setReplyByCommentId((prev) => {
      const cur = prev[commentId];
      const base: ReplyDraft = cur ?? {
        open: true,
        ui: "basic",
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

  function openEdit(c: CommentDTO) {
    if (!canPost || isLocked) return;
    if (!viewerMemberId) return;
    if (c.createdByMemberId !== viewerMemberId) return;
    if (c.status !== "live") return;

    setEditMountKey((n) => n + 1);
    setEditByCommentId((prev) => {
      const cur = prev[c.id];
      const base: EditDraft = cur ?? {
        open: true,
        ui: "basic",
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
          plain: c.bodyPlain ?? base.plain,
          doc: isTipTapDoc(c.bodyRich) ? c.bodyRich : base.doc,
          err: "",
        },
      };
    });
  }

  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;

      const currentDraft = draftRef.current;
      const replyById = replyDraftsRef.current;
      const editById = editDraftsRef.current;
      const reportById = reportDraftsRef.current;

      const composerEl = composerWrapRef.current;
      const clickedInComposer = !!composerEl && composerEl.contains(t);

      if (!clickedInComposer) {
        if (!(currentDraft ?? "").trim()) {
          setComposerStage("collapsed");
        }
      }

      for (const [commentId, d] of Object.entries(replyById)) {
        if (!d?.open) continue;
        const el = replyWrapByIdRef.current[commentId];
        if (!el) continue;

        if (!el.contains(t) && !(d.plain ?? "").trim()) {
          setReplyByCommentId((prev) => {
            if (!prev[commentId]) return prev;
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        }
      }

      for (const [commentId, d] of Object.entries(editById)) {
        if (!d?.open) continue;
        const el = editWrapByIdRef.current[commentId];
        if (!el) continue;

        if (!el.contains(t) && !(d.plain ?? "").trim()) {
          setEditByCommentId((prev) => {
            if (!prev[commentId]) return prev;
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        }
      }

      for (const [commentId, d] of Object.entries(reportById)) {
        if (!d?.open) continue;
        const el = reportWrapByIdRef.current[commentId];
        if (!el) continue;

        const reason = (d.reason ?? "").trim();
        const isEmpty = !reason;
        const canAutoClose = Boolean(d.done) || isEmpty;

        if (!el.contains(t) && canAutoClose) {
          setReportByCommentId((prev) => {
            if (!prev[commentId]) return prev;
            const next = { ...prev };
            delete next[commentId];
            return next;
          });
        }
      }
    }

    document.addEventListener("mousedown", onMouseDown, true);
    return () => document.removeEventListener("mousedown", onMouseDown, true);
  }, []);

  React.useEffect(() => {
    const h = parseHash();
    const rid = (h.rootId ?? "").trim();
    setFocusedRootId(rid);
  }, [threadKey]);

  const rootsForView = React.useMemo(() => {
    const roots = rootsForRender ?? [];
    if (!focusedRootId) return roots;
    return roots.filter((r) => r.rootId === focusedRootId);
  }, [rootsForRender, focusedRootId]);

  React.useLayoutEffect(() => {
    if (!flipPendingRef.current) return;
    flipPendingRef.current = false;

    if (prefersReducedMotion()) return;

    const prevRects = flipRectsRef.current;
    for (const [id, el] of Object.entries(rootElByIdRef.current)) {
      if (!el) continue;
      const prev = prevRects[id];
      if (!prev) continue;
      const next = el.getBoundingClientRect();
      const dy = prev.top - next.top;
      if (!dy) continue;

      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = "transform 0s";

      requestAnimationFrame(() => {
        el.style.transition = "transform 220ms ease-out";
        el.style.transform = "translateY(0)";
      });

      const cleanup = () => {
        el.style.transition = "";
        el.style.transform = "";
        el.removeEventListener("transitionend", cleanup);
      };
      el.addEventListener("transitionend", cleanup);
    }
  }, [rootsForRender]);

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
  }, [threadKey, pendingScrollCommentIdRef]);

  const viewerAuthorIdentity = React.useMemo(
    () =>
      resolveViewerDisplayIdentity({
        identity: identityFactsFromDTO(viewerIdentity),
        canClaimName,
      }),
    [viewerIdentity, canClaimName],
  );

  const showIdentityPanel =
    thread?.viewer.kind === "member" &&
    !!viewerMemberId &&
    !!viewerAuthorIdentity;

  React.useEffect(() => {
    if (viewerAuthorIdentity?.hasClaimedPublicName) {
      setClaimOpen(false);
      setClaimErr("");
      setClaimName("");
    }
  }, [viewerAuthorIdentity?.hasClaimedPublicName]);

  React.useEffect(() => {
    if (!isMobile) return;
    if (!drawerOpen) return;

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isMobile, drawerOpen]);

  function measurePanelY() {
    if (typeof window === "undefined") return;
    if (isMobile) return;
    const lk = (selected?.lineKey ?? "").trim();
    if (!lk) return;

    const anchorEl = lineBtnByKeyRef.current[lk];
    const wrapEl = lyricsWrapRef.current;
    const panelEl = panelInnerRef.current;
    if (!anchorEl || !wrapEl || !panelEl) return;

    const a = anchorEl.getBoundingClientRect();
    const w = wrapEl.getBoundingClientRect();

    let y = a.top - w.top;

    const maxY = Math.max(0, w.height - panelEl.offsetHeight);
    y = Math.max(0, Math.min(maxY, y));

    setPanelY(y);
  }

  React.useEffect(() => {
    if (isMobile) return;

    const raf1 = window.requestAnimationFrame(() => {
      measureDesktopPanelH();
      measurePanelY();
      window.requestAnimationFrame(() => {
        measureDesktopPanelH();
        measurePanelY();
      });
    });

    return () => window.cancelAnimationFrame(raf1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, selected?.lineKey, selected?.groupKey, threadKey]);

  React.useEffect(() => {
    if (isMobile) return;
    function onResize() {
      measureDesktopPanelH();
      measurePanelY();
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, selected?.lineKey]);

  const Composer = (
    <div ref={composerWrapRef} className="mt-3">
      {composerStage === "collapsed" ? (
        <button
          type="button"
          className="w-full bg-black/[0.16] px-4 py-3 text-left text-sm text-white/50 transition hover:text-white/72 focus-visible:outline-none"
          onClick={() => {
            if (isLocked) return;

            if (canPost) {
              openComposer("basic");
              return;
            }

            if (isAnon) {
              gateInlineFromEngine({
                attempt: { verb: "openComposer", domain: EXEGESIS_DOMAIN },
                intent: "explicit",
                messageOverride: "Discussion is exclusive to members.",
                correlationId: null,
                dismissible: true,
              });
              return;
            }

            openMembershipModal();
          }}
        >
          {canPost
            ? "Join the conversation"
            : isAnon
              ? "Become a member to find out how to join the discussion"
              : "Become a Patron to join the discussion"}
        </button>
      ) : null}

      {composerStage !== "collapsed" && canPost ? (
        <>
          <ExegesisRichComposer
            editorKey={`composer-${composerMountKey}-${composerStage}`}
            valuePlain={draft}
            valueDoc={draftDoc}
            disabled={!canPost || isLocked}
            showToolbar={composerStage === "full"}
            autofocus
            placeholder="Join the conversation"
            posting={posting}
            submitLabel="Post"
            submitDisabled={
              !canPost || isLocked || !selected || !draft.trim() || posting
            }
            onChangePlain={setDraft}
            onChangeDoc={setDraftDoc}
            onToggleToolbar={() =>
              setComposerStage((s) => (s === "full" ? "basic" : "full"))
            }
            onSubmit={() => void postComment()}
          />

          {thread?.viewer.kind === "anon" ? (
            <div className="mt-2 text-xs opacity-60">
              Tip: sign in to vote; upgrade to post.
            </div>
          ) : !canPost ? (
            <div className="mt-2 text-xs opacity-60">
              Posting requires Patron or Partner.
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );

  return (
    <div
      className="w-full max-w-none px-4 py-6 pl-0"
      style={
        {
          "--lxRow": "#2c2431",
          "--lxHover": "#564263",
          "--lxSelected": "#624e71",
        } as React.CSSProperties
      }
    >
      <style jsx global>{`
        @keyframes afShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }

        .afMedalAdamantium {
          background: linear-gradient(
            90deg,
            rgba(197, 134, 255, 1) 0%,
            rgba(120, 214, 255, 1) 35%,
            rgba(255, 210, 252, 1) 70%,
            rgba(197, 134, 255, 1) 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: afShimmer 1.6s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .afMedalAdamantium {
            animation: none;
            color: rgba(197, 134, 255, 1);
            background: none;
          }
        }

        .afShimmerText {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.55) 0%,
            rgba(255, 255, 255, 0.95) 45%,
            rgba(255, 255, 255, 0.55) 100%
          );
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: afShimmer 1.1s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .afShimmerText {
            animation: none;
            color: rgba(255, 255, 255, 0.92);
            background: none;
          }
        }

        .afShimmerBlock {
          background: linear-gradient(
            90deg,
            rgba(255, 255, 255, 0.03) 0%,
            rgba(255, 255, 255, 0.08) 45%,
            rgba(255, 255, 255, 0.03) 100%
          );
          background-size: 200% 100%;
          animation: afShimmer 1.05s linear infinite;
        }

        .afBadgeStroke {
          text-shadow:
            -1px 0 rgba(255, 255, 255, 0.05),
            1px 0 rgba(255, 255, 255, 0.05),
            0 -1px rgba(255, 255, 255, 0.05),
            0 1px rgba(255, 255, 255, 0.05),
            -1px -1px rgba(255, 255, 255, 0.05),
            1px 1px rgba(255, 255, 255, 0.05),
            -1px 1px rgba(255, 255, 255, 0.05),
            1px -1px rgba(255, 255, 255, 0.05);
        }

        .afFadeScroll {
          -webkit-mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(0, 0, 0, 1) 12px,
            rgba(0, 0, 0, 1) calc(100% - 12px),
            transparent 100%
          );
          mask-image: linear-gradient(
            to bottom,
            transparent 0%,
            rgba(0, 0, 0, 1) 12px,
            rgba(0, 0, 0, 1) calc(100% - 12px),
            transparent 100%
          );
        }
        @media (prefers-reduced-motion: reduce) {
          .afFadeScroll {
            -webkit-mask-image: none;
            mask-image: none;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .afShimmerBlock {
            animation: none;
          }
        }
      `}</style>

      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-3">
          {props.headerLeading ? (
            <div className="flex shrink-0 items-center justify-center">
              {props.headerLeading}
            </div>
          ) : null}

          {props.headerArtwork ? (
            <div className="flex shrink-0 items-center justify-center">
              {props.headerArtwork}
            </div>
          ) : null}

          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold leading-tight">
              <span className="opacity-90">
                {(props.trackTitle ?? "").trim() || lyrics.recordingId}
              </span>
            </h1>

            {(props.trackArtist ?? "").trim() ? (
              <div className="mt-1 text-sm leading-tight opacity-70">
                {props.trackArtist}
              </div>
            ) : null}

            {lyrics.geniusUrl ? (
              <a
                href={lyrics.geniusUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center rounded-md p-1 text-[#fefe63] opacity-70 hover:opacity-100"
                title="Open on Genius"
                aria-label="Open on Genius"
              >
                <GeniusIcon className="h-7 w-auto" />
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_570px]">
        <ExegesisLyricsRail
          lyrics={lyrics}
          selectedLineKey={(selected?.lineKey ?? "").trim()}
          selectedGroupKey={(selected?.groupKey ?? "").trim()}
          hoverGroupKey={(hoverGroupKey ?? "").trim()}
          hoverLineKey={(hoverLineKey ?? "").trim()}
          lyricsWrapRef={lyricsWrapRef}
          lineBtnByKeyRef={lineBtnByKeyRef}
          onPointerMove={onLyricsPointerMove}
          onPointerLeave={clearHover}
          onLineFocus={scheduleHover}
          onLineBlur={clearHover}
          onSelectLine={({ lineKey, lineText, tMs, groupKey }) => {
            setSelected({
              lineKey,
              lineText,
              tMs,
              groupKey,
            });

            setHash({ lineKey });

            if (isMobile) setDrawerOpen(true);
          }}
        />

        {(() => {
          const DOCK_H = 80;

          const DiscoursePanel = (
            <ExegesisDiscoursePanel
              isMobile={isMobile}
              desktopPanelH={desktopPanelH}
              dockHeight={DOCK_H}
              lyrics={lyrics}
              selected={selected}
              shouldShowInitialShimmer={shouldShowInitialShimmer}
              isLocked={isLocked}
              showIdentityPanel={showIdentityPanel}
              viewerAuthorIdentity={viewerAuthorIdentity}
              claimOpen={claimOpen}
              claimName={claimName}
              claimErr={claimErr}
              claimBusy={claimBusy}
              threadErr={threadErr}
              composer={Composer}
              focusedRootId={focusedRootId}
              sort={sort}
              threadScrollRef={threadScrollRef}
              roots={rootsForView ?? []}
              identities={thread?.identities}
              viewerMemberId={viewerMemberId}
              viewerKind={thread?.viewer.kind ?? "anon"}
              canPost={canPost}
              canReport={canReport}
              canVote={canVote}
              replyByCommentId={replyByCommentId}
              editByCommentId={editByCommentId}
              reportByCommentId={reportByCommentId}
              replyMountKey={replyMountKey}
              editMountKey={editMountKey}
              previewMaxDepth={PREVIEW_MAX_DEPTH}
              previewMaxComments={PREVIEW_MAX_COMMENTS}
              rootElByIdRef={rootElByIdRef}
              editWrapByIdRef={editWrapByIdRef}
              replyWrapByIdRef={replyWrapByIdRef}
              reportWrapByIdRef={reportWrapByIdRef}
              inlineGate={inlineGate}
              onClearRootFocus={clearRootFocus}
              onSetSortTop={() => setSortWithFlip("top")}
              onSetSortRecent={() => setSortWithFlip("recent")}
              onToggleClaim={() => {
                setClaimErr("");
                setClaimOpen((v) => !v);
              }}
              onChangeClaimName={setClaimName}
              onCancelClaim={() => {
                setClaimOpen(false);
                setClaimErr("");
              }}
              onSubmitClaim={() => void submitClaimName()}
              onOpenReply={openReply}
              onOpenReport={openReport}
              onToggleVote={(commentId) => void toggleVote(commentId)}
              onOpenEdit={openEdit}
              onSubmitEdit={(comment) => void submitEdit(comment)}
              onSubmitReply={(comment) => void postReply(comment)}
              onSubmitReport={(commentId) => void submitReport(commentId)}
              onChangeEditDraft={(commentId, next) =>
                setEditByCommentId((prev) => ({
                  ...prev,
                  [commentId]: next,
                }))
              }
              onChangeReplyDraft={(commentId, next) =>
                setReplyByCommentId((prev) => ({
                  ...prev,
                  [commentId]: next,
                }))
              }
              onChangeReportDraft={(commentId, next) =>
                setReportByCommentId((prev) => ({
                  ...prev,
                  [commentId]: next,
                }))
              }
              onFocusRoot={focusRoot}
              onDismissInlineGate={() => {
                broker.clearGate({ domain: EXEGESIS_DOMAIN });
                clearInlineGate();
              }}
            />
          );

          return (
            <>
              <div className="hidden md:block">
                <div className="relative">
                  <div
                    ref={panelInnerRef}
                    className="will-change-transform transition-transform duration-200 ease-out"
                    style={{ transform: `translateY(${panelY}px)` }}
                  >
                    {DiscoursePanel}
                  </div>
                </div>
              </div>

              {isMobile ? (
                <>
                  <div
                    className={`fixed inset-0 z-[60] md:hidden bg-black/70 transition-opacity duration-200 ease-out ${
                      drawerOpen
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    <button
                      type="button"
                      aria-label="Back to lyrics"
                      className="absolute left-0 top-0 h-[100dvh] w-14"
                      onClick={() => setDrawerOpen(false)}
                    />
                  </div>

                  <div
                    className="fixed right-0 top-0 z-[61] h-[100dvh] md:hidden will-change-transform transition-transform duration-200 ease-out"
                    style={{
                      width: "calc(100vw - 56px)",
                      transform: drawerOpen
                        ? "translateX(0)"
                        : "translateX(100%)",
                      pointerEvents: drawerOpen ? "auto" : "none",
                    }}
                  >
                    <div className="h-full overflow-hidden border-l border-white/10 shadow-2xl">
                      {DiscoursePanel}
                    </div>
                  </div>
                </>
              ) : null}
            </>
          );
        })()}
      </div>
    </div>
  );
}
