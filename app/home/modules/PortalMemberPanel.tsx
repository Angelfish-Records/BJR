// web/app/home/modules/PortalMemberPanel.tsx
"use client";

import Image from "next/image";
import React from "react";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

type Props = {
  summary: PortalMemberSummary;
  title?: string;
};

const GREETING_PREFIXES = [
  "Welcome back, ",
  "Good to see you again, ",
  "This is your day, ",
  "Contemplate the world, ",
  "We've been expecting you, ",
  "Another moment in time, ",
] as const;

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

const GREETING_SESSION_STORAGE_KEY = "portal-member-greeting-index";

function getSessionGreetingIndex(): number {
  if (typeof window === "undefined") return 0;
  if (GREETING_PREFIXES.length <= 1) return 0;

  const existing = window.sessionStorage.getItem(GREETING_SESSION_STORAGE_KEY);

  if (existing != null) {
    const parsed = Number(existing);

    if (
      Number.isInteger(parsed) &&
      parsed >= 0 &&
      parsed < GREETING_PREFIXES.length
    ) {
      return parsed;
    }
  }

  const nextIndex = Math.floor(Math.random() * GREETING_PREFIXES.length);
  window.sessionStorage.setItem(
    GREETING_SESSION_STORAGE_KEY,
    String(nextIndex),
  );
  return nextIndex;
}

function useSessionGreetingPrefix(): string {
  const [index, setIndex] = React.useState(0);

  React.useEffect(() => {
    setIndex(getSessionGreetingIndex());
  }, []);

  return GREETING_PREFIXES[index] ?? GREETING_PREFIXES[0];
}

function MetricRow(props: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  const { label, value, muted = false } = props;

  return (
    <div
      style={{
        padding: 6,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          opacity: 0.5,
          lineHeight: 1.2,
        }}
      >
        {label}
      </div>

      <div
        style={{
          marginTop: 8,
          fontSize: 12,
          lineHeight: 1.35,
          opacity: muted ? 0.56 : 0.9,
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
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

function BadgeRow(props: { badges: PortalMemberSummary["badges"] }) {
  const { badges } = props;

  if (badges.length === 0) return null;

  return (
    <>
      <style jsx>{`
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
            opacity: 0.46;
          }
          100% {
            transform: translate3d(-2px, -20px, 0) scale(1.08);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberRiseB {
          0% {
            transform: translate3d(0, 0, 0) scale(0.68);
            opacity: 0;
          }
          20% {
            opacity: 0.38;
          }
          100% {
            transform: translate3d(2px, -24px, 0) scale(1);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberRiseC {
          0% {
            transform: translate3d(0, 0, 0) scale(0.75);
            opacity: 0;
          }
          22% {
            opacity: 0.34;
          }
          100% {
            transform: translate3d(1px, -18px, 0) scale(0.96);
            opacity: 0;
          }
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

        .portal-member-badge-embers {
          opacity: 0.06;
          transition: opacity 180ms ease;
          pointer-events: none;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-embers,
        .portal-member-badge-wrap:focus-within .portal-member-badge-embers {
          opacity: 1;
        }

        .portal-member-badge-spark-a,
        .portal-member-badge-spark-b,
        .portal-member-badge-spark-c {
          opacity: 0;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-a,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-a {
          animation: portalBadgeEmberRiseA 1300ms ease-out infinite;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-b,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-b {
          animation: portalBadgeEmberRiseB 1600ms ease-out infinite 160ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-c,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-c {
          animation: portalBadgeEmberRiseC 1450ms ease-out infinite 320ms;
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-member-badge-core--locked,
          .portal-member-badge-idle-glow,
          .portal-member-badge-spark-a,
          .portal-member-badge-spark-b,
          .portal-member-badge-spark-c {
            animation: none !important;
          }

          .portal-member-badge-embers {
            opacity: 0 !important;
          }
        }
      `}</style>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, 52px)",
          gap: 14,
          justifyContent: "flex-start",
          alignItems: "start",
        }}
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
              className="portal-member-badge-wrap"
              style={{
                position: "relative",
                display: "grid",
                justifyItems: "center",
                minWidth: 0,
              }}
            >
              <div
                tabIndex={0}
                title={badgeTitle}
                aria-label={badgeTitle}
                className={
                  badge.unlocked
                    ? undefined
                    : "portal-member-badge-core--locked"
                }
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: 52,
                  aspectRatio: "1 / 1",
                  overflow: "visible",
                  outline: "none",
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
                      }}
                    />

                    <div
                      aria-hidden="true"
                      className="portal-member-badge-embers"
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: -2,
                        width: 34,
                        height: 34,
                        transform: "translateX(-50%)",
                        overflow: "visible",
                      }}
                    >
                      <div
                        className="portal-member-badge-spark-a"
                        style={{
                          position: "absolute",
                          left: 6,
                          bottom: 2,
                          width: 3,
                          height: 3,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.82)",
                          boxShadow: "0 0 8px rgba(255,255,255,0.18)",
                        }}
                      />

                      <div
                        className="portal-member-badge-spark-b"
                        style={{
                          position: "absolute",
                          left: 16,
                          bottom: 0,
                          width: 2,
                          height: 2,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.76)",
                          boxShadow: "0 0 7px rgba(255,255,255,0.16)",
                        }}
                      />

                      <div
                        className="portal-member-badge-spark-c"
                        style={{
                          position: "absolute",
                          left: 24,
                          bottom: 3,
                          width: 2,
                          height: 2,
                          borderRadius: "50%",
                          background: "rgba(255,255,255,0.72)",
                          boxShadow: "0 0 6px rgba(255,255,255,0.14)",
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
                        sizes="52px"
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
                      sizes="52px"
                      style={{
                        objectFit: "contain",
                        display: "block",
                        filter: badge.unlocked
                          ? "drop-shadow(0 0 4px rgba(255,255,255,0.08))"
                          : "grayscale(1) saturate(0) brightness(0.60) contrast(0.85) blur(0.2px)",
                        opacity: badge.unlocked ? 1 : 0.42,
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
                      width: 40,
                      height: 40,
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
          );
        })}
      </div>
    </>
  );
}

export default function PortalMemberPanel(props: Props) {
  const { summary, title = "Member" } = props;

  const greetingPrefix = useSessionGreetingPrefix();
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
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        padding: 16,
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
              fontSize: 13,
              lineHeight: 1.2,
              opacity: 0.64,
            }}
          >
            {title}
          </div>

          <div
            style={{
              marginTop: 8,
              marginBottom: 4,
              fontSize: 20,
              lineHeight: 1,
              letterSpacing: -0.02,
              opacity: 0.95,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {greetingPrefix}
            {displayName}
          </div>

          <div style={{ marginTop: 10, minWidth: 0 }}>
            <BadgeRow badges={badges} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 6,
            minWidth: 0,
          }}
        >
          <MetricRow
            label="Minutes streamed"
            value={minutesStreamed ?? "—"}
            muted={minutesStreamed == null}
          />
          <MetricRow
            label="Favourite track"
            value={favouriteTrack ? favouriteTrack.title : "—"}
            muted={!favouriteTrack}
          />
          <MetricRow
            label="Exegesis contributions"
            value={contributionCount ?? "—"}
            muted={contributionCount == null}
          />
        </div>
      </div>
    </div>
  );
}
