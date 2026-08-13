// web/app/admin/playback/dashboard/AudienceSplitCard.tsx
"use client";

import React from "react";
import type { PlaybackAdminSnapshot } from "@/lib/playbackAdmin";
import { SectionCard } from "./PlaybackDashboardPrimitives";
import {
  BG_ANON,
  BG_INSET,
  BG_MEMBER,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "./playbackTelemetryDashboardStyles";
import {
  formatNumber,
  percentage,
} from "./playbackTelemetryDashboardFormatters";

type SliceKey = "member" | "anonymous";

type AudienceDonutProps = Readonly<{
  label: string;
  member: number;
  anonymous: number;
}>;

type SegmentArc = {
  key: SliceKey;
  label: string;
  value: number;
  pct: number;
  color: string;
  path: string;
  labelX: number;
  labelY: number;
};

function polarToCartesian(
  cx: number,
  cy: number,
  radius: number,
  angleInDegrees: number,
) {
  const radians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}

function describeDonutArc(
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
  startAngle: number,
  endAngle: number,
) {
  const startOuter = polarToCartesian(cx, cy, outerRadius, endAngle);
  const endOuter = polarToCartesian(cx, cy, outerRadius, startAngle);
  const startInner = polarToCartesian(cx, cy, innerRadius, endAngle);
  const endInner = polarToCartesian(cx, cy, innerRadius, startAngle);
  const angleDelta = endAngle - startAngle;
  const largeArcFlag: 0 | 1 = angleDelta > 180 ? 1 : 0;

  const path = [
    `M ${startOuter.x} ${startOuter.y}`,
    `A ${outerRadius} ${outerRadius} 0 ${largeArcFlag} 0 ${endOuter.x} ${endOuter.y}`,
    `L ${endInner.x} ${endInner.y}`,
    `A ${innerRadius} ${innerRadius} 0 ${largeArcFlag} 1 ${startInner.x} ${startInner.y}`,
    "Z",
  ].join(" ");

  return { path };
}

function buildSegments(
  member: number,
  anonymous: number,
  cx: number,
  cy: number,
  outerRadius: number,
  innerRadius: number,
): SegmentArc[] {
  const total = member + anonymous;

  const slices: Array<{
    key: SliceKey;
    label: string;
    value: number;
    pct: number;
    color: string;
  }> = [
    {
      key: "member",
      label: "Members",
      value: member,
      pct: percentage(member, total),
      color: BG_MEMBER,
    },
    {
      key: "anonymous",
      label: "Anonymous",
      value: anonymous,
      pct: percentage(anonymous, total),
      color: BG_ANON,
    },
  ];

  let currentAngle = 0;

  return slices
    .filter((slice) => slice.value > 0 && total > 0)
    .map((slice) => {
      const sweep = (slice.value / total) * 360;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweep;
      currentAngle = endAngle;

      const { path } = describeDonutArc(
        cx,
        cy,
        outerRadius,
        innerRadius,
        startAngle,
        endAngle,
      );

      const midAngle = startAngle + sweep / 2;
      const labelRadius = innerRadius + (outerRadius - innerRadius) * 0.58;
      const labelPosition = polarToCartesian(cx, cy, labelRadius, midAngle);

      return {
        ...slice,
        path,
        labelX: labelPosition.x,
        labelY: labelPosition.y,
      };
    });
}

function AudienceDonut(props: AudienceDonutProps) {
  const { label, member, anonymous } = props;
  const total = member + anonymous;
  const [hovered, setHovered] = React.useState<SliceKey | null>(null);

  const size = 272;
  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = 110;
  const innerRadius = 58;

  const memberPct = percentage(member, total);
  const anonymousPct = percentage(anonymous, total);

  const segments = buildSegments(
    member,
    anonymous,
    cx,
    cy,
    outerRadius,
    innerRadius,
  );

  const hoveredSegment =
    hovered === null
      ? null
      : segments.find((segment) => segment.key === hovered) ?? null;

  const memberLabelVisible = member > 0 && memberPct >= 7;
  const anonymousLabelVisible = anonymous > 0 && anonymousPct >= 7;

  return (
    <div
      style={{
        padding: "6px 6px 2px",
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          fontSize: 13,
          color: TEXT_PRIMARY,
          fontWeight: 700,
        }}
      >
        {label}
      </div>

      <div
        style={{
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: size,
            aspectRatio: "1 / 1",
          }}
        >
          <svg
            viewBox={`0 0 ${size} ${size}`}
            style={{
              display: "block",
              width: "100%",
              height: "auto",
              overflow: "visible",
            }}
            aria-label={`${label} audience split`}
          >
            {segments.map((segment) => {
              const isHovered = hovered === segment.key;
              const shouldShowPct =
                segment.key === "member"
                  ? memberLabelVisible
                  : anonymousLabelVisible;
              const opacity = hovered === null || isHovered ? 1 : 0.42;

              return (
                <g key={segment.key}>
                  <path
                    d={segment.path}
                    fill={segment.color}
                    opacity={opacity}
                    style={{
                      cursor: "default",
                      transition: "opacity 160ms ease, filter 160ms ease",
                      filter: isHovered ? "brightness(1.05)" : "none",
                    }}
                    onMouseEnter={() => setHovered(segment.key)}
                    onMouseLeave={() => setHovered(null)}
                    onFocus={() => setHovered(segment.key)}
                    onBlur={() => setHovered(null)}
                    tabIndex={0}
                  >
                    <title>
                      {segment.label}: {formatNumber(segment.value)} plays (
                      {segment.pct.toFixed(1)}%)
                    </title>
                  </path>

                  {shouldShowPct ? (
                    <text
                      x={segment.labelX}
                      y={segment.labelY}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      style={{
                        fill: "#ffffff",
                        fontSize: 14,
                        fontWeight: 800,
                        pointerEvents: "none",
                        userSelect: "none",
                      }}
                    >
                      {segment.pct.toFixed(0)}%
                    </text>
                  ) : null}
                </g>
              );
            })}

            <circle cx={cx} cy={cy} r={innerRadius - 1} fill={BG_INSET} />

            <text
              x={cx}
              y={cy - 22}
              textAnchor="middle"
              style={{
                fill: TEXT_FAINT,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              {hoveredSegment ? hoveredSegment.label : label}
            </text>

            <text
              x={cx}
              y={cy + 4}
              textAnchor="middle"
              style={{
                fill: TEXT_PRIMARY,
                fontSize: hoveredSegment ? 20 : 24,
                fontWeight: 800,
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              {hoveredSegment
                ? formatNumber(hoveredSegment.value)
                : formatNumber(total)}
            </text>

            <text
              x={cx}
              y={cy + 26}
              textAnchor="middle"
              style={{
                fill: TEXT_MUTED,
                fontSize: 11,
                fontWeight: 600,
                userSelect: "none",
                pointerEvents: "none",
              }}
            >
              {hoveredSegment
                ? `${hoveredSegment.pct.toFixed(1)}%`
                : "qualified plays"}
            </text>
          </svg>
        </div>
      </div>
    </div>
  );
}

export function AudienceSplitCard(
  props: Readonly<{ snapshot: PlaybackAdminSnapshot }>,
) {
  const allTimeMember = props.snapshot.audienceSplit.allTimeMemberPlayCount;
  const allTimeAnonymous =
    props.snapshot.audienceSplit.allTimeAnonymousPlayCount;
  const recentMember = props.snapshot.audienceSplit.recent30dMemberPlayCount;
  const recentAnonymous =
    props.snapshot.audienceSplit.recent30dAnonymousPlayCount;

  return (
    <SectionCard
      title="Qualified play audience split"
      subtitle=""
    >
      <div
        className="afAdminStackOnMobile"
        style={{
          display: "grid",
          gap: 18,
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          alignItems: "start",
        }}
      >
        <AudienceDonut
          label="All time"
          member={allTimeMember}
          anonymous={allTimeAnonymous}
        />

        <AudienceDonut
          label="Past 30 days"
          member={recentMember}
          anonymous={recentAnonymous}
        />
      </div>
    </SectionCard>
  );
}