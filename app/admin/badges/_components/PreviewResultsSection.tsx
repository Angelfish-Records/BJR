// web/app/admin/badges/_components/PreviewResultsSection.tsx
"use client";

import React from "react";
import {
  BG_INSET,
  FONT_SIZE_UI,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "../../playback/dashboard/playbackTelemetryDashboardStyles";
import type { PreviewRow } from "../_lib/badgeDashboardTypes";
import { formatDateTime, formatMetric } from "../_lib/badgeDashboardUtils";

type Props = Readonly<{
  rows: PreviewRow[];
  count: number;
}>;

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 12px",
  fontSize: 12,
  lineHeight: 1.3,
  fontWeight: 700,
  color: TEXT_MUTED,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "12px",
  borderTop: "1px solid rgba(255,255,255,0.08)",
  fontSize: FONT_SIZE_UI,
  lineHeight: 1.45,
  color: TEXT_PRIMARY,
  verticalAlign: "top",
};

const tdNumericStyle: React.CSSProperties = {
  ...tdStyle,
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

export function PreviewResultsSection(props: Props) {
  const { rows, count } = props;

  return (
    <section
      style={{
        border: PANEL_BORDER,
        borderRadius: 18,
        background: BG_INSET,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h2
            style={{
              margin: 0,
              fontSize: 18,
              lineHeight: 1.15,
              color: TEXT_PRIMARY,
            }}
          >
            Preview results
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: FONT_SIZE_UI,
              lineHeight: 1.5,
              color: TEXT_MUTED,
            }}
          >
            Matching members resolved from the current badge qualification
            cohort.
          </p>
        </div>

        <div
          style={{
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
            color: TEXT_MUTED,
          }}
        >
          {count.toLocaleString()} matching member{count === 1 ? "" : "s"}
        </div>
      </div>

      <div
        className="afAdminTableScroller"
        style={{
          overflowX: "auto",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.025)",
        }}
      >
        <table
          style={{
            width: "100%",
            minWidth: 1180,
            borderCollapse: "separate",
            borderSpacing: 0,
          }}
        >
          <thead>
            <tr>
              <th style={thStyle}>Member</th>
              <th style={thStyle}>Member ID</th>
              <th style={thStyle}>Joined</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Minutes</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Plays</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Completes</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Window events</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Exegesis</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Votes</th>
              <th style={thStyle}>Public name</th>
              <th style={thStyle}>Recording</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={11}
                  style={{
                    padding: "18px 12px",
                    fontSize: FONT_SIZE_UI,
                    lineHeight: 1.5,
                    color: TEXT_MUTED,
                  }}
                >
                  No preview results yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.memberId}>
                  <td style={tdStyle}>
                    <div style={{ display: "grid", gap: 2 }}>
                      <span>{row.email || row.memberId}</span>
                    </div>
                  </td>

                  <td style={tdStyle}>
                    <span
                      style={{
                        fontSize: 12,
                        lineHeight: 1.45,
                        color: TEXT_MUTED,
                        wordBreak: "break-word",
                      }}
                    >
                      {row.memberId}
                    </span>
                  </td>

                  <td style={tdStyle}>{formatDateTime(row.joinedAt)}</td>

                  <td style={tdNumericStyle}>
                    {formatMetric(row.minutesStreamed)}
                  </td>

                  <td style={tdNumericStyle}>{formatMetric(row.playCount)}</td>

                  <td style={tdNumericStyle}>
                    {formatMetric(row.completedCount)}
                  </td>

                  <td style={tdNumericStyle}>
                    {formatMetric(row.matchedWindowEventCount)}
                  </td>

                  <td style={tdNumericStyle}>
                    {formatMetric(row.contributionCount)}
                  </td>

                  <td style={tdNumericStyle}>
                    {formatMetric(row.exegesisVoteCount)}
                  </td>

                  <td style={tdStyle}>
                    {row.publicNameUnlockedAt ? (
                      formatDateTime(row.publicNameUnlockedAt)
                    ) : (
                      <span style={{ color: TEXT_MUTED }}>—</span>
                    )}
                  </td>

                  <td style={tdStyle}>
                    {row.matchedRecordingId ? (
                      <div style={{ display: "grid", gap: 3 }}>
                        <span>
                          {row.matchedRecordingTitle || row.matchedRecordingId}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            lineHeight: 1.45,
                            color: TEXT_MUTED,
                            wordBreak: "break-word",
                          }}
                        >
                          {row.matchedRecordingId}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: TEXT_MUTED }}>—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
