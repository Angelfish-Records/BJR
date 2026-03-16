"use client";

import React from "react";
import { PortableText, type PortableTextComponents } from "@portabletext/react";
import type { Post, PostType } from "./portalArtistPostsTypes";

function fmtDate(iso: string) {
  try {
    const date = new Date(iso);
    return date.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function asPostType(value: unknown): PostType | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "qa" ||
    normalized === "creative" ||
    normalized === "civic" ||
    normalized === "cosmic"
  ) {
    return normalized;
  }
  return null;
}

function postTypeLabel(postType: PostType | null | undefined): string {
  if (postType === "qa") return "Q&A";
  if (postType === "civic") return "Civic";
  if (postType === "cosmic") return "Cosmic";
  return "Creative";
}

function typeBadgeTheme(postType: PostType): {
  background: string;
  color: string;
} {
  if (postType === "qa") {
    return {
      background: "rgba(217, 184, 120, 0.82)",
      color: "rgba(33, 24, 10, 0.96)",
    };
  }

  if (postType === "creative") {
    return {
      background: "rgba(201, 156, 163, 0.82)",
      color: "rgba(34, 18, 20, 0.96)",
    };
  }

  if (postType === "civic") {
    return {
      background: "rgba(127, 150, 184, 0.80)",
      color: "rgba(14, 21, 33, 0.96)",
    };
  }

  return {
    background: "rgba(141, 118, 186, 0.82)",
    color: "rgba(20, 12, 34, 0.96)",
  };
}

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
      onMouseEnter={(event) => {
        event.currentTarget.style.opacity = "1";
        event.currentTarget.style.background = "rgba(255,255,255,0.06)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.opacity = "0.85";
        event.currentTarget.style.background = "transparent";
      }}
      aria-label={props.label}
      title={props.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        border: "none",
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
  const postType = asPostType(props.t ?? null) ?? "creative";
  const theme = typeBadgeTheme(postType);

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 18,
        padding: "0 8px",
        borderRadius: 5,
        border: "none",
        background: theme.background,
        color: theme.color,
        fontSize: 10,
        fontWeight: 750,
        letterSpacing: 0.35,
        textTransform: "uppercase",
        lineHeight: "18px",
        flex: "0 0 auto",
      }}
      title={`Type: ${postTypeLabel(postType)}`}
      aria-label={`Post type ${postTypeLabel(postType)}`}
    >
      {postTypeLabel(postType)}
    </span>
  );
}

type Props = {
  post: Post;
  index: number;
  deepSlug: string | null;
  copiedSlug: string | null;
  authorName: string;
  authorInitials: string;
  authorAvatarSrc?: string;
  firstPostHeaderInsetPx: number;
  portableTextComponents: PortableTextComponents;
  registerPostElement: (slug: string, node: HTMLDivElement | null) => void;
  onShare: (post: { slug: string; title?: string }) => void | Promise<void>;
};

export default function PortalArtistPostItem(props: Props) {
  const {
    post,
    index,
    deepSlug,
    copiedSlug,
    authorName,
    authorInitials,
    authorAvatarSrc,
    firstPostHeaderInsetPx,
    portableTextComponents,
    registerPostElement,
    onShare,
  } = props;

  const isDeep = deepSlug === post.slug;
  const isCopied = copiedSlug === post.slug;
  const isFirstPost = index === 0;

  const firstPostHeaderRightInsetPx = isFirstPost
    ? firstPostHeaderInsetPx
    : 0;

  return (
    <div
      ref={(node) => registerPostElement(post.slug, node)}
      data-slug={post.slug}
      style={{
        padding: "14px 0",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
      }}
    >
      <div
        style={{
          borderRadius: 18,
          padding: "12px 0px 10px",
          background: isDeep ? "rgba(255,255,255,0.04)" : "transparent",
          boxShadow: isDeep
            ? "0 0 0 2px color-mix(in srgb, var(--accent) 14%, transparent)"
            : undefined,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            paddingRight: firstPostHeaderRightInsetPx,
          }}
        >
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
                {fmtDate(post.publishedAt)}
              </div>

              {post.pinned ? (
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

        {post.title?.trim() ? (
          <div
            style={{
              marginTop: 10,
              display: "flex",
              alignItems: "center",
              gap: 8,
              minWidth: 0,
              paddingRight: firstPostHeaderRightInsetPx,
            }}
          >
            <TypeBadge t={post.postType ?? null} />

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
              title={post.title.trim()}
            >
              {post.title.trim()}
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 8 }}>
          <PortableText value={post.body ?? []} components={portableTextComponents} />
        </div>

        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "flex-start",
          }}
        >
          <ActionBtn
            onClick={() => void onShare({ slug: post.slug, title: post.title })}
            label="Share post"
          >
            {isCopied ? ICON_CHECK : ICON_SHARE}
            <span>{isCopied ? "Copied" : "Share"}</span>
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}