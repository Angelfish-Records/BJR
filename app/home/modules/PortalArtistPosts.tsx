// web/app/home/modules/PortalArtistPosts.tsx
"use client";

import React from "react";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { usePortalViewer } from "@/app/home/PortalViewerProvider";
import { useMembershipModal } from "@/app/home/MembershipModalProvider";
import { useClientSearchParams, replaceQuery } from "@/app/home/urlState";
import {
  useShareAction,
  useShareBuilders,
} from "@/app/home/player/ShareAction";

type Visibility = "public" | "friend" | "patron" | "partner";
type PostType = "qa" | "creative" | "civic" | "cosmic";

const POST_TYPES: { value: "" | PostType; label: string }[] = [
  { value: "", label: "All" },
  { value: "qa", label: "Q&A" },
  { value: "creative", label: "Creative" },
  { value: "civic", label: "Civic" },
  { value: "cosmic", label: "Cosmic" },
];

type SanityImageValue = {
  _type: "image";
  url?: string;
  maxWidth?: number | string;
  width?: number | string;
  metadata?: {
    dimensions?: {
      width?: number;
      height?: number;
      aspectRatio?: number;
    };
  };
};

type Post = {
  slug: string;
  title?: string;
  publishedAt: string;
  visibility: Visibility;
  pinned?: boolean;
  postType?: PostType;
  body: PortableTextBlock[];
};

type ArtistPostsResponse = {
  ok: boolean;
  requiresAuth: boolean;
  posts: Post[];
  nextCursor: string | null;
  correlationId?: string;
};

function fmtDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function SubmitQuestionCTA(props: { onOpenComposer: () => void }) {
  const { onOpenComposer } = props;
  const { viewerTier, isSignedIn } = usePortalViewer();
  const { openMembershipModal } = useMembershipModal();

  // Keep the posts UI clean: only show for signed-in viewers who have *some* tier.
  if (!isSignedIn || viewerTier === "none") return null;

  const locked = viewerTier === "friend";
  const label = locked ? "Ask a Question (Patron+)" : "Ask a Question";

  return (
    <button
      type="button"
      onClick={() => {
        if (locked) openMembershipModal();
        else onOpenComposer();
      }}
      aria-disabled={locked}
      title={
        locked
          ? "Become a Patron to submit questions."
          : "Send a question for the next Q&A post."
      }
      style={{
        height: 28,
        padding: "0 12px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.14)",
        background: locked
          ? "rgba(255,255,255,0.035)"
          : "rgba(255,255,255,0.07)",
        color: locked ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.92)",
        cursor: "pointer",
        opacity: locked ? 0.86 : 1,
        userSelect: "none",
        fontSize: 12,
        lineHeight: "28px",
        fontWeight: 700,
        letterSpacing: 0.2,
        transition:
          "transform 160ms ease, opacity 160ms ease, filter 160ms ease",
      }}
      onMouseDown={(e) => {
        const el = e.currentTarget;
        el.style.transform = "scale(0.98)";
        window.setTimeout(() => (el.style.transform = "scale(1)"), 120);
      }}
    >
      {label}
    </button>
  );
}

function isTall(aspectRatio: number | null | undefined) {
  if (!aspectRatio || !Number.isFinite(aspectRatio)) return false;
  return aspectRatio < 0.85;
}

function shareUrlFor(slug: string) {
  if (typeof window === "undefined") return "";
  const url = new URL(window.location.href);
  url.searchParams.set("p", "posts");
  url.searchParams.set("post", slug);
  url.searchParams.delete("pt");
  url.searchParams.delete("panel");
  url.searchParams.delete("album");
  url.searchParams.delete("track");
  url.searchParams.delete("t");
  url.searchParams.delete("autoplay");
  return url.toString();
}

function parsePostsResponse(raw: unknown): ArtistPostsResponse {
  const r = raw as Partial<ArtistPostsResponse>;
  const posts = Array.isArray(r.posts) ? r.posts : [];
  return {
    ok: Boolean(r.ok),
    requiresAuth: Boolean(r.requiresAuth),
    posts: posts as Post[],
    nextCursor: typeof r.nextCursor === "string" ? r.nextCursor : null,
    correlationId:
      typeof r.correlationId === "string" ? r.correlationId : undefined,
  };
}

/* -------------------------
   Title + type helpers
-------------------------- */

