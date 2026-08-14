// web/app/home/modules/usePortalArtistPostsController.ts
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

type SubmitFailure = Readonly<{
  message: string;
  openMembership: boolean;
}>;

function isSameInflightRequest(
  inflight: AbortController | null,
  inflightKey: string,
  requestKey: string,
): boolean {
  return inflight !== null && inflightKey === requestKey;
}

function buildArtistPostsUrl(
  params: Readonly<{
    pageSize: number;
    minVisibility: PortalArtistPostsProps["minVisibility"];
    postTypeFilter: "" | PostType;
    nextCursor: string;
  }>,
): URL {
  const url = new URL("/api/artist-posts", window.location.origin);
  url.searchParams.set("limit", String(params.pageSize));
  url.searchParams.set("minVisibility", params.minVisibility);

  if (params.postTypeFilter) {
    url.searchParams.set("postType", params.postTypeFilter);
  }

  if (params.nextCursor !== "0") {
    url.searchParams.set("offset", params.nextCursor);
  }

  return url;
}

function mergeArtistPostPage(
  current: Post[],
  nextPosts: Post[],
  nextCursor: string,
): Post[] {
  if (nextCursor === "0") return nextPosts;
  return [...current, ...nextPosts];
}

function extractPostSlugs(
  posts: readonly (Post | null | undefined)[],
): string[] {
  const slugs: string[] = [];

  for (const post of posts) {
    if (typeof post?.slug !== "string") continue;
    const slug = post.slug.trim();
    if (slug) slugs.push(slug);
  }

  return slugs;
}

function shouldMarkPostsSeen(
  isSignedIn: boolean,
  requireAuthAfter: number,
): boolean {
  return !isSignedIn && requireAuthAfter > 0;
}

function startArtistPostsLoading(
  isFirstPage: boolean,
  existingPostCount: number,
  setLoading: React.Dispatch<React.SetStateAction<boolean>>,
  setRefreshing: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  if (isFirstPage && existingPostCount > 0) {
    setRefreshing(true);
    return;
  }

  setLoading(true);
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function fetchErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Failed to load posts";
}

