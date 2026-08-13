"use client";

import React from "react";
import type {
  PortableTextComponents,
  PortableTextComponentProps,
} from "@portabletext/react";
import type { PortableTextBlock } from "@portabletext/types";
import type { SanityImageValue } from "./portalArtistPostsTypes";

function isTall(aspectRatio: number | null | undefined) {
  if (!aspectRatio || !Number.isFinite(aspectRatio)) return false;
  return aspectRatio < 0.85;
}

function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parsePxLike(v: unknown): number | null {
  if (typeof v === "number") return clampInt(v, 160, 1400);
  if (typeof v === "string") {
    const match = /^(\d{2,4})/.exec(v.trim());
    if (!match) return null;
    return clampInt(Number(match[1]), 160, 1400);
  }
  return null;
}

function parseWidthHintFromUrl(url: string): number | null {
  try {
    const parsed = new URL(url, "https://example.invalid");

    const queryParam =
      parsed.searchParams.get("maxWidth") ??
      parsed.searchParams.get("mw") ??
      parsed.searchParams.get("w") ??
      parsed.searchParams.get("width");

    const fromQuery = parsePxLike(queryParam);
    if (fromQuery) return fromQuery;

    const hash = (parsed.hash || "").replace(/^#/, "");
    if (!hash) return null;

    const parts = hash.split("&");
    for (const part of parts) {
      const [keyRaw, valueRaw] = part.split("=");
      const key = (keyRaw || "").trim().toLowerCase();
      if (
        key === "w" ||
        key === "width" ||
        key === "mw" ||
        key === "maxwidth"
      ) {
        const fromHash = parsePxLike(valueRaw);
        if (fromHash) return fromHash;
      }
    }

    return null;
  } catch {
    const match =
      /[?#&](?:maxWidth|mw|w|width)=(\d{2,4})/i.exec(url) ??
      /#(?:maxWidth|mw|w|width)=(\d{2,4})/i.exec(url);

    if (!match?.[1]) return null;
    return clampInt(Number(match[1]), 160, 1400);
  }
}

function resolveImageMaxWidthPx(value: SanityImageValue, tall: boolean) {
  const explicit = parsePxLike(value.maxWidth ?? value.width);
  if (explicit) return explicit;

  const url = value.url ?? "";
  const hinted = url ? parseWidthHintFromUrl(url) : null;
  if (hinted) return hinted;

  return tall ? 520 : null;
}

export function buildPortalArtistPostPortableTextComponents(
  defaultInlineImageMaxWidthPx?: number,
): PortableTextComponents {
  return {
    types: {
      image: ({ value }: { value: SanityImageValue }) => {
        const url = value?.url ?? null;
        const aspectRatio = value?.metadata?.dimensions?.aspectRatio;
        if (!url) return null;

        const tall = isTall(aspectRatio);
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
      normal: (props: PortableTextComponentProps<PortableTextBlock>) => (
        <p
          className="afJournalProseBody"
          style={{
            margin: "10px 0",
            lineHeight: 1.68,
            fontSize: 13,
            opacity: 0.92,
          }}
        >
          {props.children}
        </p>
      ),

      h1: (props: PortableTextComponentProps<PortableTextBlock>) => (
        <h3
          className="afJournalProseHeading1"
          style={{
            margin: "14px 0 8px",
            fontSize: 16,
            lineHeight: 1.25,
            opacity: 0.95,
          }}
        >
          {props.children}
        </h3>
      ),

      h2: (props: PortableTextComponentProps<PortableTextBlock>) => (
        <h4
          className="afJournalProseHeading2"
          style={{
            margin: "14px 0 8px",
            fontSize: 15,
            lineHeight: 1.25,
            opacity: 0.95,
          }}
        >
          {props.children}
        </h4>
      ),

      h3: (props: PortableTextComponentProps<PortableTextBlock>) => (
        <h5
          className="afJournalProseHeading3"
          style={{
            margin: "12px 0 6px",
            fontSize: 14,
            lineHeight: 1.25,
            opacity: 0.92,
          }}
        >
          {props.children}
        </h5>
      ),

      blockquote: (props: PortableTextComponentProps<PortableTextBlock>) => (
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
          <div
            className="afJournalProseBody"
            style={{ fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}
          >
            {props.children}
          </div>
        </blockquote>
      ),
    },

    list: {
      bullet: (props: { children?: React.ReactNode }) => (
        <ul
          className="afJournalProseList"
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
          {props.children}
        </ul>
      ),
      number: (props: { children?: React.ReactNode }) => (
        <ol
          className="afJournalProseList"
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
          {props.children}
        </ol>
      ),
    },

    listItem: {
      bullet: (props: { children?: React.ReactNode }) => (
        <li style={{ margin: "6px 0" }}>{props.children}</li>
      ),
      number: (props: { children?: React.ReactNode }) => (
        <li style={{ margin: "6px 0" }}>{props.children}</li>
      ),
    },

    marks: {
      strong: (props: { children?: React.ReactNode }) => (
        <strong style={{ fontWeight: 750, opacity: 0.98 }}>
          {props.children}
        </strong>
      ),

      mailbagIntro: (props: { children?: React.ReactNode }) => (
        <span
          style={{
            fontSize: "0.92em",
            color: "rgba(255,255,255,0.62)",
            fontStyle: "italic",
          }}
        >
          {props.children}
        </span>
      ),

      mailbagAsker: (props: { children?: React.ReactNode }) => (
        <span
          style={{
            display: "inline",
            fontStyle: "normal",
            fontSize: "0.92em",
            color: "rgba(255,255,255,0.62)",
            opacity: 1,
          }}
        >
          {props.children}
        </span>
      ),

      em: (props: { children?: React.ReactNode }) => (
        <em
          style={{
            fontStyle: "italic",
          }}
        >
          {props.children}
        </em>
      ),

      code: (props: { children?: React.ReactNode }) => (
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
          {props.children}
        </code>
      ),

      link: (props: {
        value?: { href?: string };
        children?: React.ReactNode;
      }) => {
        const href =
          typeof props.value?.href === "string" ? props.value.href : "#";

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
            {props.children}
          </a>
        );
      },
    },
  };
}