function asPostType(v: unknown): PostType | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  if (s === "qa" || s === "creative" || s === "civic" || s === "cosmic")
    return s;
  return null;
}

function postTypeLabel(t: PostType | null | undefined): string {
  if (t === "qa") return "Q&A";
  if (t === "civic") return "Civic";
  if (t === "cosmic") return "Cosmic";
  return "Creative";
}

/* -------------------------
   Image sizing helpers
-------------------------- */

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parsePxLike(v: unknown): number | null {
  if (typeof v === "number") return clampInt(v, 160, 1400);
  if (typeof v === "string") {
    const m = v.trim().match(/^(\d{2,4})/);
    if (!m) return null;
    const n = Number(m[1]);
    return clampInt(n, 160, 1400);
  }
  return null;
}

function parseWidthHintFromUrl(url: string): number | null {
  try {
    const u = new URL(url, "https://example.invalid");

    const qp =
      u.searchParams.get("maxWidth") ??
      u.searchParams.get("mw") ??
      u.searchParams.get("w") ??
      u.searchParams.get("width");

    const fromQ = parsePxLike(qp);
    if (fromQ) return fromQ;

    const h = (u.hash || "").replace(/^#/, "");
    if (!h) return null;

    const parts = h.split("&");
    for (const part of parts) {
      const [k, val] = part.split("=");
      const key = (k || "").trim().toLowerCase();
      if (
        key === "w" ||
        key === "width" ||
        key === "mw" ||
        key === "maxwidth"
      ) {
        const fromH = parsePxLike(val);
        if (fromH) return fromH;
      }
    }
    return null;
  } catch {
    const m =
      url.match(/[?#&](?:maxWidth|mw|w|width)=(\d{2,4})/i) ??
      url.match(/#(?:maxWidth|mw|w|width)=(\d{2,4})/i);
    if (m?.[1]) return clampInt(Number(m[1]), 160, 1400);
    return null;
  }
}

function resolveImageMaxWidthPx(value: SanityImageValue, tall: boolean) {
  const explicit = parsePxLike(value?.maxWidth ?? value?.width);
  if (explicit) return explicit;

  const url = value?.url ?? "";
  const hinted = url ? parseWidthHintFromUrl(url) : null;
  if (hinted) return hinted;

  return tall ? 520 : null;
}

/* -------------------------
   Small static UI bits
-------------------------- */

const ICON_SHARE = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 .17 1l-6.5 3.25A3 3 0 0 0 4 7a3 3 0 1 0 0 6 3 3 0 0 0 2.67-1.5l6.5 3.25A3 3 0 0 0 13 16a3 3 0 1 0 .17-1l-6.5-3.25A3 3 0 0 0 7 10c0-.35-.06-.69-.17-1l6.5-3.25A3 3 0 0 0 16 8Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  </svg>
);

const ICON_CHECK = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    aria-hidden="true"
  >
    <path
      d="M20 7L10.5 16.5L4 10"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function DefaultAvatar(props: { label: string }) {
  const { label } = props;
  return (
    <div
      aria-hidden
      title={label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
        display: "grid",
        placeItems: "center",
        fontSize: 12,
        fontWeight: 750,
        letterSpacing: 0.6,
        opacity: 0.92,
        userSelect: "none",
      }}
    >
      {label.slice(0, 2).toUpperCase()}
    </div>
  );
}

function Avatar(props: { label: string; src?: string; alt?: string }) {
  const { label, src, alt } = props;

  if (!src) return <DefaultAvatar label={label} />;

  return (
    <div
      title={alt || label}
      style={{
        width: 32,
        height: 32,
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.06)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.18)",
        overflow: "hidden",
        flex: "0 0 auto",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt || label}
        width={32}
        height={32}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
          objectFit: "cover",
        }}
      />
    </div>
  );
}

function ActionBtn(props: {
  onClick: () => void;
  children: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.opacity = "1";
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.opacity = "0.85";
        e.currentTarget.style.background = "transparent";
      }}
      aria-label={props.label}
      title={props.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
        color: "rgba(255,255,255,0.80)",
        borderRadius: 999,
        padding: "8px 10px",
        cursor: "pointer",
        fontSize: 12,
        lineHeight: 1,
        opacity: 0.92,
        transition: "opacity 120ms ease, background 120ms ease",
      }}
    >
      {props.children}
    </button>
  );
}

