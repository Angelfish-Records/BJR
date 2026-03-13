// web/app/home/modules/PortalMemberPanel.tsx
"use client";

import React from "react";
import type { PortalMemberSummary } from "@/lib/memberDashboard";
import BadgeCabinet from "./badges/BadgeCabinet";

type Props = {
  summary: PortalMemberSummary;
  title?: string;
  embedded?: boolean;
};

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

export default function PortalMemberPanel(props: Props) {
  const { summary, embedded = false } = props;

  const displayName = summary.identity?.displayName?.trim() || "Anonymous";
  const contributionCount = summary.contributionCount;
  const minutesStreamed = summary.minutesStreamed;
  const favouriteTrack = summary.favouriteTrack;

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
            <BadgeCabinet badges={summary.badges} />
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
              label: "Exegesis posts",
              value: contributionCount ?? "—",
              muted: contributionCount == null,
            },
          ]}
        />
      </div>
    </div>
  );
}