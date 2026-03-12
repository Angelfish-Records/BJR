"use client";

import React from "react";
import type { PreviewRow } from "../_lib/badgeDashboardTypes";
import { formatDateTime, formatMetric } from "../_lib/badgeDashboardUtils";

type Props = {
  rows: PreviewRow[];
  count: number;
};

export function PreviewResultsSection(props: Props) {
  const { rows, count } = props;

  return (
    <section
      style={{
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 16,
        padding: 16,
        display: "grid",
        gap: 12,
      }}
    >
      <div
        style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
      >
        <h2 style={{ margin: 0, fontSize: 20 }}>Preview results</h2>
        <span style={{ opacity: 0.72 }}>
          {count.toLocaleString()} matching member{count === 1 ? "" : "s"}
        </span>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Member</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>
                Member ID
              </th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>Joined</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>
                Minutes
              </th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>Plays</th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>
                Completes
              </th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>
                Window events
              </th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>
                Exegesis
              </th>
              <th style={{ textAlign: "right", padding: "8px 10px" }}>Votes</th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>
                Public name
              </th>
              <th style={{ textAlign: "left", padding: "8px 10px" }}>
                Recording
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={11} style={{ padding: "14px 10px", opacity: 0.7 }}>
                  No preview results yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.memberId}>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {row.email || row.memberId}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {row.memberId}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {formatDateTime(row.joinedAt)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      textAlign: "right",
                    }}
                  >
                    {formatMetric(row.minutesStreamed)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      textAlign: "right",
                    }}
                  >
                    {formatMetric(row.playCount)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      textAlign: "right",
                    }}
                  >
                    {formatMetric(row.completedCount)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      textAlign: "right",
                    }}
                  >
                    {formatMetric(row.matchedWindowEventCount)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      textAlign: "right",
                    }}
                  >
                    {formatMetric(row.contributionCount)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                      textAlign: "right",
                    }}
                  >
                    {formatMetric(row.exegesisVoteCount)}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {row.publicNameUnlockedAt
                      ? formatDateTime(row.publicNameUnlockedAt)
                      : "—"}
                  </td>
                  <td
                    style={{
                      padding: "10px",
                      borderTop: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {row.matchedRecordingId ? (
                      <div style={{ display: "grid", gap: 3 }}>
                        <span>
                          {row.matchedRecordingTitle || row.matchedRecordingId}
                        </span>
                        <span style={{ opacity: 0.55, fontSize: 12 }}>
                          {row.matchedRecordingId}
                        </span>
                      </div>
                    ) : (
                      "—"
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