function TypeBadge(props: { t?: PostType | null }) {
  const t = asPostType(props.t ?? null) ?? "creative";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 8px",
        borderRadius: 5,
        border: "none",
        background: "rgba(225, 192, 253, 0.16)",
        color: "rgba(0,0,0,0.92)",
        fontSize: 10,
        fontWeight: 750,
        letterSpacing: 0.35,
        textTransform: "uppercase",
        lineHeight: "18px",
        flex: "0 0 auto",
      }}
      title={`Type: ${postTypeLabel(t)}`}
      aria-label={`Post type ${postTypeLabel(t)}`}
    >
      {postTypeLabel(t)}
    </span>
  );
}

/* -------------------------
   Micro toast
-------------------------- */

function CopyToast(props: { visible: boolean; text: string }) {
  return (
    <div
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: 18,
        transform: "translateX(-50%)",
        zIndex: 100000,
        pointerEvents: "none",
        opacity: props.visible ? 1 : 0,
        transition: "opacity 160ms ease",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          borderRadius: 999,
          padding: "10px 12px",
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(20,20,20,0.92)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          color: "rgba(255,255,255,0.92)",
          fontSize: 12,
          boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
        }}
      >
        <span aria-hidden>{ICON_CHECK}</span>
        <span>{props.text}</span>
      </div>
    </div>
  );
}

