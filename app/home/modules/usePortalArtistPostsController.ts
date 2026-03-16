"use client";

import React from "react";
import { replaceQuery, useClientSearchParams } from "@/app/home/urlState";
import { usePortalViewer } from "@/app/home/PortalViewerProvider";
import { useMembershipModal } from "@/app/home/MembershipModalProvider";
import {
  useShareAction,
  useShareBuilders,
} from "@/app/home/player/ShareAction";
import { useGateBroker } from "@/app/home/gating/GateBroker";
import type { GateDomain } from "@/app/home/gating/gateTypes";
import {
  gatePayloadFromUnknown,
  gateResultFromPayload,
} from "@/app/home/gating/fromPayload";
import type {
  ArtistPostsResponse,
  PortalArtistPostsProps,
  Post,
  PostType,
  SeenOkResponse,
  SubmitResponse,
} from "./portalArtistPostsTypes";

const COMPOSER_CLOSE_MS = 280;

function shareUrlFor(slug: string) {
  if (typeof window === "undefined") return "";

  const current = new URL(window.location.href);
  const next = new URL(window.location.origin);
  next.pathname = "/journal";

  const keep = new URLSearchParams();
  const st = (current.searchParams.get("st") ?? "").trim();
  const share = (current.searchParams.get("share") ?? "").trim();
  const autoplay = (current.searchParams.get("autoplay") ?? "").trim();

  if (st) keep.set("st", st);
  else if (share) keep.set("share", share);

  if (autoplay) keep.set("autoplay", autoplay);

  for (const [key, value] of current.searchParams.entries()) {
    if (key.startsWith("utm_") && value.trim()) {
      keep.set(key, value.trim());
    }
  }

  keep.set("post", slug);
  keep.delete("pt");

  next.search = keep.toString();
  return next.toString();
}

function parsePostsResponse(raw: unknown): ArtistPostsResponse {
  const candidate = raw as Partial<ArtistPostsResponse>;
  const posts = Array.isArray(candidate.posts) ? candidate.posts : [];

  return {
    ok: Boolean(candidate.ok),
    posts: posts as Post[],
    nextCursor:
      typeof candidate.nextCursor === "string" ? candidate.nextCursor : null,
    correlationId:
      typeof candidate.correlationId === "string"
        ? candidate.correlationId
        : undefined,
  };
}

function isSubmitResponse(value: unknown): value is SubmitResponse {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.ok !== "boolean") return false;
  if (record.ok === true) return true;
  return typeof record.code === "string";
}

function useElementWidth<T extends HTMLElement>(): [
  React.RefObject<T | null>,
  number,
] {
  const ref = React.useRef<T | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const read = () => {
      const next = Math.ceil(node.getBoundingClientRect().width);
      setWidth((prev) => (prev === next ? prev : next));
    };

    read();

    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(() => {
        read();
      });
      observer.observe(node);
      return () => observer.disconnect();
    }

    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return [ref, width];
}

