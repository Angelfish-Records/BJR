// web/app/home/modules/PortalMemberPanel.tsx
"use client";

import Image from "next/image";
import React from "react";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

type Props = {
  summary: PortalMemberSummary;
  title?: string;
  embedded?: boolean;
};

function formatUnlockedAt(value?: string | null): string | null {
  if (!value) return null;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function getBadgeTitle(props: {
  label: string;
  description?: string | null;
  unlocked: boolean;
  unlockedAt?: string | null;
}): string {
  const { label, description, unlocked, unlockedAt } = props;

  return [
    label,
    description?.trim() || null,
    unlocked ? (unlockedAt ? `Unlocked ${unlockedAt}` : "Unlocked") : "Locked",
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join("\n");
}

function MetricTable(props: {
  rows: Array<{
    label: string;
    value: React.ReactNode;
    muted?: boolean;
  }>;
}) {
  const { rows } = props;

  return (
    <div
      role="table"
      aria-label="Member summary metrics"
      style={{
        minWidth: 0,
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          role="row"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 140px) minmax(0, 1fr)",
            gap: 12,
            alignItems: "start",
            padding: "10px 0",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            minWidth: 0,
          }}
        >
          <div
            role="columnheader"
            style={{
              fontSize: 10,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              lineHeight: 1.2,
              opacity: 0.5,
            }}
          >
            {row.label}
          </div>

          <div
            role="cell"
            style={{
              fontSize: 12,
              lineHeight: 1.4,
              opacity: row.muted ? 0.56 : 0.9,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function BadgeRow(props: { badges: PortalMemberSummary["badges"] }) {
  const { badges } = props;
  const [expanded, setExpanded] = React.useState(false);

  if (badges.length === 0) return null;

  return (
    <>
      <style jsx>{`
        :global(:root) {
          --portal-badge-columns-collapsed: 8;
          --portal-badge-columns-expanded: 5;
          --portal-badge-gap-collapsed: 14px;
          --portal-badge-gap-expanded: 18px;
          --portal-badge-art-scale-collapsed: 0.82;
          --portal-badge-art-scale-expanded: 1;
          --portal-badge-caption-offset: -3px;
          --portal-badge-caption-row-gap-collapsed: 10px;
          --portal-badge-caption-row-gap-expanded: 16px;
        }

        @media (max-width: 640px) {
          :global(:root) {
            --portal-badge-gap-collapsed: 10px;
            --portal-badge-gap-expanded: 12px;
            --portal-badge-art-scale-collapsed: 0.84;
            --portal-badge-caption-row-gap-collapsed: 8px;
            --portal-badge-caption-row-gap-expanded: 12px;
          }
        }

        @media (max-width: 420px) {
          :global(:root) {
            --portal-badge-gap-collapsed: 8px;
            --portal-badge-gap-expanded: 10px;
            --portal-badge-art-scale-collapsed: 0.86;
            --portal-badge-caption-row-gap-collapsed: 6px;
            --portal-badge-caption-row-gap-expanded: 10px;
          }
        }

        @keyframes portalBadgeLockedPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.92;
          }
          50% {
            transform: scale(1.035);
            opacity: 1;
          }
        }

        @keyframes portalBadgeUnlockedIdleGlow {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.16;
          }
          50% {
            transform: scale(1.025);
            opacity: 0.24;
          }
        }

        @keyframes portalBadgeEmberRiseA {
          0% {
            transform: translate3d(0, 0, 0) scale(0.72);
            opacity: 0;
          }
          18% {
            transform: translate3d(-1px, -4px, 0) scale(0.82);
            opacity: 0.46;
          }
          42% {
            transform: translate3d(1px, -10px, 0) scale(0.92);
            opacity: 0.34;
          }
          68% {
            transform: translate3d(-2px, -15px, 0) scale(1);
            opacity: 0.2;
          }
          100% {
            transform: translate3d(1px, -20px, 0) scale(1.08);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberRiseB {
          0% {
            transform: translate3d(0, 0, 0) scale(0.68);
            opacity: 0;
          }
          20% {
            transform: translate3d(1px, -5px, 0) scale(0.78);
            opacity: 0.38;
          }
          46% {
            transform: translate3d(-1px, -12px, 0) scale(0.88);
            opacity: 0.28;
          }
          74% {
            transform: translate3d(2px, -18px, 0) scale(0.96);
            opacity: 0.16;
          }
          100% {
            transform: translate3d(-1px, -24px, 0) scale(1);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberRiseC {
          0% {
            transform: translate3d(0, 0, 0) scale(0.75);
            opacity: 0;
          }
          22% {
            transform: translate3d(1px, -4px, 0) scale(0.82);
            opacity: 0.34;
          }
          48% {
            transform: translate3d(-2px, -9px, 0) scale(0.88);
            opacity: 0.24;
          }
          70% {
            transform: translate3d(0px, -14px, 0) scale(0.92);
            opacity: 0.14;
          }
          100% {
            transform: translate3d(2px, -18px, 0) scale(0.96);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberBurstA {
          0% {
            transform: translate3d(0, 0, 0) scale(0.74);
            opacity: 0;
          }
          14% {
            transform: translate3d(-1px, -5px, 0) scale(0.84);
            opacity: 0.65;
          }
          38% {
            transform: translate3d(2px, -14px, 0) scale(0.98);
            opacity: 0.42;
          }
          66% {
            transform: translate3d(-3px, -24px, 0) scale(1.08);
            opacity: 0.2;
          }
          100% {
            transform: translate3d(2px, -32px, 0) scale(1.18);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberBurstB {
          0% {
            transform: translate3d(0, 0, 0) scale(0.66);
            opacity: 0;
          }
          16% {
            transform: translate3d(1px, -6px, 0) scale(0.76);
            opacity: 0.54;
          }
          40% {
            transform: translate3d(-2px, -16px, 0) scale(0.88);
            opacity: 0.36;
          }
          68% {
            transform: translate3d(4px, -27px, 0) scale(0.98);
            opacity: 0.16;
          }
          100% {
            transform: translate3d(-2px, -36px, 0) scale(1.08);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberBurstC {
          0% {
            transform: translate3d(0, 0, 0) scale(0.7);
            opacity: 0;
          }
          18% {
            transform: translate3d(-1px, -5px, 0) scale(0.8);
            opacity: 0.48;
          }
          42% {
            transform: translate3d(2px, -13px, 0) scale(0.9);
            opacity: 0.3;
          }
          72% {
            transform: translate3d(-2px, -22px, 0) scale(0.98);
            opacity: 0.14;
          }
          100% {
            transform: translate3d(1px, -30px, 0) scale(1.04);
            opacity: 0;
          }
        }

        .portal-member-badge-grid {
          display: grid;
          width: 100%;
          min-width: 0;
          grid-template-columns: repeat(
            var(--portal-badge-columns-collapsed),
            minmax(0, 1fr)
          );
          column-gap: var(--portal-badge-gap-collapsed);
          row-gap: var(--portal-badge-caption-row-gap-collapsed);
          align-items: start;
          transition:
            grid-template-columns 260ms cubic-bezier(0.22, 1, 0.36, 1),
            column-gap 220ms ease,
            row-gap 220ms ease;
        }

        .portal-member-badge-grid.portal-member-badges--expanded {
          grid-template-columns: repeat(
            var(--portal-badge-columns-expanded),
            minmax(0, 1fr)
          );
          column-gap: var(--portal-badge-gap-expanded);
          row-gap: var(--portal-badge-caption-row-gap-expanded);
        }

        .portal-member-badge-shell {
          display: grid;
          justify-items: center;
          align-self: start;
          gap: 0;
          min-width: 0;
          width: 100%;
        }

        .portal-member-badge-visual {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: visible;
          outline: none;
        }

        .portal-member-badge-visual-inner {
          position: absolute;
          inset: 0;
          transform: scale(var(--portal-badge-art-scale-collapsed));
          transform-origin: center center;
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }

        .portal-member-badge-grid.portal-member-badges--expanded
          .portal-member-badge-visual-inner {
          transform: scale(var(--portal-badge-art-scale-expanded));
        }

        .portal-member-badge-core--locked {
          animation: portalBadgeLockedPulse 2400ms ease-in-out infinite;
          transform-origin: center;
          will-change: transform, opacity;
        }

        .portal-member-badge-idle-glow {
          animation: portalBadgeUnlockedIdleGlow 3200ms ease-in-out infinite;
          will-change: transform, opacity;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-idle-glow,
        .portal-member-badge-wrap:focus-within .portal-member-badge-idle-glow {
          opacity: 0.42;
          transform: scale(1.06);
        }

        .portal-member-badge-embers {
          opacity: 0.34;
          transition:
            opacity 180ms ease,
            transform 180ms ease;
          pointer-events: none;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-embers,
        .portal-member-badge-wrap:focus-within .portal-member-badge-embers {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .portal-member-badge-spark-a {
          opacity: 0;
          animation: portalBadgeEmberRiseA 1300ms
            cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
        }

        .portal-member-badge-spark-b {
          opacity: 0;
          animation: portalBadgeEmberRiseB 1600ms
            cubic-bezier(0.19, 0.72, 0.32, 1) infinite 160ms;
        }

        .portal-member-badge-spark-c {
          opacity: 0;
          animation: portalBadgeEmberRiseC 1450ms
            cubic-bezier(0.25, 0.68, 0.3, 1) infinite 320ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-a,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-a {
          animation: portalBadgeEmberBurstA 950ms
            cubic-bezier(0.2, 0.72, 0.28, 1) infinite;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-b,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-b {
          animation: portalBadgeEmberBurstB 1100ms
            cubic-bezier(0.18, 0.75, 0.3, 1) infinite 120ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-c,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-c {
          animation: portalBadgeEmberBurstC 1000ms
            cubic-bezier(0.24, 0.7, 0.3, 1) infinite 220ms;
        }

        .portal-member-badge-burst-a,
        .portal-member-badge-burst-b,
        .portal-member-badge-burst-c {
          opacity: 0;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-burst-a,
        .portal-member-badge-wrap:focus-within .portal-member-badge-burst-a {
          animation: portalBadgeEmberBurstA 820ms
            cubic-bezier(0.2, 0.74, 0.28, 1) infinite 40ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-burst-b,
        .portal-member-badge-wrap:focus-within .portal-member-badge-burst-b {
          animation: portalBadgeEmberBurstB 900ms
            cubic-bezier(0.18, 0.76, 0.3, 1) infinite 180ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-burst-c,
        .portal-member-badge-wrap:focus-within .portal-member-badge-burst-c {
          animation: portalBadgeEmberBurstC 860ms
            cubic-bezier(0.22, 0.72, 0.3, 1) infinite 300ms;
        }

        .portal-member-badge-meta {
          width: 100%;
          max-width: 100%;
          display: grid;
          grid-template-rows: 0fr;
          margin-top: 0;
          opacity: 0;
          transform: translateY(-4px);
          pointer-events: none;
          transition:
            grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 180ms ease,
            transform 220ms ease,
            margin-top 220ms ease;
          transition-delay: 0ms, 0ms, 0ms, 0ms;
          text-align: center;
        }

        .portal-member-badge-grid.portal-member-badges--expanded
          .portal-member-badge-meta {
          grid-template-rows: 1fr;
          margin-top: 10px;
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
          transition-delay: 0ms, 110ms, 110ms, 0ms;
        }

        .portal-member-badge-meta-inner {
          overflow: hidden;
          min-height: 0;
          opacity: 0;
          transform: translateY(var(--portal-badge-caption-offset));
          transition:
            opacity 180ms ease,
            transform 220ms ease;
          transition-delay: 0ms, 0ms;
        }

        .portal-member-badge-grid.portal-member-badges--expanded
          .portal-member-badge-meta-inner {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 140ms, 140ms;
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-member-badge-core--locked,
          .portal-member-badge-idle-glow,
          .portal-member-badge-spark-a,
          .portal-member-badge-spark-b,
          .portal-member-badge-spark-c,
          .portal-member-badge-burst-a,
          .portal-member-badge-burst-b,
          .portal-member-badge-burst-c {
            animation: none !important;
          }

          .portal-member-badge-embers {
            opacity: 0 !important;
          }

          .portal-member-badge-grid,
          .portal-member-badge-visual-inner,
          .portal-member-badge-meta,
          .portal-member-badge-meta-inner {
            transition: none !important;
            transition-delay: 0ms !important;
          }

          .portal-member-badge-meta {
            grid-template-rows: none !important;
          }
        }
      `}</style>

      <div
        style={{
          display: "grid",
          gap: 10,
          minWidth: 0,
        }}
      >
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          style={{
            appearance: "none",
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "flex-start",
            gap: 8,
            minWidth: 0,
            width: "fit-content",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              fontSize: 10,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              lineHeight: 1.2,
              opacity: 0.5,
            }}
          >
            Badges
          </span>

          <span
            aria-hidden="true"
            style={{
              display: "inline-block",
              fontSize: 12,
              lineHeight: 1,
              opacity: 0.5,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transformOrigin: "50% 50%",
              transition: "transform 220ms ease, opacity 180ms ease",
            }}
          >
            &gt;
          </span>
        </button>

        <div
          className={`portal-member-badge-grid${
            expanded ? " portal-member-badges--expanded" : ""
          }`}
        >
          {badges.map((badge) => {
            const unlockedAt = badge.unlocked
              ? formatUnlockedAt(badge.unlockedAt)
              : null;

            const badgeTitle = getBadgeTitle({
              label: badge.label,
              description: badge.description,
              unlocked: badge.unlocked,
              unlockedAt,
            });

            return (
              <div
                key={badge.key}
                className="portal-member-badge-wrap portal-member-badge-shell"
                style={{
                  position: "relative",
                  minWidth: 0,
                }}
              >
                <div
                  tabIndex={0}
                  title={badgeTitle}
                  aria-label={badgeTitle}
                  className="portal-member-badge-visual"
                >
                  <div className="portal-member-badge-visual-inner">
                    <div
                      className={
                        badge.unlocked
                          ? undefined
                          : "portal-member-badge-core--locked"
                      }
                      style={{
                        position: "absolute",
                        inset: 0,
                      }}
                    >
                      {badge.unlocked ? (
                        <>
                          <div
                            aria-hidden="true"
                            className="portal-member-badge-idle-glow"
                            style={{
                              position: "absolute",
                              inset: -4,
                              borderRadius: "50%",
                              background:
                                "radial-gradient(circle, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 34%, rgba(255,255,255,0.00) 72%)",
                              filter: "blur(4px)",
                              pointerEvents: "none",
                              transition:
                                "opacity 180ms ease, transform 180ms ease",
                            }}
                          />

                          <div
                            aria-hidden="true"
                            className="portal-member-badge-embers"
                            style={{
                              position: "absolute",
                              left: "50%",
                              bottom: "-4%",
                              width: "65%",
                              height: "80%",
                              transform: "translateX(-50%)",
                              overflow: "visible",
                            }}
                          >
                            <div
                              className="portal-member-badge-spark-a"
                              style={{
                                position: "absolute",
                                left: "18%",
                                bottom: "4%",
                                width: "6%",
                                height: "6%",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.82)",
                                boxShadow: "0 0 8px rgba(255,255,255,0.18)",
                              }}
                            />

                            <div
                              className="portal-member-badge-spark-b"
                              style={{
                                position: "absolute",
                                left: "49%",
                                bottom: "0%",
                                width: "4.5%",
                                height: "4.5%",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.76)",
                                boxShadow: "0 0 7px rgba(255,255,255,0.16)",
                              }}
                            />

                            <div
                              className="portal-member-badge-spark-c"
                              style={{
                                position: "absolute",
                                left: "74%",
                                bottom: "6%",
                                width: "4.5%",
                                height: "4.5%",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.72)",
                                boxShadow: "0 0 6px rgba(255,255,255,0.14)",
                              }}
                            />

                            <div
                              className="portal-member-badge-burst-a"
                              style={{
                                position: "absolute",
                                left: "31%",
                                bottom: "2%",
                                width: "3.8%",
                                height: "3.8%",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.88)",
                                boxShadow: "0 0 10px rgba(255,255,255,0.22)",
                              }}
                            />

                            <div
                              className="portal-member-badge-burst-b"
                              style={{
                                position: "absolute",
                                left: "58%",
                                bottom: "4%",
                                width: "3.8%",
                                height: "3.8%",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.82)",
                                boxShadow: "0 0 8px rgba(255,255,255,0.20)",
                              }}
                            />

                            <div
                              className="portal-member-badge-burst-c"
                              style={{
                                position: "absolute",
                                left: "81%",
                                bottom: "2%",
                                width: "2.8%",
                                height: "2.8%",
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.78)",
                                boxShadow: "0 0 7px rgba(255,255,255,0.18)",
                              }}
                            />
                          </div>
                        </>
                      ) : null}

                      {badge.imageUrl ? (
                        <>
                          {!badge.unlocked ? (
                            <Image
                              src={badge.imageUrl}
                              alt=""
                              aria-hidden="true"
                              fill
                              sizes="(max-width: 420px) 22vw, (max-width: 640px) 16vw, 96px"
                              style={{
                                objectFit: "contain",
                                display: "block",
                                opacity: 0.28,
                                filter:
                                  "grayscale(1) saturate(0) brightness(0.95) blur(2px)",
                                transform: "scale(1.04)",
                                pointerEvents: "none",
                              }}
                            />
                          ) : null}

                          <Image
                            src={badge.imageUrl}
                            alt={badge.label}
                            fill
                            sizes="(max-width: 420px) 22vw, (max-width: 640px) 16vw, 96px"
                            style={{
                              objectFit: "contain",
                              display: "block",
                              filter: badge.unlocked
                                ? "drop-shadow(0 0 4px rgba(255,255,255,0.08))"
                                : "grayscale(1) saturate(0) brightness(0.60) contrast(0.85) blur(0.2px)",
                              opacity: badge.unlocked ? 1 : 0.35,
                            }}
                          />
                        </>
                      ) : (
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            inset: 0,
                            display: "grid",
                            placeItems: "center",
                            fontSize: 16,
                            opacity: badge.unlocked ? 0.82 : 0.34,
                            filter: badge.unlocked
                              ? "drop-shadow(0 0 6px rgba(255,255,255,0.10))"
                              : "grayscale(1) saturate(0) brightness(0.8)",
                          }}
                        >
                          ✦
                        </div>
                      )}

                      {badge.unlocked ? (
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            width: "46%",
                            height: "46%",
                            transform: "translate(-50%, -50%)",
                            borderRadius: "50%",
                            background:
                              "radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.035) 42%, rgba(255,255,255,0.00) 76%)",
                            filter: "blur(3px)",
                            pointerEvents: "none",
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <div
                  className="portal-member-badge-meta"
                  aria-hidden={!expanded}
                >
                  <div className="portal-member-badge-meta-inner">
                    <div
                      style={{
                        fontSize: expanded ? 13 : 12,
                        lineHeight: 1.3,
                        opacity: badge.unlocked ? 0.92 : 0.7,
                        overflowWrap: "anywhere",
                      }}
                    >
                      {badge.label}
                    </div>

                    {badge.description?.trim() ? (
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 11,
                          lineHeight: 1.35,
                          opacity: 0.58,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {badge.description.trim()}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

export default function PortalMemberPanel(props: Props) {
  const { summary, embedded = false } = props;

  const displayName = summary.identity?.displayName?.trim() || "Anonymous";
  const contributionCount = summary.contributionCount;
  const minutesStreamed = summary.minutesStreamed;
  const favouriteTrack = summary.favouriteTrack;
  const badges = summary.badges.filter(
    (badge) =>
      typeof badge.label === "string" &&
      badge.label.trim().length > 0 &&
      typeof badge.key === "string" &&
      badge.key.trim().length > 0,
  );

  return (
    <div
      style={{
        borderRadius: embedded ? 0 : 18,
        border: embedded ? "none" : "1px solid rgba(255,255,255,0.10)",
        background: embedded ? "transparent" : "rgba(255,255,255,0.04)",
        padding: embedded ? 0 : 16,
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "grid",
          gap: 14,
          minWidth: 0,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              marginTop: 8,
              marginBottom: 4,
              fontSize: 18,
              lineHeight: 1.3,
              letterSpacing: -0.02,
              opacity: 0.85,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {displayName}
          </div>

          <div style={{ marginTop: 14, minWidth: 0 }}>
            <BadgeRow badges={badges} />
          </div>
        </div>

        <MetricTable
          rows={[
            {
              label: "Minutes streamed",
              value: minutesStreamed ?? "—",
              muted: minutesStreamed == null,
            },
            {
              label: "Favourite track",
              value: favouriteTrack ? favouriteTrack.title : "—",
              muted: !favouriteTrack,
            },
            {
              label: "Exegesis contributions",
              value: contributionCount ?? "—",
              muted: contributionCount == null,
            },
          ]}
        />
      </div>
    </div>
  );
}