function TermsModal(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;

  React.useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Question terms and conditions"
      onMouseDown={(e) => {
        // click outside closes
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100000,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "min(520px, 100%)",
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(16,16,16,0.92)",
          boxShadow: "0 26px 90px rgba(0,0,0,0.55)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: 14,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            borderBottom: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800, opacity: 0.92 }}>
            Question terms
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: "rgba(255,255,255,0.72)",
              cursor: "pointer",
              fontSize: 12,
              opacity: 0.9,
            }}
          >
            Close
          </button>
        </div>

        <div style={{ padding: 14 }}>
          <div
            style={{
              fontSize: 12.5,
              lineHeight: 1.7,
              color: "rgba(255,255,255,0.84)",
            }}
          >
            <p style={{ margin: "0 0 10px" }}>
              You are voluntarily submitting a question to the official website
              of Brendan John Roch. If your question is selected, it, along with
              the response will feature on this website.
            </p>

            <p style={{ margin: "0 0 10px" }}>
              The answered question, along with any modifications made for
              clarity and adherence to guidelines, may be published on our
              website. If your question is chosen, any personal information
              contained in your submission may be published in accordance with
              these terms and conditions and you give your express consent
              thereto.
            </p>

            <p style={{ margin: "0 0 10px" }}>
              By submitting your question, you grant Brendan John Roch the
              non-exclusive right to publish, reproduce, and distribute the
              question and its corresponding answer on our website, Brendan John
              Roch mailer and on other related platforms.
            </p>

            <p style={{ margin: "0 0 10px" }}>
              We reserve the right to edit or modify the question and answer for
              clarity, compliance with guidelines, and other editorial
              considerations.
            </p>
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 30,
                padding: "0 12px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.88)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 750,
              }}
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PortalArtistPosts(props: {
  title?: string;
  pageSize: number;
  requireAuthAfter: number;
  minVisibility: Visibility;

  authorName?: string;
  authorInitials?: string;

  authorAvatarSrc?: string;

  defaultInlineImageMaxWidthPx?: number;
}) {
  const {
    pageSize,
    requireAuthAfter,
    minVisibility,
    authorName = "Brendan John Roch",
    authorInitials = "BJR",
    authorAvatarSrc,
    defaultInlineImageMaxWidthPx,
  } = props;

  const sp = useClientSearchParams();
  const deepSlug = (sp.get("post") ?? "").trim() || null;

  const urlType = (sp.get("postType") ?? "").trim().toLowerCase();
  const initialFilter: "" | PostType =
    urlType === "qa" ||
    urlType === "creative" ||
    urlType === "civic" ||
    urlType === "cosmic"
      ? (urlType as PostType)
      : "";

  const [postTypeFilter, setPostTypeFilter] = React.useState<"" | PostType>(
    initialFilter,
  );

  const { share, fallbackModal } = useShareAction();
  const shareBuilders = useShareBuilders();

  const { openMembershipModal } = useMembershipModal();
  const { viewerTier, isSignedIn } = usePortalViewer();

  const [composerOpen, setComposerOpen] = React.useState(false);
  const [questionText, setQuestionText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitErr, setSubmitErr] = React.useState<string | null>(null);
  const [thanks, setThanks] = React.useState(false);

  const [termsOpen, setTermsOpen] = React.useState(false);

  const MAX_CHARS = 800;

  const [askerName, setAskerName] = React.useState("");
  const MAX_NAME_CHARS = 48;

  const canSubmit =
    isSignedIn && (viewerTier === "patron" || viewerTier === "partner");

  const thankTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (thankTimerRef.current) window.clearTimeout(thankTimerRef.current);
    };
  }, []);

  const closeComposer = React.useCallback(() => {
    setComposerOpen(false);
    setSubmitErr(null);
  }, []);

  const [posts, setPosts] = React.useState<Post[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [requiresAuth, setRequiresAuth] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  // Tactile feedback state (ONLY for actual clipboard copy fallback)
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

  const seenRef = React.useRef<Set<string>>(new Set());
  const postEls = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchPage = React.useCallback(
    async (nextCursor: string | null) => {
      if (loading) return;
      if (requiresAuth) return;
      setLoading(true);
      const filterAtCall = postTypeFilter;
      setErr(null);

      try {
        const u = new URL("/api/artist-posts", window.location.origin);
        u.searchParams.set("limit", String(pageSize));
        u.searchParams.set("minVisibility", minVisibility);
        u.searchParams.set("requireAuthAfter", String(requireAuthAfter));
        if (postTypeFilter) u.searchParams.set("postType", postTypeFilter);
        if (nextCursor) u.searchParams.set("offset", nextCursor);

        const res = await fetch(u.toString(), { method: "GET" });
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

        const json = parsePostsResponse(await res.json());
        // Ignore stale responses if the filter changed mid-flight.
        if (filterAtCall !== postTypeFilter) return;

        if (json.requiresAuth) {
          setRequiresAuth(true);
          setCursor(null);
          return;
        }

        const nextPosts = Array.isArray(json.posts) ? json.posts : [];
        setPosts((p) => (nextCursor ? [...p, ...nextPosts] : nextPosts));
        setCursor(json.nextCursor);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load posts";
        setErr(msg);
      } finally {
        setLoading(false);
      }
    },
    [
      loading,
      requiresAuth,
      pageSize,
      minVisibility,
      requireAuthAfter,
      postTypeFilter,
    ],
  );

  // initial fetch
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    void fetchPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // refetch when filter changes
  React.useEffect(() => {
    setRequiresAuth(false);
    setCursor(null);
    setPosts([]);
    setErr(null);
    void fetchPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postTypeFilter]);

  React.useEffect(() => {
    if (!deepSlug) return;
    const el = postEls.current.get(deepSlug);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [deepSlug, posts.length]);

  const markSeen = React.useCallback(async (slug: string) => {
    if (!slug) return;
    if (seenRef.current.has(slug)) return;
    seenRef.current.add(slug);

    try {
      await fetch("/api/artist-posts/seen", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug }),
      });
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const ent of entries) {
          if (!ent.isIntersecting) continue;
          const el = ent.target as HTMLElement;
          const slug = el.dataset.slug ?? "";
          if (slug) void markSeen(slug);
        }
      },
      { root: null, threshold: 0.6 },
    );

    for (const p of posts) {
      const el = postEls.current.get(p.slug);
      if (el) io.observe(el);
    }

    return () => io.disconnect();
  }, [posts, markSeen]);

  function triggerCopiedFeedback(slug: string) {
    setCopiedSlug(slug);
    if (copiedTimerRef.current) window.clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopiedSlug((cur) => (cur === slug ? null : cur));
    }, 1200);

    setToastVisible(true);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 1600);
  }

  type SubmitFailCode =
    | "NOT_AUTHED"
    | "TIER_REQUIRED"
    | "RATE_LIMIT"
    | "TOO_LONG"
    | "EMPTY"
    | "BAD_REQUEST"
    | "SERVER_ERROR";

  type SubmitOk = { ok: true };
  type SubmitFail = {
    ok: false;
    code: SubmitFailCode;
    maxChars?: number;
    limitPerDay?: number;
  };
  type SubmitResponse = SubmitOk | SubmitFail;

  function isSubmitResponse(x: unknown): x is SubmitResponse {
    if (!x || typeof x !== "object") return false;
    const r = x as Record<string, unknown>;
    if (typeof r.ok !== "boolean") return false;
    if (r.ok === true) return true;
    return typeof r.code === "string";
  }

  async function submitQuestion() {
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

      const res = await fetch("/api/mailbag/questions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionText: text,
          askerName: nameClean ? nameClean : null,
        }),
      });

      if (res.status === 404) {
        setSubmitErr("Mailbag submissions aren’t live yet.");
        return;
      }

      const raw: unknown = await res.json().catch(() => null);
      const data: SubmitResponse | null = isSubmitResponse(raw) ? raw : null;

      if (!res.ok || !data || data.ok === false) {
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
  }

  const onShare = React.useCallback(
    async (post: { slug: string; title?: string }) => {
      const url = shareUrlFor(post.slug);

      const target = shareBuilders.post(
        { slug: post.slug, title: post.title?.trim() || "Post" },
        authorName,
      );

      const res = await share({ ...target, url });

      if (res.ok && res.method === "copy") {
        triggerCopiedFeedback(post.slug);
      }

      replaceQuery({
        p: "posts",
        post: post.slug,
        postType: postTypeFilter || null,
        pt: null,
        panel: null,
        album: null,
        track: null,
        t: null,
        autoplay: null,
      });
    },
    [share, shareBuilders, authorName, postTypeFilter],
  );

  const components: PortableTextComponents = React.useMemo(
    () => ({
      types: {
        image: ({ value }: { value: SanityImageValue }) => {
          const url = value?.url ?? null;
          const ar = value?.metadata?.dimensions?.aspectRatio;
          if (!url) return null;

          const tall = isTall(ar);
          const perImage = resolveImageMaxWidthPx(value, tall);
          const globalCap = parsePxLike(defaultInlineImageMaxWidthPx);
          const maxWidthPx = perImage ?? globalCap ?? null;

          return (
            <div
              style={{
                margin: "12px 0",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: maxWidthPx ? `${maxWidthPx}px` : "100%",
                  borderRadius: 18,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,0.10)",
                  background: "rgba(255,255,255,0.03)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt=""
                  style={{ width: "100%", height: "auto", display: "block" }}
                />
              </div>
            </div>
          );
        },
      },

      block: {
        normal: ({ children }) => (
          <p
            style={{
              margin: "10px 0",
              lineHeight: 1.68,
              fontSize: 13,
              opacity: 0.92,
            }}
          >
            {children}
          </p>
        ),
        h1: ({ children }) => (
          <h3
            style={{
              margin: "14px 0 8px",
              fontSize: 16,
              lineHeight: 1.25,
              opacity: 0.95,
            }}
          >
            {children}
          </h3>
        ),
        h2: ({ children }) => (
          <h4
            style={{
              margin: "14px 0 8px",
              fontSize: 15,
              lineHeight: 1.25,
              opacity: 0.95,
            }}
          >
            {children}
          </h4>
        ),
        h3: ({ children }) => (
          <h5
            style={{
              margin: "12px 0 6px",
              fontSize: 14,
              lineHeight: 1.25,
              opacity: 0.92,
            }}
          >
            {children}
          </h5>
        ),
        blockquote: ({ children }) => (
          <blockquote
            style={{
              margin: "12px 0",
              padding: "10px 12px",
              borderLeft: "2px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.03)",
              borderRadius: 12,
              opacity: 0.92,
            }}
          >
            <div style={{ fontSize: 13, lineHeight: 1.65 }}>{children}</div>
          </blockquote>
        ),
      },

      list: {
        bullet: ({ children }) => (
          <ul
            style={{
              margin: "10px 0",
              paddingLeft: 22,
              listStyleType: "disc",
              listStylePosition: "outside",
              fontSize: 13,
              lineHeight: 1.65,
              opacity: 0.92,
            }}
          >
            {children}
          </ul>
        ),
        number: ({ children }) => (
          <ol
            style={{
              margin: "10px 0",
              paddingLeft: 22,
              listStyleType: "decimal",
              listStylePosition: "outside",
              fontSize: 13,
              lineHeight: 1.65,
              opacity: 0.92,
            }}
          >
            {children}
          </ol>
        ),
      },
      listItem: {
        bullet: ({ children }) => (
          <li style={{ margin: "6px 0" }}>{children}</li>
        ),
        number: ({ children }) => (
          <li style={{ margin: "6px 0" }}>{children}</li>
        ),
      },

      marks: {
        strong: ({ children }) => (
          <strong style={{ fontWeight: 750, opacity: 0.98 }}>{children}</strong>
        ),
        em: ({ children }) => <em style={{ opacity: 0.95 }}>{children}</em>,
        code: ({ children }) => (
          <code
            style={{
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
              fontSize: 12,
              padding: "2px 6px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.12)",
              background: "rgba(255,255,255,0.04)",
              opacity: 0.95,
            }}
          >
            {children}
          </code>
        ),
        link: ({ value, children }) => {
          const href = typeof value?.href === "string" ? value.href : "#";
          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              style={{
                color: "rgba(255,255,255,0.90)",
                textDecoration: "underline",
                textUnderlineOffset: 3,
                opacity: 0.9,
              }}
            >
              {children}
            </a>
          );
        },
      },
    }),
    [defaultInlineImageMaxWidthPx],
  );

  function onChangeFilter(next: "" | PostType) {
    setPostTypeFilter(next);

    // Keep the URL canonical, and prevent `post=` deep-links leaking into other views/filters.
    replaceQuery({
      p: "posts",
      postType: next || null,
      post: null,
    });
  }

  return (
    <div style={{ minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 2,
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {cursor ? (
            <button
              type="button"
              onClick={() => void fetchPage(cursor)}
              disabled={loading || requiresAuth}
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.70)",
                cursor: loading ? "default" : "pointer",
                fontSize: 12,
                textDecoration: "underline",
                textUnderlineOffset: 3,
                opacity: loading ? 0.5 : 0.85,
                padding: 0,
              }}
            >
              Load more
            </button>
          ) : null}
        </div>

        <div
          style={{
            flex: "0 0 auto",
            display: "inline-flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <select
            value={postTypeFilter}
            onChange={(e) => onChangeFilter(e.target.value as "" | PostType)}
            aria-label="Filter posts by type"
            style={{
              height: 28,
              borderRadius: 10,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.035)",
              color: "rgba(255,255,255,0.86)",
              padding: "0 10px",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 0.2,
              outline: "none",
              cursor: "pointer",
            }}
          >
            {POST_TYPES.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <SubmitQuestionCTA
            onOpenComposer={() => {
              setThanks(false);
              setSubmitErr(null);
              setComposerOpen(true);
            }}
          />
        </div>
      </div>

      {/* Inline mailbag composer (Patron+) */}
      <div
        style={{
          marginTop: 10,
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.03)",
          overflow: "hidden",
          maxHeight: composerOpen ? 360 : 0,
          opacity: composerOpen ? 1 : 0,
          transition: "max-height 260ms ease, opacity 220ms ease",
        }}
        aria-hidden={!composerOpen}
      >
        <div style={{ padding: 12 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 750, opacity: 0.92 }}>
              Submit a question
            </div>
            <button
              type="button"
              onClick={closeComposer}
              style={{
                border: "none",
                background: "transparent",
                color: "rgba(255,255,255,0.70)",
                cursor: "pointer",
                fontSize: 12,
                opacity: 0.85,
              }}
            >
              Close
            </button>
          </div>

          <input
            value={askerName}
            onChange={(e) => setAskerName(e.target.value)}
            maxLength={MAX_NAME_CHARS + 20}
            placeholder="Your name / city / handle (totally optional)"
            style={{
              width: "100%",
              height: 36,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.22)",
              color: "rgba(255,255,255,0.92)",
              padding: "0 12px",
              fontSize: 13,
              outline: "none",
              marginBottom: 10,
            }}
          />

          <textarea
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            maxLength={MAX_CHARS + 200}
            placeholder="Ask anything you want considered for a future Q&A."
            style={{
              width: "100%",
              minHeight: 96,
              resize: "vertical",
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(0,0,0,0.22)",
              color: "rgba(255,255,255,0.92)",
              padding: "10px 12px",
              fontSize: 13,
              lineHeight: 1.6,
              outline: "none",
            }}
          />

          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            {/* LEFT COLUMN */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.62 }}>
                {questionText.trim().length}/{MAX_CHARS}
                {questionText.trim().length > MAX_CHARS ? (
                  <span style={{ marginLeft: 8, opacity: 0.95 }}>
                    • too long
                  </span>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setTermsOpen(true)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "rgba(255,255,255,0.72)",
                  cursor: "pointer",
                  padding: 0,
                  fontSize: 12,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  opacity: 0.9,
                  alignSelf: "flex-start",
                }}
              >
                Terms & Conditions
              </button>
            </div>

            {/* RIGHT COLUMN (Send button) */}
            <button
              type="button"
              onClick={() => void submitQuestion()}
              disabled={submitting}
              style={{
                height: 32,
                padding: "0 14px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.92)",
                cursor: submitting ? "default" : "pointer",
                opacity: submitting ? 0.6 : 1,
                userSelect: "none",
              }}
            >
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>

          {submitErr ? (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.78 }}>
              {submitErr}
            </div>
          ) : null}
        </div>
      </div>

      {thanks ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            opacity: 0.85,
            lineHeight: 1.55,
          }}
        >
          Thank you for your question. You will receive an email when it is
          answered.
        </div>
      ) : null}

      {requiresAuth ? (
        <div
          style={{
            marginTop: 12,
            fontSize: 13,
            opacity: 0.85,
            lineHeight: 1.55,
          }}
        >
          Sign in to keep reading posts.
        </div>
      ) : null}

      {err ? (
        <div style={{ marginTop: 12, fontSize: 13, opacity: 0.8 }}>{err}</div>
      ) : null}

      {/* Feed */}
      <div style={{ marginTop: 6 }}>
        {posts.map((p) => {
          const isDeep = deepSlug === p.slug;
          const isCopied = copiedSlug === p.slug;

          return (
            <div
              key={p.slug}
              ref={(el) => {
                if (!el) postEls.current.delete(p.slug);
                else postEls.current.set(p.slug, el);
              }}
              data-slug={p.slug}
              style={{
                padding: "14px 0",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div
                style={{
                  borderRadius: 18,
                  padding: "12px 12px 10px",
                  background: isDeep ? "rgba(255,255,255,0.04)" : "transparent",
                  boxShadow: isDeep
                    ? "0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)"
                    : undefined,
                }}
              >
                {/* header row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Avatar
                    label={authorInitials}
                    src={authorAvatarSrc}
                    alt={authorName}
                  />

                  <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        minWidth: 0,
                        flexWrap: "wrap",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 700,
                          opacity: 0.92,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {authorName}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.56,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtDate(p.publishedAt)}
                      </div>

                      {p.pinned ? (
                        <div
                          style={{
                            fontSize: 12,
                            opacity: 0.62,
                            whiteSpace: "nowrap",
                          }}
                        >
                          • pinned
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Title row (full-width, below header row) */}
                {p.title?.trim() ? (
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      minWidth: 0,
                    }}
                  >
                    <TypeBadge t={p.postType ?? null} />
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 850,
                        opacity: 0.95,
                        lineHeight: 1.25,
                        minWidth: 0,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={p.title.trim()}
                    >
                      {p.title.trim()}
                    </div>
                  </div>
                ) : null}

                {/* Body */}
                <div style={{ marginTop: 8 }}>
                  <PortableText value={p.body ?? []} components={components} />
                </div>

                {/* Actions row */}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "flex-start",
                  }}
                >
                  <ActionBtn
                    onClick={() =>
                      void onShare({ slug: p.slug, title: p.title })
                    }
                    label="Share post"
                  >
                    {isCopied ? ICON_CHECK : ICON_SHARE}
                    <span>{isCopied ? "Copied" : "Share"}</span>
                  </ActionBtn>
                </div>
              </div>
            </div>
          );
        })}

        {loading ? (
          <div style={{ fontSize: 12, opacity: 0.7, padding: "12px 0" }}>
            Loading…
          </div>
        ) : null}

        {!loading && !requiresAuth && posts.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.75, padding: "12px 0" }}>
            No posts yet.
          </div>
        ) : null}
      </div>

      <TermsModal open={termsOpen} onClose={() => setTermsOpen(false)} />

      {/* Toast (clipboard copy only) */}
      <CopyToast visible={toastVisible} text="Link copied" />

      {/* Manual copy fallback modal (only when clipboard is unavailable) */}
      {fallbackModal}
    </div>
  );
}
