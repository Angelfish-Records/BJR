// web/app/home/modules/PortalMemberPanel.tsx
"use client";

import Image from "next/image";
import React from "react";
import type { PortalMemberSummary } from "@/lib/memberDashboard";

type Props = {
  summary: PortalMemberSummary;
  title?: string;
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

function StatTile(props: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  const { label, value, muted = false } = props;

  return (
    <div
      style={{
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.035)",
        padding: 12,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
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
          fontSize: 18,
          lineHeight: 1.15,
          opacity: muted ? 0.56 : 0.92,
          minWidth: 0,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BadgeRow(props: { badges: PortalMemberSummary["badges"] }) {
  const { badges } = props;

  if (badges.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))",
          gap: 10,
        }}
      >
        {badges.map((badge) => {
          const unlockedAt = badge.unlocked
            ? formatUnlockedAt(badge.unlockedAt)
            : null;

          return (
            <div
              key={badge.key}
              title={badge.description || badge.label}
              style={{
                display: "grid",
                gap: 8,
                justifyItems: "center",
                alignContent: "start",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  maxWidth: 88,
                  aspectRatio: "1 / 1",
                  borderRadius: 999,
                  overflow: "hidden",
                  border: badge.unlocked
                    ? "1px solid rgba(255,255,255,0.12)"
                    : "1px solid rgba(255,255,255,0.08)",
                  background: badge.imageUrl
                    ? "rgba(255,255,255,0.05)"
                    : badge.unlocked
                      ? "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.18), rgba(255,255,255,0.055) 58%, rgba(255,255,255,0.02) 100%)"
                      : "radial-gradient(circle at 30% 30%, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 58%, rgba(255,255,255,0.01) 100%)",
                  boxShadow: badge.unlocked
                    ? "inset 0 1px 0 rgba(255,255,255,0.08), 0 6px 18px rgba(0,0,0,0.22)"
                    : "inset 0 1px 0 rgba(255,255,255,0.05)",
                  opacity: badge.unlocked ? 1 : 0.42,
                }}
              >
                {badge.imageUrl ? (
                  <Image
                    src={badge.imageUrl}
                    alt={badge.label}
                    fill
                    sizes="88px"
                    style={{
                      objectFit: "cover",
                      display: "block",
                      filter: badge.unlocked
                        ? "none"
                        : "grayscale(1) saturate(0.35)",
                    }}
                  />
                ) : (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      fontSize: 22,
                      opacity: badge.unlocked ? 0.72 : 0.45,
                    }}
                  >
                    ✦
                  </div>
                )}

                <div
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: badge.unlocked
                      ? "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.02) 42%, rgba(0,0,0,0.18) 100%)"
                      : "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.01) 42%, rgba(0,0,0,0.32) 100%)",
                  }}
                />

                {!badge.unlocked ? (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      background: "rgba(0,0,0,0.18)",
                      fontSize: 10,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      color: "rgba(255,255,255,0.9)",
                    }}
                  >
                    Locked
                  </div>
                ) : null}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 2,
                  width: "100%",
                  minWidth: 0,
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.25,
                    opacity: badge.unlocked ? 0.92 : 0.54,
                    overflowWrap: "anywhere",
                  }}
                >
                  {badge.label}
                </div>

                {badge.unlocked ? (
                  unlockedAt ? (
                    <div
                      style={{
                        fontSize: 10,
                        lineHeight: 1.2,
                        opacity: 0.52,
                      }}
                    >
                      {unlockedAt}
                    </div>
                  ) : null
                ) : (
                  <div
                    style={{
                      fontSize: 10,
                      lineHeight: 1.2,
                      opacity: 0.42,
                    }}
                  >
                    Not yet unlocked
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PortalMemberPanel(props: Props) {
  const { summary, title = "Member" } = props;

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
              fontSize: 24,
              lineHeight: 1,
              letterSpacing: -0.02,
              opacity: 0.95,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            Welcome back, {displayName}
          </div>
          <div style={{ marginTop: 10, minWidth: 0 }}>
            <BadgeRow badges={badges} />
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            minWidth: 0,
          }}
        >
          <StatTile
            label="Exegesis contributions"
            value={contributionCount ?? "—"}
            muted={contributionCount == null}
          />

          <StatTile
            label="Minutes streamed"
            value={minutesStreamed ?? "—"}
            muted={minutesStreamed == null}
          />
        </div>

        <div
          style={{
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background: "rgba(255,255,255,0.03)",
            padding: 12,
            minWidth: 0,
          }}
        >
          <div
            style={{
              fontSize: 11,
              letterSpacing: 0.3,
              textTransform: "uppercase",
              opacity: 0.5,
              lineHeight: 1.2,
            }}
          >
            Favourite track
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 15,
              lineHeight: 1.35,
              opacity: favouriteTrack ? 0.9 : 0.56,
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {favouriteTrack ? <>{favouriteTrack.title}</> : "—"}
          </div>
        </div>
      </div>
    </div>
  );
}
