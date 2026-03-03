// web/app/(site)/exegesis/[trackId]/ExegesisTrackClient.tsx
"use client";

import React from "react";
import { useAuth } from "@clerk/nextjs";
import { useMembershipModal } from "@/app/home/MembershipModalProvider";
import ActivationGate from "@/app/home/ActivationGate";
import { gate } from "@/app/home/gating/gate";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import type { GateDomain, GateUiMode } from "@/app/home/gating/gateTypes";
import TipTapEditor from "./TipTapEditor";
import TipTapReadOnly from "./TipTapReadOnly";
import type { LyricCue, LyricGroupMap } from "@/lib/types";
import { GeniusIcon, MedalIcon, ReplyIcon, ShieldAlertIcon } from "./icons";

type LyricsApiOk = {
  ok: true;
  trackId: string;
  offsetMs: number;
  version: string;
  geniusUrl: string | null;
  cues: LyricCue[];
  groupMap?: LyricGroupMap;
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

function parseHash(): {
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

function cueGroupKey(lyrics: LyricsApiOk, lineKey: string): string {
  const lk = (lineKey ?? "").trim();
  if (!lk) return "";
  // prefer the explicit mapping table if present
  const m = lyrics.groupMap?.[lk]?.canonicalGroupKey;
  if (typeof m === "string" && m.trim()) return m.trim();
  // fallback: look at cue annotation
  const c = (lyrics.cues ?? []).find((x) => x.lineKey === lk);
  const g = c?.canonicalGroupKey;
  return typeof g === "string" ? g.trim() : "";
}

function isSameGroup(a: string, b: string): boolean {
  const aa = (a ?? "").trim();
  const bb = (b ?? "").trim();
  return !!aa && !!bb && aa === bb;
}

function cueCanonicalGroupKey(lyrics: LyricsApiOk, c: LyricCue): string {
  return (c.canonicalGroupKey ?? cueGroupKey(lyrics, c.lineKey) ?? "").trim();
}

function useMediaQuery(query: string): boolean {
  const get = () =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false;

  const [matches, setMatches] = React.useState<boolean>(get);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.matchMedia(query);
    const onChange = () => setMatches(m.matches);

    // init
    setMatches(m.matches);

    // modern + fallback
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

function isTipTapDoc(v: unknown): v is { type: "doc"; content?: unknown[] } {
  if (!v || typeof v !== "object") return false;
  const o = v as { type?: unknown; content?: unknown };
  if (o.type !== "doc") return false;
  if (typeof o.content === "undefined") return true;
  return Array.isArray(o.content);
}

function medalTier(votes: number): "copper" | "gold" | "adamantium" {
  const n = Math.max(0, votes || 0);
  // v1 thresholds — tweak freely
  if (n >= 7) return "adamantium";
  if (n >= 3) return "gold";
  return "copper";
}

function medalClassForTier(t: "copper" | "gold" | "adamantium"): string {
  // Default: neutral (pre-click). These only apply after the viewer has voted.
  if (t === "copper") return "text-[#b87333]"; // copper
  if (t === "gold") return "text-[#f5d062]"; // gold

  // "Nebulaic adamantium" — a slightly glistening purple vibe.
  // Uses background-clip on an inner span, so the SVG stays "currentColor".
  // We'll apply this via a wrapper class that sets a gradient to text.
  return "afMedalAdamantium";
}

export default function ExegesisTrackClient(props: {
  trackId: string;
  lyrics: LyricsApiOk;
  canonicalPath?: string;
  trackTitle?: string | null;
  trackArtist?: string | null;
}) {
  const { openMembershipModal } = useMembershipModal();
  const broker = useGateBroker();

  const EXEGESIS_DOMAIN: GateDomain = "exegesis";

  type InlineGateState = {
    open: boolean;
    uiMode: GateUiMode;
    message: string;
    correlationId: string | null;
  };

  const [inlineGate, setInlineGate] = React.useState<InlineGateState>({
    open: false,
    uiMode: "inline",
    message: "",
    correlationId: null,
  });

  function clearInlineGate() {
    setInlineGate({
      open: false,
      uiMode: "inline",
      message: "",
      correlationId: null,
    });
  }

  const { userId, isLoaded: authLoaded } = useAuth();

  type ForcedInlineReason = "readReceiptsCap" | "authRequired";

  const reportInlineGate = React.useCallback(
    (opts: {
      intent: "passive" | "explicit";
      message: string;
      correlationId?: string | null;
      forced?: ForcedInlineReason;
    }) => {
      // IMPORTANT: the engine must be told *what happened*.
      // Otherwise it will return ok:true and we will clear everything.
      const forced = opts.forced ?? null;

      const decision = gate(
        // Verb can stay "markSeen" for now; the *domain + forced context* is what matters.
        { verb: "markSeen", domain: EXEGESIS_DOMAIN },
        {
          isSignedIn: Boolean(userId),
          intent: opts.intent,

          // These flags are the adapter’s “facts on the ground”.
          // If your gate.ts uses different names, the hard fallback below still ensures UI opens.
          readReceiptsCapReached: forced === "readReceiptsCap",
          authRequired: forced === "authRequired",
        } as unknown as {
          isSignedIn: boolean;
          intent: "passive" | "explicit";
          readReceiptsCapReached?: boolean;
          authRequired?: boolean;
        },
      );

      // Happy path: engine decided we are blocked (ideal).
      if (decision.ok === false) {
        const msg = (opts.message || decision.reason.message || "").trim();

        broker.reportGate({
          code: decision.reason.code,
          action: decision.reason.action,
          message: msg,
          domain: decision.reason.domain,
          uiMode: "inline",
          correlationId: opts.correlationId ?? null,
        });

        setInlineGate({
          open: true,
          uiMode: "inline",
          message: msg,
          correlationId: opts.correlationId ?? null,
        });
        return;
      }

      // HARD FALLBACK: if caller says “this is blocked” but gate() returned ok:true
      // (e.g. mismatch in context flag naming), still open the inline gate.
      if (forced) {
        const msg = (opts.message || "Sign in to continue.").trim();

        broker.reportGate({
          code:
            forced === "readReceiptsCap"
              ? "READ_RECEIPTS_CAP_REACHED"
              : "AUTH_REQUIRED",
          action: "login",
          message: msg,
          domain: EXEGESIS_DOMAIN,
          uiMode: "inline",
          correlationId: opts.correlationId ?? null,
        });

        setInlineGate({
          open: true,
          uiMode: "inline",
          message: msg,
          correlationId: opts.correlationId ?? null,
        });
        return;
      }

      // Otherwise: no gate.
      broker.clearGate({ domain: EXEGESIS_DOMAIN });
      clearInlineGate();
    },
    [broker, userId],
  );

  const trackId = (props.trackId ?? "").trim();
  const lyrics = props.lyrics;
  const { trackId: lyricsTrackId, cues, groupMap } = lyrics;

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

    // If a canonical base is provided, use it (and do NOT inherit portal query params).
    // Otherwise, preserve the current page's secondary query.
    const base = canonicalPath
      ? canonicalPath
      : window.location.pathname + window.location.search;

    window.history.replaceState(null, "", h ? `${base}#${h}` : base);
  }

  type SelectedLine = {
    lineKey: string;
    lineText: string;
    tMs: number;
    groupKey?: string; // canonicalGroupKey if mapped
  };

  const [selected, setSelected] = React.useState<SelectedLine | null>(null);
  const [hoverGroupKey, setHoverGroupKey] = React.useState<string>("");
  const [hoverLineKey, setHoverLineKey] = React.useState<string>("");

  // rAF-throttled hover tracking (prevents missed rows + avoids re-render storms)
  const hoverRafRef = React.useRef<number | null>(null);
  const hoverNextRef = React.useRef<{ gk: string; lk: string } | null>(null);

  function commitHover(next: { gk: string; lk: string }) {
    // Avoid pointless state churn.
    if (next.gk === hoverGroupKey && next.lk === hoverLineKey) return;
    setHoverGroupKey(next.gk);
    setHoverLineKey(next.lk);
  }

  function scheduleHover(next: { gk: string; lk: string }) {
    hoverNextRef.current = next;
    if (hoverRafRef.current != null) return;

    hoverRafRef.current = window.requestAnimationFrame(() => {
      hoverRafRef.current = null;
      const v = hoverNextRef.current;
      hoverNextRef.current = null;
      if (!v) return;
      commitHover(v);
    });
  }

  React.useEffect(() => {
    return () => {
      if (hoverRafRef.current != null) {
        window.cancelAnimationFrame(hoverRafRef.current);
      }
      hoverRafRef.current = null;
      hoverNextRef.current = null;
    };
  }, []);

  function clearHover() {
    scheduleHover({ gk: "", lk: "" });
  }

  function onLyricsPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const tgt = e.target;
    if (!(tgt instanceof Element)) return;

    const btn = tgt.closest("button[data-linekey]");
    if (!(btn instanceof HTMLButtonElement)) {
      clearHover();
      return;
    }

    const lk = (btn.dataset.linekey ?? "").trim();
    const gk = (btn.dataset.groupkey ?? "").trim();
    scheduleHover({ gk, lk });
  }

  // --- layout: mobile drawer + desktop anchored panel ---
  const isMobile = useMediaQuery("(max-width: 767px)"); // Tailwind md breakpoint
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const lyricsWrapRef = React.useRef<HTMLDivElement | null>(null);
  const panelInnerRef = React.useRef<HTMLDivElement | null>(null);
  const lineBtnByKeyRef = React.useRef<
    Record<string, HTMLButtonElement | null>
  >({});

  const [panelY, setPanelY] = React.useState<number>(0);
  const [desktopPanelH, setDesktopPanelH] = React.useState<number>(0);
  const openFromHashRef = React.useRef<boolean>(false);

  function measureDesktopPanelH() {
    if (typeof window === "undefined") return;
    if (isMobile) return;
    const wrapEl = lyricsWrapRef.current;
    if (!wrapEl) return;
    const w = wrapEl.getBoundingClientRect();
    setDesktopPanelH(Math.max(0, Math.floor(w.height)));
  }

  const [thread, setThread] = React.useState<ThreadApiOk | null>(null);
  const [threadErr, setThreadErr] = React.useState<string>("");
  const [sort, setSort] = React.useState<ThreadSort>("top");

  const PREVIEW_MAX_DEPTH = 2; // show depths 0,1,2 (i.e. 3 levels)
  const PREVIEW_MAX_COMMENTS = 8; // optional cap for very wide trees

  const [focusedRootId, setFocusedRootId] = React.useState<string>("");

  // preserve panel scroll position when jumping in/out of a focused root
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
    // keep line selection in URL, just drop root
    if (selected?.lineKey) setHash({ lineKey: selected.lineKey });
    else setHash({});
    // restore scroll after the DOM updates
    window.requestAnimationFrame(() => {
      const el = threadScrollRef.current;
      if (el) el.scrollTop = panelScrollTopRef.current || 0;
    });
  }

  // --- FLIP animation for root list reorder (no deps) ---
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

  const [threadLoading, setThreadLoading] = React.useState<boolean>(false);
  const [threadLoadedKey, setThreadLoadedKey] = React.useState<string>("");

  // anon = not signed-in (but wait until Clerk has loaded to avoid a brief flicker)
  const isAnon = authLoaded ? !userId : false;

  const viewerKey = authLoaded ? (userId ?? "anon") : "loading";

  // "Core" identity of the requested thread (selection + viewer), regardless of sort.
  const threadWantedCoreKey = React.useMemo(() => {
    const lk = (selected?.lineKey ?? "").trim();
    const gk = (selected?.groupKey ?? "").trim();
    if (!trackId || !lk) return "";
    return `${trackId}::${lk}::${gk}::${viewerKey}`;
  }, [trackId, selected?.lineKey, selected?.groupKey, viewerKey]);

  // Fetch key now ignores sort (sort is client-side).
  const threadWantedFetchKey = threadWantedCoreKey;

  // Only trust/render `thread` when it matches the current selection+viewer.
  const threadUI =
    thread &&
    threadLoadedKey &&
    threadWantedCoreKey &&
    threadLoadedKey === threadWantedCoreKey
      ? thread
      : null;

  // Used only to decide whether to show initial shimmer.
  const shouldShowInitialShimmer =
    !!threadWantedCoreKey && !threadUI && !threadErr && threadLoading;

  const viewerMemberId =
    threadUI?.viewer?.kind === "member" ? threadUI.viewer.memberId : "";

  const viewerIdentity = viewerMemberId
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

      // Invert
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = "transform 0s";

      // Play
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

  const [draft, setDraft] = React.useState<string>("");
  const [draftDoc, setDraftDoc] = React.useState<unknown | null>(null);
  const [posting, setPosting] = React.useState<boolean>(false);

  type ComposerStage = "collapsed" | "basic" | "full";
  const [composerStage, setComposerStage] =
    React.useState<ComposerStage>("collapsed");

  // used to force-remount TipTap so autofocus is reliable when opening
  const [composerMountKey, setComposerMountKey] = React.useState<number>(0);
  const [replyMountKey, setReplyMountKey] = React.useState<number>(0);
  const [editMountKey, setEditMountKey] = React.useState<number>(0);

  function openComposer(stage: ComposerStage) {
    if (!canPost || isLocked) return;
    setComposerStage(stage);
    setComposerMountKey((n) => n + 1);
  }

  function DiscourseShimmer() {
    return (
      <div className="rounded-xl bg-white/5 p-4">
        {/* Selected lyric preview block */}
        <div className="mt-2 rounded-md bg-black/20 p-3">
          <div className="space-y-2">
            <div className="afShimmerBlock h-4 w-[90%] rounded bg-white/5" />
            <div className="afShimmerBlock h-4 w-[72%] rounded bg-white/5" />
          </div>
        </div>

        {/* Composer */}
        <div className="mt-3 rounded-lg border border-white/10 bg-white/6 p-3">
          <div className="afShimmerBlock h-9 w-full rounded-md bg-white/5" />
          <div className="mt-2 flex items-center justify-between">
            <div className="afShimmerBlock h-5 w-10 rounded-md bg-white/5" />
            <div className="afShimmerBlock h-4 w-16 rounded bg-white/5" />
          </div>
          <div className="mt-2 flex justify-end">
            <div className="afShimmerBlock h-8 w-20 rounded-md bg-white/5" />
          </div>
        </div>

        {/* Comments skeleton */}
        <div className="mt-4 space-y-3">
          <div className="rounded-md bg-black/20 p-3">
            <div className="afShimmerBlock h-3 w-24 rounded bg-white/5" />
            <div className="mt-2 space-y-2">
              <div className="afShimmerBlock h-4 w-[92%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[76%] rounded bg-white/5" />
            </div>
          </div>

          <div className="rounded-md bg-black/20 p-3">
            <div className="afShimmerBlock h-3 w-20 rounded bg-white/5" />
            <div className="mt-2 space-y-2">
              <div className="afShimmerBlock h-4 w-[88%] rounded bg-white/5" />
              <div className="afShimmerBlock h-4 w-[66%] rounded bg-white/5" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  type MiniStage = "basic" | "full";

  type ReplyDraft = {
    open: boolean;
    ui: MiniStage;
    plain: string;
    doc: unknown | null;
    posting: boolean;
    err: string;
  };

  type EditDraft = {
    open: boolean;
    ui: MiniStage;
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

  // --- outside-click close refs (main + per-reply/edit) ---
  const composerWrapRef = React.useRef<HTMLDivElement | null>(null);

  const Composer = (
    <div
      ref={composerWrapRef}
      className="mt-3 rounded-lg border border-white/10 bg-white/6 p-3"
    >
      {/* Stage 1: collapsed single-line affordance (gated users click-to-upgrade) */}
      {composerStage === "collapsed" ? (
        <button
          type="button"
          className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-left text-sm text-white/50 hover:bg-black/25"
          onClick={() => {
            if (isLocked) return;

            if (canPost) {
              openComposer("basic");
              return;
            }

            if (isAnon) {
              reportInlineGate({
                intent: "explicit",
                message: "Discussion is exclusive to members.",
                correlationId: null,
                forced: "authRequired",
              });
              return;
            }

            // signed-in but non-paying
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

      {/* Stage 2/3: editor + bottom mini ribbon (two buttons) */}
      {composerStage !== "collapsed" && canPost ? (
        <>
          <div className="mt-2">
            <TipTapEditor
              key={`composer-${composerMountKey}-${composerStage}`}
              valuePlain={draft}
              valueDoc={draftDoc}
              disabled={!canPost || isLocked}
              showToolbar={composerStage === "full"}
              autofocus
              placeholder="Join the conversation"
              onChangePlain={(plain) => setDraft(plain)}
              onChangeDoc={(doc) => setDraftDoc(doc)}
            />
          </div>

          {/* bottom ribbon: exactly two buttons */}
          <div className="mt-2 flex items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
              disabled={!canPost || isLocked}
              onClick={() =>
                setComposerStage((s) => (s === "full" ? "basic" : "full"))
              }
              title={
                composerStage === "full" ? "Hide formatting" : "Formatting"
              }
            >
              Aa
            </button>

            <div className="text-xs opacity-60">{draft.trim().length}/5000</div>
          </div>

          {/* your existing Post row stays (Reddit-style: separate action area) */}
          <div className="mt-2 flex items-center justify-end gap-3">
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
        </>
      ) : null}
    </div>
  );

  // store DOM nodes for reply/edit containers keyed by commentId
  const replyWrapByIdRef = React.useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const editWrapByIdRef = React.useRef<Record<string, HTMLDivElement | null>>(
    {},
  );
  const reportWrapByIdRef = React.useRef<Record<string, HTMLDivElement | null>>(
    {},
  );

  // --- keep latest draft state in refs to avoid re-binding listeners ---
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

  React.useEffect(() => {
    // Auth changed while on-page: force a refetch by invalidating the "loaded" marker.
    setThreadLoadedKey("");
    setThreadErr("");

    // Optional but usually nicer: prevents showing stale anon thread while loading the member thread.
    setThread(null);

    // If they just signed in, clear any exegesis gate (inline + broker).
    // (Even if they didn't sign in, clearing is harmless and keeps state tidy.)
    broker.clearGate({ domain: EXEGESIS_DOMAIN });
    clearInlineGate();
  }, [viewerKey, broker]);

  React.useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const t = e.target as Node | null;
      if (!t) return;

      // always read latest state from refs
      const draft = draftRef.current;
      const replyById = replyDraftsRef.current;
      const editById = editDraftsRef.current;
      const reportById = reportDraftsRef.current;

      // 1) Main composer
      const composerEl = composerWrapRef.current;
      const clickedInComposer = !!composerEl && composerEl.contains(t);

      if (!clickedInComposer) {
        if (!(draft ?? "").trim()) {
          setComposerStage("collapsed");
        }
      }

      // 2) Replies
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

      // 3) Edits (close on outside click ONLY if empty)
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

      // 4) Reports (close on outside click ONLY if empty; but allow closing if done)
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
    if (!cues || cues.length === 0) return;

    const h = parseHash();

    // No default selection on arrival.
    // Only select when the URL explicitly deep-links to a line.
    if (!h.lineKey) {
      setSelected(null);
      return;
    }

    const pick = cues.find((c) => c.lineKey === h.lineKey);
    if (!pick) {
      setSelected(null);
      return;
    }

    setSelected({
      lineKey: pick.lineKey,
      lineText: pick.text,
      tMs: pick.tMs,
      groupKey:
        (groupMap?.[pick.lineKey]?.canonicalGroupKey ??
          pick.canonicalGroupKey ??
          "") ||
        undefined,
    });

    if (h.commentId) pendingScrollCommentIdRef.current = h.commentId;

    // Mark as deep-link so mobile drawer opens (but only if selection exists).
    openFromHashRef.current = true;
  }, [lyricsTrackId, cues, groupMap]);

  const threadKey = thread
    ? `${thread.trackId}::${thread.groupKey}::${thread.meta?.commentCount ?? 0}`
    : "";

  React.useEffect(() => {
    const h = parseHash();
    const rid = (h.rootId ?? "").trim();
    setFocusedRootId(rid);
  }, [threadKey]); // when a new thread loads / selection changes, re-read hash

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
      // If the inline gate is active, do not keep refetching on selection changes.
      // The overlay explains what's happening; we keep the last-loaded thread blurred.
      if (inlineGate.open) return;

      const wantedFetch = threadWantedFetchKey;
      const wantedCore = threadWantedCoreKey;
      if (!wantedFetch || !wantedCore) return;

      // IMPORTANT: do not blank the UI on sort flips.
      // We keep rendering the current thread while this refresh is in-flight.
      setThreadLoading(true);
      setThreadErr("");

      const gk = (selected.groupKey ?? "").trim();

      const url =
        `/api/exegesis/thread?trackId=${encodeURIComponent(trackId)}` +
        (gk
          ? `&groupKey=${encodeURIComponent(gk)}&lineKey=${encodeURIComponent(
              selected.lineKey,
            )}`
          : `&lineKey=${encodeURIComponent(selected.lineKey)}`);
      // Sort is now client-side only (no fetch on toggle).

      try {
        const r = await fetch(url, { cache: "no-store" });
        const j = (await r.json()) as ThreadApiOk | ThreadApiErr;
        if (!alive) return;

        if (!j.ok) {
          // If we *already* have thread data, keep it visible (blurred) and gate further interaction.
          setThread((prev) => (prev ? prev : null));

          if (j.code === "ANON_LIMIT") {
            const msg =
              j.error ||
              "You’ve hit the anon reading limit for Exegesis. Sign in to continue reading the discussion.";

            // Inline-only: do NOT spotlight. Report via broker for global coherence.
            reportInlineGate({
              intent: "passive",
              message: msg,
              correlationId: null,
              forced: "readReceiptsCap",
            });

            // Keep the error out of the normal in-panel error box; the gate overlay owns this UX.
            setThreadErr("");
            return;
          }

          setThreadErr(j.error || "Failed to load thread.");
          return;
        }

        setThread(j);
        setThreadErr("");
        // Mark "loaded" at the core level, so sort flips don't invalidate readiness.
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
    trackId,
    selected?.lineKey,
    selected?.groupKey,
    threadWantedFetchKey,
    threadWantedCoreKey,
    viewerKey,
    reportInlineGate,
    inlineGate.open,
  ]);

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
      setHash({
        lineKey: selected.lineKey,
        commentId: j.comment.id,
        rootId: focusedRootId || undefined,
      });

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
        ``;

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
      setHash({
        lineKey: selected.lineKey,
        commentId: j.comment.id,
        rootId: focusedRootId || undefined,
      });

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
        ``;

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
          ``;
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

  React.useEffect(() => {
    if (viewerIdentity?.publicName) {
      setClaimOpen(false);
      setClaimErr("");
      setClaimName("");
    }
  }, [viewerIdentity?.publicName]);

  function rootTopScore(root: { rootId: string; comments: CommentDTO[] }) {
    // “Top” = aggregate votes in the root (simple + stable).
    return (root.comments ?? []).reduce(
      (sum, c) => sum + (c.voteCount ?? 0),
      0,
    );
  }

  function rootRecentTs(root: { rootId: string; comments: CommentDTO[] }) {
    // “Recent” = latest activity timestamp among comments (editedAt > createdAt).
    let best = 0;
    for (const c of root.comments ?? []) {
      const t = Date.parse((c.editedAt ?? c.createdAt) as string);
      if (!Number.isNaN(t)) best = Math.max(best, t);
    }
    return best;
  }

  function formatAgo(iso: string | null | undefined): string {
    const t = Date.parse((iso ?? "") as string);
    if (!Number.isFinite(t)) return "";
    const now = Date.now();
    const s = Math.max(0, Math.floor((now - t) / 1000));

    if (s < 60) return "just now";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    const w = Math.floor(d / 7);
    if (w < 52) return `${w}w ago`;
    const y = Math.floor(d / 365);
    return `${Math.max(1, y)}y ago`;
  }

  // If the page loads with a deep-link (#l / #c), open drawer on mobile.
  React.useEffect(() => {
    if (!isMobile) return;
    if (!selected?.lineKey) return;
    if (!openFromHashRef.current) return;

    setDrawerOpen(true);
    openFromHashRef.current = false;
  }, [isMobile, selected?.lineKey]);

  // Lock body scroll while drawer is open (mobile only).
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

    // raw offset of clicked line relative to the lyrics card
    let y = a.top - w.top;

    // Clamp so the panel stays within the lyrics card bounds.
    const maxY = Math.max(0, w.height - panelEl.offsetHeight);
    y = Math.max(0, Math.min(maxY, y));

    setPanelY(y);
  }

  // Re-measure when selection changes or layout changes.
  React.useEffect(() => {
    if (isMobile) return;

    const raf1 = window.requestAnimationFrame(() => {
      measureDesktopPanelH();
      measurePanelY();
      // second pass helps with fonts / late layout settle
      window.requestAnimationFrame(() => {
        measureDesktopPanelH();
        measurePanelY();
      });
    });

    return () => window.cancelAnimationFrame(raf1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile, selected?.lineKey, selected?.groupKey, threadKey]);

  // Re-measure on resize (desktop only).
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

        /* Nebulaic "adamantium" medal tint (applied to the button wrapper).
           Uses gradient text so the SVG (currentColor) inherits it. */
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

        /* Count badge "cutout" stroke (matches bg-white/5 vibe). No circle, no fill. */
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

        /* Scroll fade for mobile drawer scroll area (soft top/bottom edges). */
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
      <div>
        <h1 className="mt-1 text-xl font-semibold">
          <span className="opacity-90">
            {(props.trackTitle ?? "").trim() || lyrics.trackId}
          </span>
        </h1>
        {(props.trackArtist ?? "").trim() ? (
          <div className="mt-1 text-sm opacity-70">{props.trackArtist}</div>
        ) : null}
        {lyrics.geniusUrl ? (
          <a
            href={lyrics.geniusUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md p-1 text-[#fefe63] opacity-70 hover:opacity-100"
            title="Open on Genius"
            aria-label="Open on Genius"
          >
            <GeniusIcon className="h-7 w-auto" />
          </a>
        ) : null}
      </div>

      <div className="mt-6 grid gap-6 md:grid-cols-[1fr_570px]">
        <div ref={lyricsWrapRef} className="rounded-xl bg-white/5 p-4">
          <div
            className="mt-3 flex flex-col" // IMPORTANT: remove dead hover gaps from space-y-0.5
            onPointerMove={onLyricsPointerMove}
            onPointerLeave={clearHover}
          >
            {(lyrics.cues ?? []).map((c) => {
              const isSelected = selected?.lineKey === c.lineKey;

              const gk = cueCanonicalGroupKey(lyrics, c);

              const selectedGk = (selected?.groupKey ?? "").trim();
              const hoverGk = (hoverGroupKey ?? "").trim();
              const hoverLk = (hoverLineKey ?? "").trim();

              const isGrouped = !!gk;

              const inSelectedGroup = isGrouped && isSameGroup(gk, selectedGk);
              const inHoverGroup = isGrouped && isSameGroup(gk, hoverGk);

              // ungrouped hover applies only to the hovered line
              const inHoverLine = !isGrouped && hoverLk === c.lineKey;

              const inPreview =
                isSelected || inSelectedGroup || inHoverGroup || inHoverLine;

              return (
                <button
                  key={c.lineKey}
                  ref={(el) => {
                    lineBtnByKeyRef.current[c.lineKey] = el;
                  }}
                  type="button"
                  className="block w-full py-0.5 text-left"
                  data-linekey={c.lineKey}
                  data-groupkey={gk}
                  onFocus={() => scheduleHover({ gk, lk: c.lineKey })}
                  onBlur={clearHover}
                  onClick={() => {
                    const nextGroupKey = cueCanonicalGroupKey(lyrics, c);

                    setSelected({
                      lineKey: c.lineKey,
                      lineText: c.text,
                      tMs: c.tMs,
                      groupKey: nextGroupKey || undefined,
                    });

                    setHash({ lineKey: c.lineKey });

                    // Mobile: open the discourse drawer immediately.
                    if (isMobile) setDrawerOpen(true);
                  }}
                >
                  <span
                    className="inline-block rounded px-1.5 py-0.5 text-sm leading-snug transition-colors duration-75"
                    style={{
                      backgroundColor: isSelected
                        ? "var(--lxSelected)"
                        : inPreview
                          ? "var(--lxHover)"
                          : "var(--lxRow)",
                    }}
                  >
                    <span className="opacity-90">{c.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {(() => {
          // Mobile-only: reserve space for the ever-present MiniPlayer dock.
          // Keep this aligned with other pages that assume ~80px dock height.
          const DOCK_H = 80;

          const DiscoursePanel = (
            <div
              className={
                isMobile
                  ? "h-full bg-black p-4 flex flex-col"
                  : "rounded-xl bg-white/5 p-4 flex flex-col"
              }
              style={
                isMobile
                  ? undefined
                  : desktopPanelH
                    ? {
                        // Critical: allow the panel to be shorter than the rail so translateY can work.
                        // (If content grows, the internal scroll area still handles overflow.)
                        maxHeight: desktopPanelH,
                      }
                    : undefined
              }
            >
              {/* Inline-only gate boundary: affects discourse panel only (never lyrics). */}
              <div className="relative min-h-0 flex-1 flex flex-col">
                <div
                  className={
                    inlineGate.open
                      ? "min-h-0 flex-1 flex flex-col blur-[1.5px] opacity-55 pointer-events-none select-none"
                      : "min-h-0 flex-1 flex flex-col"
                  }
                >
                  {!selected ? (
                    <div className="rounded-xl bg-white/5 p-4">
                      <div className="text-sm opacity-70">
                        Select a line to view the discussion.
                      </div>
                    </div>
                  ) : shouldShowInitialShimmer ? (
                    <DiscourseShimmer />
                  ) : (
                    <>
                      {isLocked ? (
                        <div className="mt-2 rounded-md bg-white/5 p-3 text-sm">
                          <div className="opacity-80">
                            This thread is locked.
                          </div>
                          <div className="mt-1 text-xs opacity-60">
                            You can still read, but posting is disabled.
                          </div>
                        </div>
                      ) : null}

                      {selected ? (
                        <div className="mt-2 rounded-md bg-black/20 p-3 text-sm">
                          {(() => {
                            const gk = (selected.groupKey ?? "").trim();
                            if (!gk)
                              return (
                                <div className="mt-1">{selected.lineText}</div>
                              );

                            const lines = (lyrics.cues ?? [])
                              .filter((c) =>
                                isSameGroup(
                                  cueCanonicalGroupKey(lyrics, c),
                                  gk,
                                ),
                              )
                              .map((c) => c.text);

                            const safe =
                              lines.length > 0 ? lines : [selected.lineText];

                            return (
                              <div className="mt-1 space-y-1">
                                {safe.map((t, i) => (
                                  <div key={i}>{t}</div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      ) : null}

                      {showIdentityPanel ? (
                        <div className="mt-3 rounded-md bg-black/20 p-3 text-sm">
                          {canClaimName && !viewerIdentity?.publicName ? (
                            <div className="flex items-center justify-between gap-3">
                              <button
                                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                onClick={() => {
                                  setClaimErr("");
                                  setClaimOpen((v) => !v);
                                }}
                                title="Claim a public name"
                              >
                                Claim name
                              </button>
                            </div>
                          ) : null}

                          <div className="mt-1 text-sm">
                            Commenting as{" "}
                            <span className="font-semibold">
                              {identityLabel}
                            </span>
                          </div>

                          {!viewerIdentity?.publicName ? (
                            <div className="mt-1 text-xs opacity-60">
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
                                <div className="text-xs opacity-70">
                                  {claimErr}
                                </div>
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
                                  disabled={
                                    !canClaimName ||
                                    !claimName.trim() ||
                                    claimBusy
                                  }
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

                      <div className="relative">
                        {Composer}

                        {inlineGate.open ? (
                          <button
                            type="button"
                            className="absolute inset-0 z-10 rounded-lg border border-white/10 bg-black/35 backdrop-blur-[2px] text-left"
                            onClick={() => {
                              // single obvious action
                              if (isAnon) {
                                reportInlineGate({
                                  intent: "explicit",
                                  message:
                                    inlineGate.message ||
                                    "Discussion is exclusive to members.",
                                  correlationId:
                                    inlineGate.correlationId ?? null,
                                });
                                return;
                              }
                              openMembershipModal();
                            }}
                            aria-label="Unlock discussion"
                          >
                            <div className="px-3 py-2">
                              <div className="text-sm font-semibold text-white/90">
                                {isAnon
                                  ? "Sign in to continue"
                                  : "Upgrade to continue"}
                              </div>
                              <div className="mt-0.5 text-xs text-white/65">
                                {inlineGate.message ||
                                  "Unlock full discussion and posting."}
                              </div>
                            </div>
                          </button>
                        ) : null}
                      </div>

                      {/* Header controls: sort when browsing all; Back when focused */}
                      <div className="mt-3 flex items-center justify-end">
                        {focusedRootId ? (
                          <div className="w-full">
                            <button
                              type="button"
                              className="w-full rounded-md bg-white/5 px-2 py-1 text-xs text-left opacity-80 hover:bg-white/10 hover:opacity-100"
                              onClick={clearRootFocus}
                            >
                              ← Back to all threads
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              className={`rounded-md px-2 py-1 text-xs transition ${
                                sort === "top"
                                  ? "bg-white/10 opacity-100"
                                  : "bg-white/5 opacity-70 hover:opacity-100"
                              }`}
                              onClick={() => setSortWithFlip("top")}
                            >
                              Top
                            </button>
                            <button
                              className={`rounded-md px-2 py-1 text-xs transition ${
                                sort === "recent"
                                  ? "bg-white/10 opacity-100"
                                  : "bg-white/5 opacity-70 hover:opacity-100"
                              }`}
                              onClick={() => setSortWithFlip("recent")}
                            >
                              Recent
                            </button>
                          </div>
                        )}
                      </div>

                      <div
                        ref={threadScrollRef}
                        className={`mt-3 space-y-3 flex-1 ${isMobile ? "afFadeScroll" : ""}`}
                        style={{
                          overflowY: "auto",
                          overscrollBehavior: isMobile ? "contain" : "auto",
                          minHeight: 0, // critical for flex scroll containers
                          // Reserve space for the MiniPlayer dock *inside* the scroll region (mobile only),
                          // instead of creating dead space in the overall panel layout.
                          paddingBottom: isMobile ? DOCK_H : 0,
                        }}
                      >
                        <div className="mt-3 space-y-3">
                          {(rootsForView ?? []).length === 0 ? (
                            <div className="text-sm opacity-60">
                              {focusedRootId
                                ? "Thread not found."
                                : "Be the first to comment."}
                            </div>
                          ) : (
                            (rootsForView ?? []).map((root) => {
                              const allComments = root.comments ?? [];
                              const previewComments = allComments
                                .filter(
                                  (c) => (c.depth ?? 0) <= PREVIEW_MAX_DEPTH,
                                )
                                .slice(0, PREVIEW_MAX_COMMENTS);

                              const isFocused = !!focusedRootId;
                              const visibleComments = isFocused
                                ? allComments
                                : previewComments;

                              // We consider the preview "gated" if there exists deeper discussion,
                              // or if the count cap clipped anything.
                              const gated =
                                !isFocused &&
                                (allComments.some(
                                  (c) => (c.depth ?? 0) > PREVIEW_MAX_DEPTH,
                                ) ||
                                  previewComments.length < allComments.length);

                              return (
                                <div
                                  key={root.rootId}
                                  ref={(el) => {
                                    rootElByIdRef.current[root.rootId] = el;
                                  }}
                                  className="rounded-md bg-black/20"
                                >
                                  {visibleComments.map((c) => {
                                    const ident =
                                      thread?.identities?.[c.createdByMemberId];
                                    const name =
                                      ident?.publicName ||
                                      ident?.anonLabel ||
                                      "Anonymous";
                                    const replyBusy = Boolean(
                                      replyByCommentId[c.id]?.posting,
                                    );
                                    const isAuthor =
                                      !!viewerMemberId &&
                                      c.createdByMemberId === viewerMemberId;
                                    const canEdit =
                                      canPost &&
                                      !isLocked &&
                                      isAuthor &&
                                      c.status === "live";
                                    const editBusy = Boolean(
                                      editByCommentId[c.id]?.posting,
                                    );

                                    if (c.status === "deleted") return null;

                                    return (
                                      <div
                                        id={`exegesis-c-${c.id}`}
                                        key={c.id}
                                        className="group py-2 scroll-mt-4"
                                        style={{
                                          paddingLeft: Math.min(
                                            72,
                                            (c.depth ?? 0) * 12,
                                          ),
                                          borderLeft:
                                            (c.depth ?? 0) > 0
                                              ? "1px solid rgba(255,255,255,0.08)"
                                              : "none",
                                          marginLeft:
                                            (c.depth ?? 0) > 0 ? 6 : 0,
                                        }}
                                      >
                                        <div className="flex items-center justify-between gap-3">
                                          <div className="flex items-center gap-2">
                                            <div className="text-xs opacity-70">
                                              {name}
                                            </div>

                                            {(() => {
                                              const ago = formatAgo(
                                                c.createdAt,
                                              );
                                              return ago ? (
                                                <div className="text-[11px] opacity-45">
                                                  · {ago}
                                                </div>
                                              ) : null;
                                            })()}

                                            {c.editedAt ||
                                            (c.editCount ?? 0) > 0 ? (
                                              <div className="text-[11px] opacity-50">
                                                edited
                                              </div>
                                            ) : null}
                                          </div>

                                          <div className="flex items-center gap-2">
                                            {/* Hover-only actions (reply + report) */}
                                            <div className="flex items-center gap-2 md:opacity-0 transition-opacity duration-150 ease-out md:group-hover:opacity-100 group-focus-within:opacity-100">
                                              {canPost && !isLocked ? (
                                                <button
                                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                                  disabled={
                                                    replyBusy ||
                                                    c.status !== "live" ||
                                                    c.depth >= 6
                                                  }
                                                  onClick={() =>
                                                    openReply(c.id)
                                                  }
                                                  title={
                                                    c.depth >= 6
                                                      ? "Max thread depth reached"
                                                      : "Reply"
                                                  }
                                                  aria-label="Reply"
                                                >
                                                  <ReplyIcon className="h-4 w-4" />
                                                </button>
                                              ) : null}

                                              {canReport ? (
                                                <button
                                                  className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                                  onClick={() =>
                                                    openReport(c.id)
                                                  }
                                                  title="Report"
                                                  aria-label="Report"
                                                >
                                                  <ShieldAlertIcon className="h-4 w-4" />
                                                </button>
                                              ) : null}
                                            </div>

                                            {/* Vote always visible, far right (badge hides at 0, tier tint only after viewer votes) */}
                                            {(() => {
                                              const votes = Math.max(
                                                0,
                                                c.voteCount ?? 0,
                                              );
                                              const showBadge = votes > 0;

                                              const tier = medalTier(votes);
                                              const tint =
                                                votes > 0
                                                  ? medalClassForTier(tier)
                                                  : "text-white/80";

                                              const disabled = !canVote;

                                              return (
                                                <button
                                                  className={`group relative inline-flex items-center justify-center rounded-md px-2 py-1 text-xs ${
                                                    disabled ? "opacity-70" : ""
                                                  } ${tint}
  [--voteBgRgb:17_17_17] hover:[--voteBgRgb:22_22_22]
  bg-[rgb(var(--voteBgRgb)/0.55)] hover:bg-[rgb(var(--voteBgRgb)/0.55)]`}
                                                  disabled={disabled}
                                                  onClick={
                                                    disabled
                                                      ? undefined
                                                      : () =>
                                                          void toggleVote(c.id)
                                                  }
                                                  title={
                                                    disabled
                                                      ? thread?.viewer.kind ===
                                                        "anon"
                                                        ? "Sign in to vote"
                                                        : "Friend tier or higher required to vote"
                                                      : "Vote"
                                                  }
                                                  aria-label="Vote"
                                                >
                                                  <span className="relative inline-flex h-4 w-4 items-center justify-center">
                                                    <MedalIcon className="h-4 w-4" />

                                                    {showBadge ? (
                                                      <span
                                                        className="absolute text-[9px] font-black leading-[9px] tabular-nums text-current"
                                                        style={{
                                                          right: "0px",
                                                          top: "-1px",
                                                          pointerEvents: "none",
                                                          // True outline (no second glyph -> no misregistration).
                                                          WebkitTextStroke:
                                                            "2px rgb(var(--voteBgRgb) / 0.55)",
                                                          // Helps some rasterizers keep the stroke visually “outside”.
                                                          paintOrder:
                                                            "stroke fill",
                                                        }}
                                                      >
                                                        {votes}
                                                      </span>
                                                    ) : null}
                                                  </span>
                                                </button>
                                              );
                                            })()}
                                          </div>
                                        </div>

                                        {c.status === "hidden" ? (
                                          <div className="mt-1 text-sm opacity-60 italic">
                                            This comment is hidden.
                                          </div>
                                        ) : (
                                          <div className="mt-1">
                                            {isTipTapDoc(c.bodyRich) ? (
                                              <TipTapReadOnly
                                                doc={c.bodyRich}
                                              />
                                            ) : (
                                              <div className="text-sm whitespace-pre-wrap">
                                                {c.bodyPlain}
                                              </div>
                                            )}

                                            {/* Edit: small, under text, left-aligned */}
                                            {canEdit ? (
                                              <div className="mt-1 flex items-center">
                                                <button
                                                  className="rounded bg-white/0 px-1 py-0.5 text-[11px] opacity-70 hover:bg-white/5 hover:opacity-100 disabled:opacity-40"
                                                  disabled={
                                                    editBusy || replyBusy
                                                  }
                                                  onClick={() => openEdit(c)}
                                                  title="Edit"
                                                >
                                                  Edit
                                                </button>
                                              </div>
                                            ) : null}
                                          </div>
                                        )}

                                        {canPost &&
                                        !isLocked &&
                                        canEdit &&
                                        editByCommentId[c.id]?.open ? (
                                          <div
                                            ref={(el) => {
                                              editWrapByIdRef.current[c.id] =
                                                el;
                                            }}
                                            className="mt-2 rounded-md bg-black/25 p-3"
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="text-xs opacity-70">
                                                Edit
                                              </div>
                                            </div>

                                            <div className="mt-2">
                                              <TipTapEditor
                                                key={`edit-${c.id}-${editMountKey}-${editByCommentId[c.id]?.ui ?? "basic"}`}
                                                valuePlain={
                                                  editByCommentId[c.id]
                                                    ?.plain ?? ""
                                                }
                                                valueDoc={
                                                  editByCommentId[c.id]?.doc ??
                                                  null
                                                }
                                                disabled={
                                                  editByCommentId[c.id]?.posting
                                                }
                                                showToolbar={
                                                  (editByCommentId[c.id]?.ui ??
                                                    "basic") === "full"
                                                }
                                                autofocus
                                                placeholder="Edit your comment…"
                                                onChangePlain={(plain) =>
                                                  setEditByCommentId(
                                                    (prev) => ({
                                                      ...prev,
                                                      [c.id]: {
                                                        ...(prev[
                                                          c.id
                                                        ] as EditDraft),
                                                        plain,
                                                        err: "",
                                                      },
                                                    }),
                                                  )
                                                }
                                                onChangeDoc={(doc) =>
                                                  setEditByCommentId(
                                                    (prev) => ({
                                                      ...prev,
                                                      [c.id]: {
                                                        ...(prev[
                                                          c.id
                                                        ] as EditDraft),
                                                        doc,
                                                        err: "",
                                                      },
                                                    }),
                                                  )
                                                }
                                              />
                                            </div>

                                            <div className="mt-2 flex items-center justify-between gap-3">
                                              <button
                                                type="button"
                                                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                                disabled={
                                                  editByCommentId[c.id]?.posting
                                                }
                                                onClick={() =>
                                                  setEditByCommentId(
                                                    (prev) => ({
                                                      ...prev,
                                                      [c.id]: {
                                                        ...(prev[
                                                          c.id
                                                        ] as EditDraft),
                                                        ui:
                                                          (prev[c.id]?.ui ??
                                                            "basic") === "full"
                                                            ? "basic"
                                                            : "full",
                                                      },
                                                    }),
                                                  )
                                                }
                                                title={
                                                  (editByCommentId[c.id]?.ui ??
                                                    "basic") === "full"
                                                    ? "Hide formatting"
                                                    : "Formatting"
                                                }
                                              >
                                                Aa
                                              </button>

                                              <div className="text-xs opacity-60">
                                                {
                                                  (
                                                    editByCommentId[c.id]
                                                      ?.plain ?? ""
                                                  ).trim().length
                                                }
                                                /5000
                                              </div>
                                            </div>

                                            {editByCommentId[c.id]?.err ? (
                                              <div className="mt-2 text-xs opacity-75">
                                                {editByCommentId[c.id]?.err}
                                              </div>
                                            ) : null}

                                            <div className="mt-2 flex items-center justify-between">
                                              <button
                                                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                                                disabled={
                                                  editByCommentId[c.id]
                                                    ?.posting ||
                                                  !(
                                                    editByCommentId[c.id]
                                                      ?.plain ?? ""
                                                  ).trim()
                                                }
                                                onClick={() =>
                                                  void submitEdit(c)
                                                }
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
                                          <div
                                            ref={(el) => {
                                              replyWrapByIdRef.current[c.id] =
                                                el;
                                            }}
                                            className="mt-2 rounded-md bg-black/25 p-3"
                                          >
                                            <div className="flex items-center justify-between gap-3">
                                              <div className="text-xs opacity-70">
                                                Reply
                                              </div>
                                            </div>

                                            <div className="mt-2">
                                              <TipTapEditor
                                                key={`reply-${c.id}-${replyMountKey}-${replyByCommentId[c.id]?.ui ?? "basic"}`}
                                                valuePlain={
                                                  replyByCommentId[c.id]
                                                    ?.plain ?? ""
                                                }
                                                valueDoc={
                                                  replyByCommentId[c.id]?.doc ??
                                                  null
                                                }
                                                disabled={
                                                  replyByCommentId[c.id]
                                                    ?.posting
                                                }
                                                showToolbar={
                                                  (replyByCommentId[c.id]?.ui ??
                                                    "basic") === "full"
                                                }
                                                autofocus
                                                placeholder="Write a reply…"
                                                onChangePlain={(plain) =>
                                                  setReplyByCommentId(
                                                    (prev) => ({
                                                      ...prev,
                                                      [c.id]: {
                                                        ...(prev[
                                                          c.id
                                                        ] as ReplyDraft),
                                                        plain,
                                                        err: "",
                                                      },
                                                    }),
                                                  )
                                                }
                                                onChangeDoc={(doc) =>
                                                  setReplyByCommentId(
                                                    (prev) => ({
                                                      ...prev,
                                                      [c.id]: {
                                                        ...(prev[
                                                          c.id
                                                        ] as ReplyDraft),
                                                        doc,
                                                        err: "",
                                                      },
                                                    }),
                                                  )
                                                }
                                              />
                                            </div>

                                            <div className="mt-2 flex items-center justify-between gap-3">
                                              <button
                                                type="button"
                                                className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40"
                                                disabled={
                                                  replyByCommentId[c.id]
                                                    ?.posting
                                                }
                                                onClick={() =>
                                                  setReplyByCommentId(
                                                    (prev) => ({
                                                      ...prev,
                                                      [c.id]: {
                                                        ...(prev[
                                                          c.id
                                                        ] as ReplyDraft),
                                                        ui:
                                                          (prev[c.id]?.ui ??
                                                            "basic") === "full"
                                                            ? "basic"
                                                            : "full",
                                                      },
                                                    }),
                                                  )
                                                }
                                                title={
                                                  (replyByCommentId[c.id]?.ui ??
                                                    "basic") === "full"
                                                    ? "Hide formatting"
                                                    : "Formatting"
                                                }
                                              >
                                                Aa
                                              </button>

                                              <div className="text-xs opacity-60">
                                                {
                                                  (
                                                    replyByCommentId[c.id]
                                                      ?.plain ?? ""
                                                  ).trim().length
                                                }
                                                /5000
                                              </div>
                                            </div>

                                            {replyByCommentId[c.id]?.err ? (
                                              <div className="mt-2 text-xs opacity-75">
                                                {replyByCommentId[c.id]?.err}
                                              </div>
                                            ) : null}

                                            <div className="mt-2 flex items-center justify-between">
                                              <button
                                                className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                                                disabled={
                                                  replyByCommentId[c.id]
                                                    ?.posting ||
                                                  !(
                                                    replyByCommentId[c.id]
                                                      ?.plain ?? ""
                                                  ).trim()
                                                }
                                                onClick={() =>
                                                  void postReply(c)
                                                }
                                              >
                                                {replyByCommentId[c.id]?.posting
                                                  ? "Posting…"
                                                  : "Post reply"}
                                              </button>
                                            </div>
                                          </div>
                                        ) : null}

                                        {canReport &&
                                        reportByCommentId[c.id]?.open ? (
                                          <div
                                            ref={(el) => {
                                              reportWrapByIdRef.current[c.id] =
                                                el;
                                            }}
                                            className="mt-2 rounded-md bg-black/25 p-3 text-sm"
                                          >
                                            {reportByCommentId[c.id]?.done ? (
                                              <div className="text-xs opacity-75">
                                                Report submitted. Thanks — this
                                                helps keep the discourse usable.
                                              </div>
                                            ) : (
                                              <>
                                                <div className="flex items-center justify-between gap-3">
                                                  <div className="text-xs opacity-70">
                                                    Report this comment
                                                  </div>
                                                </div>

                                                <div className="mt-2 grid gap-2">
                                                  <select
                                                    className="w-full rounded-md bg-black/20 px-3 py-2 text-sm outline-none"
                                                    value={
                                                      reportByCommentId[c.id]
                                                        ?.category ?? "spam"
                                                    }
                                                    onChange={(e) =>
                                                      setReportByCommentId(
                                                        (prev) => ({
                                                          ...prev,
                                                          [c.id]: {
                                                            ...(prev[
                                                              c.id
                                                            ] as ReportDraft),
                                                            category:
                                                              e.target.value,
                                                            err: "",
                                                          },
                                                        }),
                                                      )
                                                    }
                                                  >
                                                    {REPORT_CATEGORIES.map(
                                                      (opt) => (
                                                        <option
                                                          key={opt.key}
                                                          value={opt.key}
                                                        >
                                                          {opt.label}
                                                        </option>
                                                      ),
                                                    )}
                                                  </select>

                                                  <textarea
                                                    className="min-h-[90px] w-full rounded-md bg-black/20 p-3 text-sm outline-none"
                                                    placeholder="Describe the issue (20–300 chars)."
                                                    value={
                                                      reportByCommentId[c.id]
                                                        ?.reason ?? ""
                                                    }
                                                    onChange={(e) =>
                                                      setReportByCommentId(
                                                        (prev) => ({
                                                          ...prev,
                                                          [c.id]: {
                                                            ...(prev[
                                                              c.id
                                                            ] as ReportDraft),
                                                            reason:
                                                              e.target.value,
                                                            err: "",
                                                          },
                                                        }),
                                                      )
                                                    }
                                                  />

                                                  {reportByCommentId[c.id]
                                                    ?.err ? (
                                                    <div className="text-xs opacity-75">
                                                      {
                                                        reportByCommentId[c.id]
                                                          ?.err
                                                      }
                                                    </div>
                                                  ) : null}

                                                  <div className="flex items-center justify-between">
                                                    <div className="text-xs opacity-60">
                                                      {
                                                        (
                                                          reportByCommentId[
                                                            c.id
                                                          ]?.reason ?? ""
                                                        ).trim().length
                                                      }
                                                      /300
                                                    </div>
                                                    <button
                                                      className="rounded-md bg-white/10 px-3 py-1.5 text-sm hover:bg-white/15 disabled:opacity-40"
                                                      disabled={
                                                        reportByCommentId[c.id]
                                                          ?.busy ||
                                                        (
                                                          reportByCommentId[
                                                            c.id
                                                          ]?.reason ?? ""
                                                        ).trim().length < 20 ||
                                                        (
                                                          reportByCommentId[
                                                            c.id
                                                          ]?.reason ?? ""
                                                        ).trim().length > 300
                                                      }
                                                      onClick={() =>
                                                        void submitReport(c.id)
                                                      }
                                                    >
                                                      {reportByCommentId[c.id]
                                                        ?.busy
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

                                  {gated ? (
                                    <div
                                      className="mt-2"
                                      style={{
                                        // match the indentation + vertical thread line vibe
                                        paddingLeft: Math.min(72, 3 * 12),
                                        borderLeft:
                                          "1px solid rgba(255,255,255,0.08)",
                                        marginLeft: 6,
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="inline-flex items-center rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                                        onClick={() => focusRoot(root.rootId)}
                                      >
                                        Open full thread
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {inlineGate.open ? (
                  <div className="absolute inset-0 grid place-items-center p-4">
                    <div className="w-full max-w-[520px]">
                      <ActivationGate>
                        <div />
                      </ActivationGate>

                      {inlineGate.message ? (
                        <div className="mt-2 rounded-md bg-black/30 p-3 text-sm opacity-90">
                          {inlineGate.message}
                        </div>
                      ) : null}

                      <div className="mt-2 flex items-center justify-end">
                        <button
                          type="button"
                          className="rounded-md bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                          onClick={() => {
                            broker.clearGate({ domain: EXEGESIS_DOMAIN });
                            clearInlineGate();
                          }}
                        >
                          Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );

          return (
            <>
              {/* Desktop/tablet: anchored panel in the right column */}
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

              {/* Mobile: overlay + sliding drawer (always mounted for exit animation) */}
              {isMobile ? (
                <>
                  {/* Overlay */}
                  <div
                    className={`fixed inset-0 z-[60] md:hidden bg-black/70 transition-opacity duration-200 ease-out ${
                      drawerOpen
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                    }`}
                  >
                    {/* Left sliver tap target */}
                    <button
                      type="button"
                      aria-label="Back to lyrics"
                      className="absolute left-0 top-0 h-[100dvh] w-14"
                      onClick={() => setDrawerOpen(false)}
                    />
                  </div>

                  {/* Drawer */}
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
