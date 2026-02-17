// web/app/home/modules/PortalArtistPosts.tsx
"use client";

import React from "react";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import { useClientSearchParams, replaceQuery } from "@/app/home/urlState";
import { useShareAction, useShareBuilders } from "@/app/home/player/ShareAction";

type Visibility = "public" | "friend" | "patron" | "partner";

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
      if (key === "w" || key === "width" || key === "mw" || key === "maxwidth") {
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

// NEW: supports a normal square/rect image and crops it into a circle
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

export default function PortalArtistPosts(props: {
  title?: string;
  pageSize: number;
  requireAuthAfter: number;
  minVisibility: Visibility;

  authorName?: string;
  authorInitials?: string;

  // point this at /public asset, R2, or any absolute URL where the module is called
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

  const { openIntentSheet, intentSheet, fallbackModal } = useShareAction();
  const shareBuilders = useShareBuilders();

  const [posts, setPosts] = React.useState<Post[]>([]);
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [requiresAuth, setRequiresAuth] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const seenRef = React.useRef<Set<string>>(new Set());
  const postEls = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const fetchPage = React.useCallback(
    async (nextCursor: string | null) => {
      if (loading) return;
      if (requiresAuth) return;
      setLoading(true);
      setErr(null);

      try {
        const u = new URL("/api/artist-posts", window.location.origin);
        u.searchParams.set("limit", String(pageSize));
        u.searchParams.set("minVisibility", minVisibility);
        u.searchParams.set("requireAuthAfter", String(requireAuthAfter));
        if (nextCursor) {
          u.searchParams.set("offset", nextCursor);
        }

        const res = await fetch(u.toString(), { method: "GET" });
        if (!res.ok) throw new Error(`Fetch failed (${res.status})`);

        const json = parsePostsResponse(await res.json());

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
    [loading, requiresAuth, pageSize, minVisibility, requireAuthAfter],
  );

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    void fetchPage(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const onShare = React.useCallback(
    (post: { slug: string; title?: string }) => {
      const url = shareUrlFor(post.slug);

      const target = shareBuilders.post(
        { slug: post.slug, title: post.title?.trim() || "Post" },
        authorName,
      );

      openIntentSheet({ ...target, url });

      replaceQuery({
        p: "posts",
        post: post.slug,
        pt: null,
        panel: null,
        album: null,
        track: null,
        t: null,
        autoplay: null,
      });
    },
    [openIntentSheet, shareBuilders, authorName],
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
        bullet: ({ children }) => <li style={{ margin: "6px 0" }}>{children}</li>,
        number: ({ children }) => <li style={{ margin: "6px 0" }}>{children}</li>,
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

  return (
    <div style={{ minWidth: 0 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
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
            }}
          >
            Load more
          </button>
        ) : null}
      </div>

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
                {/* “Substack notes” header row */}
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <Avatar
                    label={authorInitials}
                    src={authorAvatarSrc}
                    alt={authorName}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: 10,
                        minWidth: 0,
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
                    onClick={() => onShare({ slug: p.slug, title: p.title })}
                    label="Share post"
                  >
                    {ICON_SHARE}
                    <span>Share</span>
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

      {/* Share overlays (must be rendered) */}
      {intentSheet}
      {fallbackModal}
    </div>
  );
}