function useMinWidth(minWidthPx: number): boolean {
  const [matches, setMatches] = React.useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(min-width: ${minWidthPx}px)`).matches;
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(`(min-width: ${minWidthPx}px)`);

    const onChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    setMatches(mediaQuery.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", onChange);
      return () => mediaQuery.removeEventListener("change", onChange);
    }

    mediaQuery.addListener(onChange);
    return () => mediaQuery.removeListener(onChange);
  }, [minWidthPx]);

  return matches;
}

export function usePortalArtistPostsController(
  props: Pick<
    PortalArtistPostsProps,
    "pageSize" | "minVisibility" | "requireAuthAfter" | "authorName"
  >,
) {
  const { pageSize, minVisibility, requireAuthAfter, authorName } = props;

  const gateDomain: GateDomain = "journal";

  const mountId = React.useId();
  const mountIdRef = React.useRef(mountId);

  React.useEffect(() => {
    const tag = `[PortalArtistPosts ${mountId}]`;
    console.log(`${tag} MOUNT`, {
      href: typeof window !== "undefined" ? window.location.href : "(ssr)",
    });

    return () => {
      console.log(`${tag} UNMOUNT`);
    };
  }, [mountId]);

  const searchParams = useClientSearchParams();
  const deepSlug = (searchParams.get("post") ?? "").trim() || null;

  const urlType = (searchParams.get("postType") ?? "").trim().toLowerCase();
  const initialFilter: "" | PostType =
    urlType === "qa" ||
    urlType === "creative" ||
    urlType === "civic" ||
    urlType === "cosmic"
      ? urlType
      : "";

  const [postTypeFilter, setPostTypeFilter] = React.useState<"" | PostType>(
    initialFilter,
  );

  const { share, fallbackModal } = useShareAction();
  const shareBuilders = useShareBuilders();

  const { openMembershipModal } = useMembershipModal();
  const { tier, isSignedIn } = usePortalViewer();

  const broker = useGateBroker();
  const [inlineGateActive, setInlineGateActive] = React.useState(false);
  const [inlineGateMsg, setInlineGateMsg] = React.useState(
    "Sign in to keep reading.",
  );

  React.useEffect(() => {
    if (!isSignedIn) return;
    setInlineGateActive(false);
    broker.clearGate({ domain: gateDomain });
  }, [isSignedIn, broker]);

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [composerClosing, setComposerClosing] = React.useState(false);
  const composerCloseTimerRef = React.useRef<number | null>(null);

  const [questionText, setQuestionText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);
  const [thanks, setThanks] = React.useState(false);
  const [termsOpen, setTermsOpen] = React.useState(false);

  const MAX_CHARS = 800;

  const [askerName, setAskerName] = React.useState("");
  const MAX_NAME_CHARS = 48;

  const canSubmit = isSignedIn && (tier === "patron" || tier === "partner");

  const thankTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (thankTimerRef.current) window.clearTimeout(thankTimerRef.current);
      if (composerCloseTimerRef.current) {
        window.clearTimeout(composerCloseTimerRef.current);
      }
    };
  }, []);

  const closeComposer = React.useCallback(() => {
    setSubmitErr(null);

    if (!composerOpen || composerClosing) return;

    setComposerClosing(true);

    if (composerCloseTimerRef.current) {
      window.clearTimeout(composerCloseTimerRef.current);
    }

    composerCloseTimerRef.current = window.setTimeout(() => {
      setComposerOpen(false);
      setComposerClosing(false);
      composerCloseTimerRef.current = null;
    }, COMPOSER_CLOSE_MS);
  }, [composerClosing, composerOpen]);

  const openComposer = React.useCallback(() => {
    if (composerCloseTimerRef.current) {
      window.clearTimeout(composerCloseTimerRef.current);
      composerCloseTimerRef.current = null;
    }

    setThanks(false);
    setSubmitErr(null);
    setComposerClosing(false);
    setComposerOpen(true);
  }, []);

  const [posts, setPosts] = React.useState<Post[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [cursor, setCursor] = React.useState<string | null>("0");
  const [, setErr] = React.useState<string | null>(null);

  const [copiedSlug, setCopiedSlug] = React.useState<string | null>(null);
  const [toastVisible, setToastVisible] = React.useState(false);

  const copiedTimerRef = React.useRef<number | null>(null);
  const toastTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const postEls = React.useRef<Map<string, HTMLDivElement>>(new Map());
  const loadingRef = React.useRef(false);
  const inflightRef = React.useRef<AbortController | null>(null);
  const inflightKeyRef = React.useRef("");

  const isSignedInRef = React.useRef<boolean>(isSignedIn);
  const requireAuthAfterRef = React.useRef<number>(requireAuthAfter);

  React.useEffect(() => {
    isSignedInRef.current = isSignedIn;
  }, [isSignedIn]);

  React.useEffect(() => {
    requireAuthAfterRef.current = requireAuthAfter;
  }, [requireAuthAfter]);

  const markSeen = React.useCallback(
    async (slugs: string[], correlationId: string) => {
      if (isSignedInRef.current) return;
      const cap = requireAuthAfterRef.current;
      if (!cap || cap <= 0) return;
      if (!Array.isArray(slugs) || slugs.length === 0) return;

      try {
        const response = await fetch("/api/artist-posts/seen", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-correlation-id": correlationId,
          },
          body: JSON.stringify({
            slugs,
            cap,
          }),
        });

        const raw: unknown = await response.json().catch(() => null);
        const payload = gatePayloadFromUnknown(raw);

        if (payload) {
          const decision = gateResultFromPayload({
            payload,
            attempt: { verb: "markSeen", domain: gateDomain },
            isSignedIn: false,
            intent: "passive",
          });

          if (!decision.ok) {
            broker.reportGate({
              ...decision.reason,
              uiMode: decision.uiMode,
              correlationId: payload.correlationId ?? null,
            });

            setInlineGateMsg(
              (
                payload.message ||
                decision.reason.message ||
                "Sign in to keep reading."
              ).trim(),
            );
            setInlineGateActive(true);
          }

          return;
        }

        const ok = raw as Partial<SeenOkResponse>;
        if (ok && ok.ok === true) return;
      } catch {
        return;
      }
    },
    [broker],
  );

  const fetchPage = React.useCallback(
    async (nextCursor: string | null) => {
      if (loadingRef.current) return;
      if (nextCursor === null) return;

      const requestKey = JSON.stringify({
        nextCursor: nextCursor ?? "",
        pageSize,
        minVisibility,
        postTypeFilter: postTypeFilter ?? "",
      });

      if (inflightRef.current && inflightKeyRef.current === requestKey) return;

      if (inflightRef.current) {
        inflightRef.current.abort();
        inflightRef.current = null;
        inflightKeyRef.current = "";
      }

      const abortController = new AbortController();
      inflightRef.current = abortController;
      inflightKeyRef.current = requestKey;

      const isFirstPage = nextCursor === "0";

      loadingRef.current = true;
      if (isFirstPage && posts.length > 0) setRefreshing(true);
      else setLoading(true);

      const filterAtCall = postTypeFilter;
      setErr(null);

      try {
        const url = new URL("/api/artist-posts", window.location.origin);
        url.searchParams.set("limit", String(pageSize));
        url.searchParams.set("minVisibility", minVisibility);
        if (postTypeFilter) url.searchParams.set("postType", postTypeFilter);
        if (nextCursor !== "0") url.searchParams.set("offset", nextCursor);

        console.log(`[PortalArtistPosts ${mountIdRef.current}] fetchPage`, {
          nextCursor,
          pageSize,
          minVisibility,
          postTypeFilter,
        });

        const correlationId = crypto.randomUUID();

        const response = await fetch(url.toString(), {
          method: "GET",
          signal: abortController.signal,
          cache: "no-store",
          headers: { "x-correlation-id": correlationId },
        });

        if (!response.ok) {
          throw new Error(`Fetch failed (${response.status})`);
        }

        const parsed = parsePostsResponse(await response.json());

        if (filterAtCall !== postTypeFilter) return;

        const nextPosts = Array.isArray(parsed.posts) ? parsed.posts : [];
        setPosts((current) =>
          nextCursor !== "0" ? [...current, ...nextPosts] : nextPosts,
        );
        setCursor(parsed.nextCursor);

        if (!isSignedInRef.current && requireAuthAfterRef.current > 0) {
          const slugs = nextPosts
            .map((post) =>
              post && typeof post.slug === "string" ? post.slug.trim() : "",
            )
            .filter((slug) => slug.length > 0);

          void markSeen(slugs, parsed.correlationId ?? correlationId);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        const message =
          error instanceof Error ? error.message : "Failed to load posts";
        setErr(message);
      } finally {
        if (inflightRef.current === abortController) {
          inflightRef.current = null;
          inflightKeyRef.current = "";
          loadingRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [pageSize, minVisibility, postTypeFilter, markSeen, posts.length],
  );

  React.useEffect(() => {
    return () => {
      inflightRef.current?.abort();
      inflightRef.current = null;
      inflightKeyRef.current = "";
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    setCursor("0");
    setErr(null);
    void fetchPage("0");
  }, [postTypeFilter, pageSize, minVisibility, fetchPage]);

  React.useEffect(() => {
    if (!deepSlug) return;
    const element = postEls.current.get(deepSlug);
    if (!element) return;
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [deepSlug, posts.length]);

  const registerPostElement = React.useCallback(
    (slug: string, node: HTMLDivElement | null) => {
      if (!node) {
        postEls.current.delete(slug);
        return;
      }
      postEls.current.set(slug, node);
    },
    [],
  );

  const triggerCopiedFeedback = React.useCallback((slug: string) => {
    setCopiedSlug(slug);

    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedSlug((current) => (current === slug ? null : current));
    }, 1200);

    setToastVisible(true);

    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 1600);
  }, []);

  const submitQuestion = React.useCallback(async () => {
    if (!canSubmit) {
      openMembershipModal();
      return;
    }

    const text = questionText.trim();
    if (!text) {
      setSubmitErr("Write a question first.");
      return;
    }

    if (text.length > MAX_CHARS) {
      setSubmitErr(`Keep it under ${MAX_CHARS} characters.`);
      return;
    }

    setSubmitting(true);
    setSubmitErr(null);

    try {
      const nameClean = askerName.trim();

      const response = await fetch("/api/mailbag/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionText: text,
          askerName: nameClean ? nameClean : null,
        }),
      });

      if (response.status === 404) {
        setSubmitErr("Mailbag submissions aren’t live yet.");
        return;
      }

      const raw: unknown = await response.json().catch(() => null);
      const data: SubmitResponse | null = isSubmitResponse(raw) ? raw : null;

      if (!response.ok || !data || data.ok === false) {
        const code = data && data.ok === false ? data.code : null;

        if (code === "TIER_REQUIRED") {
          openMembershipModal();
          setSubmitErr("Upgrade to Patron to submit questions.");
          return;
        }

        if (code === "RATE_LIMIT") {
          setSubmitErr(
            "You’ve asked three questions today. Hold on until tomorrow to ask another.",
          );
          return;
        }

        if (code === "TOO_LONG") {
          setSubmitErr(`Keep it under ${MAX_CHARS} characters.`);
          return;
        }

        if (code === "NOT_AUTHED") {
          setSubmitErr("Please sign in first.");
          return;
        }

        setSubmitErr("Couldn’t submit right now. Try again.");
        return;
      }

      setQuestionText("");
      setAskerName("");
      closeComposer();
      setThanks(true);

      if (thankTimerRef.current) window.clearTimeout(thankTimerRef.current);
      thankTimerRef.current = window.setTimeout(() => setThanks(false), 2200);
    } catch {
      setSubmitErr("Couldn’t submit right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [
    askerName,
    canSubmit,
    closeComposer,
    openMembershipModal,
    questionText,
  ]);

  const onShare = React.useCallback(
    async (post: { slug: string; title?: string }) => {
      const url = shareUrlFor(post.slug);

      const target = shareBuilders.post(
        { slug: post.slug, title: post.title?.trim() || "Post" },
        authorName,
      );

      const result = await share({ ...target, url });

      if (result.ok && result.method === "copy") {
        triggerCopiedFeedback(post.slug);
      }

      replaceQuery({ post: post.slug, pt: null });
    },
    [authorName, share, shareBuilders, triggerCopiedFeedback],
  );

  const onChangeFilter = React.useCallback((next: "" | PostType) => {
    setPostTypeFilter(next);
  }, []);

  const composerPresent = composerOpen || composerClosing;
  const composerExpanded = composerOpen && !composerClosing;

  const isWideToolbarViewport = useMinWidth(760);
  const useOverlayToolbar =
    isWideToolbarViewport && !composerPresent;

  const [overlayToolbarRef, overlayToolbarWidth] =
    useElementWidth<HTMLDivElement>();

  const firstPostHeaderInsetPx = useOverlayToolbar
    ? Math.max(0, overlayToolbarWidth + 16)
    : 0;

  return {
    deepSlug,
    postTypeFilter,
    posts,
    loading,
    refreshing,
    cursor,
    copiedSlug,
    toastVisible,
    composerOpen: composerExpanded,
    composerPresent,
    questionText,
    submitting,
    submitErr,
    thanks,
    termsOpen,
    askerName,
    maxChars: MAX_CHARS,
    maxNameChars: MAX_NAME_CHARS,
    inlineGateActive,
    inlineGateMsg,
    fallbackModal,
    useOverlayToolbar,
    overlayToolbarRef,
    firstPostHeaderInsetPx,
    onChangeFilter,
    openComposer,
    closeComposer,
    setQuestionText,
    setAskerName,
    setTermsOpen,
    submitQuestion,
    onShare,
    fetchPage,
    registerPostElement,
  };
}