function submitFailureFor(
  responseOk: boolean,
  data: SubmitResponse | null,
  maxChars: number,
): SubmitFailure | null {
  if (responseOk && data?.ok === true) return null;

  if (data?.ok !== false) {
    return {
      message: "Couldn’t submit right now. Try again.",
      openMembership: false,
    };
  }

  switch (data.code) {
    case "TIER_REQUIRED":
      return {
        message: "Upgrade to Patron to submit questions.",
        openMembership: true,
      };
    case "RATE_LIMIT":
      return {
        message:
          "You’ve asked three questions today. Hold on until tomorrow to ask another.",
        openMembership: false,
      };
    case "TOO_LONG":
      return {
        message: `Keep it under ${maxChars} characters.`,
        openMembership: false,
      };
    case "NOT_AUTHED":
      return {
        message: "Please sign in first.",
        openMembership: false,
      };
    default:
      return {
        message: "Couldn’t submit right now. Try again.",
        openMembership: false,
      };
  }
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

    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
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
    console.log("[PortalArtistPosts] MOUNT", {
      mountId,
      href: typeof window !== "undefined" ? window.location.href : "(ssr)",
    });

    return () => {
      console.log("[PortalArtistPosts] UNMOUNT", { mountId });
    };
  }, [mountId]);

  const searchParams = useClientSearchParams();
  const deepSlug = (searchParams.get("post") ?? "").trim() || null;
  const urlPostType = searchParams.get("postType");
  const urlPt = searchParams.get("pt");

  const urlType = (urlPostType ?? urlPt ?? "").trim().toLowerCase();
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

  React.useEffect(() => {
    setPostTypeFilter(initialFilter);
  }, [initialFilter]);

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
  const [err, setErr] = React.useState<string | null>(null);
  const postsLengthRef = React.useRef(0);

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
  const latestRequestIdRef = React.useRef(0);

  const isSignedInRef = React.useRef<boolean>(isSignedIn);
  const requireAuthAfterRef = React.useRef<number>(requireAuthAfter);

  React.useEffect(() => {
    postsLengthRef.current = posts.length;
  }, [posts.length]);

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

        const ok = raw as Partial<SeenOkResponse> | null;
        if (ok?.ok === true) return;
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
        nextCursor,
        pageSize,
        minVisibility,
        postTypeFilter,
      });

      if (
        isSameInflightRequest(
          inflightRef.current,
          inflightKeyRef.current,
          requestKey,
        )
      ) {
        return;
      }

      if (inflightRef.current) {
        inflightRef.current.abort();
        inflightRef.current = null;
        inflightKeyRef.current = "";
      }

      const abortController = new AbortController();
      inflightRef.current = abortController;
      inflightKeyRef.current = requestKey;
      const requestId = ++latestRequestIdRef.current;

      const isFirstPage = nextCursor === "0";

      loadingRef.current = true;
      startArtistPostsLoading(
        isFirstPage,
        postsLengthRef.current,
        setLoading,
        setRefreshing,
      );

      const filterAtCall = postTypeFilter;
      setErr(null);

      try {
        const url = buildArtistPostsUrl({
          pageSize,
          minVisibility,
          postTypeFilter,
          nextCursor,
        });

        console.log("[PortalArtistPosts] fetchPage", {
          mountId: mountIdRef.current,
          nextCursor,
          pageSize,
          minVisibility,
          postTypeFilter,
          url: url.toString(),
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

        if (filterAtCall !== postTypeFilter) {
          console.log(
            "[PortalArtistPosts] stale response ignored",
            {
              mountId: mountIdRef.current,
              filterAtCall,
              currentFilter: postTypeFilter,
              nextCursor,
            },
          );
          return;
        }

        const nextPosts = parsed.posts;

        console.log(
          "[PortalArtistPosts] fetchPage success",
          {
            mountId: mountIdRef.current,
            nextCursor,
            receivedPosts: nextPosts.length,
            nextCursorFromResponse: parsed.nextCursor,
            correlationId: parsed.correlationId ?? null,
          },
        );

        setPosts((current) => {
          const updated = mergeArtistPostPage(current, nextPosts, nextCursor);
          postsLengthRef.current = updated.length;
          return updated;
        });
        setCursor(parsed.nextCursor);

        if (
          shouldMarkPostsSeen(
            isSignedInRef.current,
            requireAuthAfterRef.current,
          )
        ) {
          const slugs = extractPostSlugs(nextPosts);
          void markSeen(slugs, parsed.correlationId ?? correlationId);
        }
      } catch (error) {
        if (isAbortError(error)) {
          console.log(
            "[PortalArtistPosts] fetchPage aborted",
            {
              mountId: mountIdRef.current,
              nextCursor,
            },
          );
          return;
        }

        const message = fetchErrorMessage(error);

        console.log(
          "[PortalArtistPosts] fetchPage error",
          {
            mountId: mountIdRef.current,
            nextCursor,
            message,
          },
        );

        setErr(message);
      } finally {
        if (inflightRef.current === abortController) {
          inflightRef.current = null;
          inflightKeyRef.current = "";
        }

        if (latestRequestIdRef.current === requestId) {
          loadingRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [pageSize, minVisibility, postTypeFilter, markSeen],
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

    console.log(
      "[PortalArtistPosts] initial-load effect",
      {
        mountId: mountIdRef.current,
        postTypeFilter,
        pageSize,
        minVisibility,
      },
    );

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

  React.useEffect(() => {
    console.log("[PortalArtistPosts] render-state", {
      mountId: mountIdRef.current,
      loading,
      refreshing,
      postsLength: posts.length,
      cursor,
      err,
      inlineGateActive,
      deepSlug,
      postTypeFilter,
      urlPostType,
      urlPt,
      isSignedIn,
    });
  }, [
    loading,
    refreshing,
    posts.length,
    cursor,
    err,
    inlineGateActive,
    deepSlug,
    postTypeFilter,
    urlPostType,
    urlPt,
    isSignedIn,
  ]);

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
          askerName: nameClean || null,
        }),
      });

      if (response.status === 404) {
        setSubmitErr("Mailbag submissions aren’t live yet.");
        return;
      }

      const raw: unknown = await response.json().catch(() => null);
      const data: SubmitResponse | null = isSubmitResponse(raw) ? raw : null;
      const failure = submitFailureFor(response.ok, data, MAX_CHARS);

      if (failure) {
        if (failure.openMembership) openMembershipModal();
        setSubmitErr(failure.message);
        return;
      }

      setQuestionText("");
      setAskerName("");
      closeComposer();
      setThanks(true);

      if (thankTimerRef.current) window.clearTimeout(thankTimerRef.current);
      thankTimerRef.current = window.setTimeout(
        () => setThanks(false),
        12_000,
      );
    } catch {
      setSubmitErr("Couldn’t submit right now. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [askerName, canSubmit, closeComposer, openMembershipModal, questionText]);

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
  const useOverlayToolbar = isWideToolbarViewport && !composerPresent;

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
    err,
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