// web/app/admin/playback/dashboard/PlaybackDashboardPrimitives.tsx
"use client";

import React from "react";
import type { TrendRangeKey } from "./types";
import {
  BG_INSET,
  BG_PANEL,
  FONT_SIZE_UI,
  PANEL_BORDER,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "./playbackTelemetryDashboardStyles";

export function SectionCard(
  props: Readonly<{
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    headerRight?: React.ReactNode;
  }>,
) {
  return (
    <section
      style={{
        border: PANEL_BORDER,
        borderRadius: 14,
        padding: 14,
        background: BG_PANEL,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: FONT_SIZE_UI,
              fontWeight: 800,
              color: TEXT_PRIMARY,
              lineHeight: 1.4,
            }}
          >
            {props.title}
          </div>

          {props.subtitle ? (
            <div
              style={{
                marginTop: 4,
                fontSize: FONT_SIZE_UI,
                lineHeight: 1.5,
                color: TEXT_MUTED,
                maxWidth: 780,
              }}
            >
              {props.subtitle}
            </div>
          ) : null}
        </div>

        {props.headerRight ? <div>{props.headerRight}</div> : null}
      </div>

      {props.children}
    </section>
  );
}

export function TableShell(
  props: Readonly<{ children: React.ReactNode }>,
) {
  return (
    <div
      style={{
        overflowX: "auto",
        borderRadius: 12,
        border: PANEL_BORDER,
        background: BG_INSET,
      }}
    >
      {props.children}
    </div>
  );
}

export function MetricPill(
  props: Readonly<{ label: string; value: string }>,
) {
  return (
    <div
      style={{
        minWidth: 120,
        padding: "10px 12px",
        borderRadius: 12,
        border: PANEL_BORDER,
        background: BG_INSET,
        display: "grid",
        gap: 4,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: TEXT_FAINT,
          fontWeight: 700,
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        {props.label}
      </div>
      <div
        style={{
          fontSize: 16,
          color: TEXT_PRIMARY,
          fontWeight: 800,
          lineHeight: 1.2,
        }}
      >
        {props.value}
      </div>
    </div>
  );
}

export function AudienceBadge(
  props: Readonly<{ audience: "member" | "anonymous" }>,
) {
  const isMember = props.audience === "member";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: isMember
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.04)",
        color: isMember ? TEXT_PRIMARY : TEXT_MUTED,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      {isMember ? "Member" : "Anonymous"}
    </span>
  );
}

export function TrendRangeToggle(
  props: Readonly<{
    value: TrendRangeKey;
    onChange: (value: TrendRangeKey) => void;
  }>,
) {
  const options: Array<{ key: TrendRangeKey; label: string }> = [
    { key: "hour", label: "Hour" },
    { key: "day", label: "Day" },
    { key: "week", label: "Week" },
    { key: "month", label: "Month" },
    { key: "year", label: "Year" },
    { key: "allTime", label: "All time" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 6,
        flexWrap: "wrap",
      }}
    >
      {options.map((option) => {
        const selected = props.value === option.key;

        return (
          <button
            key={option.key}
            type="button"
            onClick={() => props.onChange(option.key)}
            style={{
              height: 30,
              padding: "0 12px",
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.14)",
              background: selected
                ? "rgba(255,255,255,0.12)"
                : "rgba(255,255,255,0.04)",
              color: selected ? TEXT_PRIMARY : TEXT_MUTED,
              cursor: "pointer",
              fontSize: FONT_SIZE_UI,
              fontWeight: 700,
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}