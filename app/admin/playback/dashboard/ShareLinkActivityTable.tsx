"use client";

import React from "react";
import type { PlaybackAdminSnapshot } from "@/lib/playbackAdmin";
import { TableShell } from "./PlaybackDashboardPrimitives";
import {
  FONT_SIZE_DEDUPE,
  ROW_BORDER,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
  TEXT_STRONG,
} from "./playbackTelemetryDashboardStyles";
import {
  formatAgo,
  formatNumber,
} from "./playbackTelemetryDashboardFormatters";

function formatListenedMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;

  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function ShareLinkActivityTable(props: {
  rows: PlaybackAdminSnapshot["shareLinkActivity"];
}) {
  const { rows } = props;

  return (
    <TableShell>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 860,
        }}
      >
        <thead>
          <tr>
            {[
              "Share link",
              "Qualified plays",
              "Listened time",
              "Completions",
              "Top track",
              "Last activity",
            ].map((label) => (
              <th
                key={label}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  fontSize: FONT_SIZE_DEDUPE,
                  fontWeight: 700,
                  color: TEXT_FAINT,
                  borderBottom: ROW_BORDER,
                  whiteSpace: "nowrap",
                }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td
                colSpan={6}
                style={{
                  padding: 10,
                  fontSize: FONT_SIZE_DEDUPE,
                  color: TEXT_MUTED,
                }}
              >
                No labelled share-link playback yet.
              </td>
            </tr>
          ) : null}

          {rows.map((row) => (
            <tr key={row.telemetryLabel}>
              <td
                style={{
                  padding: "10px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_PRIMARY,
                  fontSize: FONT_SIZE_DEDUPE,
                  fontWeight: 700,
                  maxWidth: 300,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={row.telemetryLabel}
              >
                {row.telemetryLabel}
              </td>

              <td
                style={{
                  padding: "10px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                {formatNumber(row.qualifiedPlayCount)}
              </td>

              <td
                style={{
                  padding: "10px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                {formatListenedMs(row.listenedMs)}
              </td>

              <td
                style={{
                  padding: "10px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                {formatNumber(row.completedCount)}
              </td>

              <td
                style={{
                  padding: "10px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_MUTED,
                  fontSize: FONT_SIZE_DEDUPE,
                  maxWidth: 220,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {row.topTrackTitle ?? "—"}
              </td>

              <td
                style={{
                  padding: "10px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_MUTED,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                {formatAgo(row.lastActivityAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}