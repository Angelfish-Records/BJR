// web/app/admin/playback/PlaybackTelemetryDashboardClient.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { PlaybackAdminSnapshot } from "@/lib/playbackAdmin";
import AdminPageFrame from "../AdminPageFrame";

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-NZ").format(value);
}

function formatHoursFromMs(value: number): string {
  const hours = value / 3_600_000;
  return hours >= 10 ? hours.toFixed(0) : hours.toFixed(1);
}

function formatMinutesFromMs(value: number): string {
  return formatNumber(Math.floor(value / 60_000));
}

function formatAgo(iso: string | null): string {
  if (!iso) return "—";

  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "—";

  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

function ellipsisMiddle(value: string, keep = 8): string {
  if (value.length <= keep * 2 + 1) return value;
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

function fmtSnapshotStamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-NZ", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtTrendTick(iso: string, range: TrendRangeKey): string {
  try {
    const date = new Date(iso);

    if (range === "hour") {
      return date.toLocaleTimeString("en-NZ", {
        hour: "numeric",
        minute: "2-digit",
      });
    }

    if (range === "day") {
      return date.toLocaleTimeString("en-NZ", {
        hour: "numeric",
      });
    }

    if (range === "week") {
      return date.toLocaleDateString("en-NZ", {
        weekday: "short",
      });
    }

    if (range === "month") {
      return date.toLocaleDateString("en-NZ", {
        day: "numeric",
        month: "short",
      });
    }

    if (range === "year") {
      return date.toLocaleDateString("en-NZ", {
        month: "short",
      });
    }

    return date.toLocaleDateString("en-NZ", {
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

type ChartPoint = {
  x: number;
  y: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function buildSmoothCommands(points: ChartPoint[]): string {
  if (points.length < 2) return "";

  let d = "";

  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[index - 1] ?? points[index];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[index + 2] ?? p2;

    const rawCp1x = p1.x + (p2.x - p0.x) / 6;
    const rawCp1y = p1.y + (p2.y - p0.y) / 6;
    const rawCp2x = p2.x - (p3.x - p1.x) / 6;
    const rawCp2y = p2.y - (p3.y - p1.y) / 6;

    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);

    const cp1x = rawCp1x;
    const cp1y = clamp(rawCp1y, minY, maxY);
    const cp2x = rawCp2x;
    const cp2y = clamp(rawCp2y, minY, maxY);

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }

  return d;
}

function buildSmoothLinePath(points: ChartPoint[]): string {
  if (points.length === 0) return "";
  return `M ${points[0].x} ${points[0].y}${buildSmoothCommands(points)}`;
}

function buildSmoothAreaPath(upper: ChartPoint[], lower: ChartPoint[]): string {
  if (upper.length === 0 || lower.length === 0) return "";

  const reversedLower = [...lower].reverse();

  return [
    `M ${upper[0].x} ${upper[0].y}`,
    buildSmoothCommands(upper),
    ` L ${reversedLower[0].x} ${reversedLower[0].y}`,
    buildSmoothCommands(reversedLower),
    " Z",
  ].join("");
}

function formatAggregateValue(
  label: string,
  value: number | null | undefined,
): string {
  if (value == null) return "—";
  if (label === "Hours listened") return formatHoursFromMs(value);
  if (label === "Minutes listened") return formatMinutesFromMs(value);
  return formatNumber(value);
}

function percentage(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (part / total) * 100));
}

type TrackRow = PlaybackAdminSnapshot["topTracksByListenedMs"][number];
type DedupeRowBase = PlaybackAdminSnapshot["recentDedupe"][number];
type TrendRangeKey = keyof PlaybackAdminSnapshot["qualifiedPlayTrends"];
type TrendBucket =
  PlaybackAdminSnapshot["qualifiedPlayTrends"][TrendRangeKey]["buckets"][number];

type DedupeRow = DedupeRowBase & {
  recordingTitle?: string | null;
  trackTitle?: string | null;
  memberEmail?: string | null;
};

type DedupeSessionRow = {
  groupKey: string;
  playbackId: string;
  audience: "member" | "anonymous";
  memberId: string | null;
  memberEmail: string | null;
  recordingId: string | null;
  recordingTitle: string | null;
  createdAt: string;
  latestAt: string;
  progressMs: number;
  progressPct: number;
  creditedMilestoneCount: number;
  hasPlay: boolean;
  hasComplete: boolean;
  statusLabel: string;
  sourceRows: DedupeRow[];
};

const PANEL_BORDER = "1px solid rgba(255,255,255,0.12)";
const ROW_BORDER = "1px solid rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "rgba(255,255,255,0.92)";
const TEXT_STRONG = "rgba(255,255,255,0.86)";
const TEXT_MUTED = "rgba(255,255,255,0.68)";
const TEXT_FAINT = "rgba(255,255,255,0.58)";
const BG_PANEL = "rgba(255,255,255,0.04)";
const BG_INSET = "rgba(255,255,255,0.02)";
const BG_ACCENT = "rgba(255,255,255,0.08)";
const BG_MEMBER = "rgba(255,255,255,0.78)";
const BG_ANON = "rgba(255,255,255,0.22)";
const FONT_SIZE_UI = 12;
const FONT_SIZE_DEDUPE = 11;

function SectionCard(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
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

function TableShell(props: { children: React.ReactNode }) {
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

function AggregateTable(props: { snapshot: PlaybackAdminSnapshot }) {
  const rows = [
    {
      label: "Qualified plays",
      memberAllTime: props.snapshot.memberTotals.playCount,
      member30d: props.snapshot.member30d.playCount,
      siteAllTime: props.snapshot.siteTotals.playCount,
      site30d: props.snapshot.site30d.playCount,
    },
    {
      label: "Active",
      memberAllTime: props.snapshot.memberTotals.activeCount,
      member30d: props.snapshot.member30d.activeCount,
      siteAllTime: props.snapshot.siteTotals.activeCount,
      site30d: props.snapshot.site30d.activeCount,
    },
    {
      label: "Hours listened",
      memberAllTime: props.snapshot.memberTotals.listenedMs,
      member30d: props.snapshot.member30d.listenedMs,
      siteAllTime: props.snapshot.siteTotals.listenedMs,
      site30d: props.snapshot.site30d.listenedMs,
    },
    {
      label: "Minutes listened",
      memberAllTime: props.snapshot.memberTotals.listenedMs,
      member30d: props.snapshot.member30d.listenedMs,
      siteAllTime: props.snapshot.siteTotals.listenedMs,
      site30d: props.snapshot.site30d.listenedMs,
    },
    {
      label: "90% completes",
      memberAllTime: props.snapshot.memberTotals.completedCount,
      member30d: props.snapshot.member30d.completedCount,
      siteAllTime: props.snapshot.siteTotals.completedCount,
      site30d: props.snapshot.site30d.completedCount,
    },
  ];

  return (
    <TableShell>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 820,
        }}
      >
        <thead>
          <tr>
            {[
              "Category",
              "Members · All time",
              "Members · 30d",
              "Site · All time",
              "Site · 30d",
            ].map((label) => (
              <th
                key={label}
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: FONT_SIZE_UI,
                  fontWeight: 700,
                  color: TEXT_MUTED,
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
          {rows.map((row) => {
            const isQualifiedPlays = row.label === "Qualified plays";

            const cellStyle = (highlight: boolean): React.CSSProperties => ({
              padding: "10px 14px",
              borderBottom: ROW_BORDER,
              color: highlight ? "rgba(255,255,255,0.98)" : TEXT_STRONG,
              fontSize: highlight ? 15 : FONT_SIZE_UI,
              fontWeight: highlight ? 800 : 400,
              letterSpacing: highlight ? "-0.01em" : undefined,
              whiteSpace: "nowrap",
            });

            return (
              <tr key={row.label}>
                <td
                  style={{
                    padding: "10px 14px",
                    borderBottom: ROW_BORDER,
                    color: TEXT_PRIMARY,
                    fontSize: FONT_SIZE_UI,
                    fontWeight: isQualifiedPlays ? 800 : 700,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.label}
                </td>
                <td style={cellStyle(isQualifiedPlays)}>
                  {formatAggregateValue(row.label, row.memberAllTime)}
                </td>
                <td style={cellStyle(isQualifiedPlays)}>
                  {formatAggregateValue(row.label, row.member30d)}
                </td>
                <td style={cellStyle(isQualifiedPlays)}>
                  {formatAggregateValue(row.label, row.siteAllTime)}
                </td>
                <td style={cellStyle(isQualifiedPlays)}>
                  {formatAggregateValue(row.label, row.site30d)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

function TrackTable(props: { rows: TrackRow[]; emptyLabel?: string }) {
  return (
    <TableShell>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 520,
        }}
      >
        <thead>
          <tr>
            {["Track", "Hours", "Plays", "Completes", "Last heard"].map(
              (label) => (
                <th
                  key={label}
                  style={{
                    textAlign: "left",
                    padding: "10px 12px",
                    fontSize: FONT_SIZE_UI,
                    fontWeight: 700,
                    color: TEXT_MUTED,
                    borderBottom: ROW_BORDER,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>

        <tbody>
          {props.rows.length === 0 ? (
            <tr>
              <td
                colSpan={5}
                style={{
                  padding: 12,
                  fontSize: FONT_SIZE_UI,
                  color: TEXT_MUTED,
                }}
              >
                {props.emptyLabel ?? "No rows."}
              </td>
            </tr>
          ) : null}

          {props.rows.map((row) => (
            <tr key={row.recordingId}>
              <td
                style={{
                  padding: "10px 12px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_PRIMARY,
                  fontSize: FONT_SIZE_UI,
                  fontWeight: 700,
                }}
              >
                {row.title}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_UI,
                  whiteSpace: "nowrap",
                }}
              >
                {formatHoursFromMs(row.listenedMs)}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_UI,
                  whiteSpace: "nowrap",
                }}
              >
                {formatNumber(row.playCount)}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_UI,
                  whiteSpace: "nowrap",
                }}
              >
                {formatNumber(row.completedCount)}
              </td>
              <td
                style={{
                  padding: "10px 12px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_MUTED,
                  fontSize: FONT_SIZE_UI,
                  whiteSpace: "nowrap",
                }}
              >
                {formatAgo(row.lastListenedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
  );
}

function resolveDedupeIdentityLabel(row: DedupeRow): string {
  if (row.audience === "anonymous") return "Anonymous";
  if (row.memberEmail) return row.memberEmail;
  if (row.memberId) return ellipsisMiddle(row.memberId, 8);
  return "Member";
}

function parseMilestoneMs(milestoneKey: string): number | null {
  const normalized = milestoneKey.trim();

  if (!/^\d+$/.test(normalized)) return null;

  const milestoneMs = Number(normalized);
  if (!Number.isFinite(milestoneMs) || milestoneMs < 0) return null;

  return Math.floor(milestoneMs);
}

function isProgressEvent(eventType: string): boolean {
  return eventType.toLowerCase().includes("progress");
}

function isPlayEvent(eventType: string): boolean {
  const normalized = eventType.toLowerCase();
  return normalized.includes("play") && !normalized.includes("progress");
}

function isCompleteEvent(eventType: string): boolean {
  return eventType.toLowerCase().includes("complete");
}

function formatProgressLabel(progressMs: number, hasComplete: boolean): string {
  if (hasComplete) return "Complete";
  if (progressMs <= 0) return "Started";
  const wholeSeconds = Math.floor(progressMs / 1000);
  return `${formatNumber(wholeSeconds)}s credited`;
}

function buildDedupeSessionRows(rows: DedupeRow[]): DedupeSessionRow[] {
  const groups = new Map<string, DedupeRow[]>();

  for (const row of rows) {
    const identityKey =
      row.audience === "anonymous"
        ? "anonymous"
        : (row.memberEmail ?? row.memberId ?? "member");
    const trackKey = row.recordingId ?? row.recordingTitle ?? "unknown-track";
    const groupKey = [row.audience, identityKey, trackKey, row.playbackId].join(
      "::",
    );

    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(row);
    } else {
      groups.set(groupKey, [row]);
    }
  }

  return Array.from(groups.entries())
    .map(([groupKey, sourceRows]) => {
      const ordered = [...sourceRows].sort((a, b) => {
        return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      });

      const first = ordered[0];
      const last = ordered[ordered.length - 1];

      let maxProgressMs = 0;
      let creditedMilestoneCount = 0;
      let hasPlay = false;
      let hasComplete = false;

      for (const row of ordered) {
        if (isPlayEvent(row.eventType)) hasPlay = true;
        if (isCompleteEvent(row.eventType)) hasComplete = true;

        if (isProgressEvent(row.eventType)) {
          creditedMilestoneCount += 1;
          const milestoneMs = parseMilestoneMs(row.milestoneKey);
          if (milestoneMs != null) {
            maxProgressMs = Math.max(maxProgressMs, milestoneMs);
          }
        }
      }

      const progressPct = hasComplete
        ? 100
        : Math.max(0, Math.min(100, maxProgressMs / 1000));

      const statusLabel = hasComplete
        ? "Completed"
        : maxProgressMs > 0
          ? "In progress"
          : hasPlay
            ? "Started"
            : "Telemetry";

      return {
        groupKey,
        playbackId: first.playbackId,
        audience: first.audience,
        memberId: first.memberId ?? null,
        memberEmail: first.memberEmail ?? null,
        recordingId: first.recordingId ?? null,
        recordingTitle: first.recordingTitle ?? null,
        createdAt: first.createdAt,
        latestAt: last.createdAt,
        progressMs: hasComplete ? 100_000 : maxProgressMs,
        progressPct,
        creditedMilestoneCount,
        hasPlay,
        hasComplete,
        statusLabel,
        sourceRows: ordered,
      };
    })
    .sort((a, b) => Date.parse(b.latestAt) - Date.parse(a.latestAt));
}

function AudienceBadge(props: { audience: "member" | "anonymous" }) {
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

function DedupeTable(props: { rows: PlaybackAdminSnapshot["recentDedupe"] }) {
  const rawRows = props.rows as DedupeRow[];
  const rows = React.useMemo(() => buildDedupeSessionRows(rawRows), [rawRows]);

  return (
    <TableShell>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 1120,
        }}
      >
        <thead>
          <tr>
            {[
              "When",
              "Track / Session",
              "Progress",
              "Status",
              "Audience",
              "Listener",
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
                No rows.
              </td>
            </tr>
          ) : null}

          {rows.map((row) => {
            const identityLabel = resolveDedupeIdentityLabel({
              audience: row.audience,
              memberEmail: row.memberEmail,
              memberId: row.memberId,
              playbackId: row.playbackId,
              recordingTitle: row.recordingTitle,
              eventType: "",
              milestoneKey: "",
              createdAt: row.createdAt,
              recordingId: row.recordingId,
            } as DedupeRow);

            const monospaceIdentity =
              row.memberEmail == null && row.memberId != null;

            return (
              <tr key={row.groupKey}>
                <td
                  style={{
                    padding: "10px 10px",
                    borderBottom: ROW_BORDER,
                    color: TEXT_MUTED,
                    fontSize: FONT_SIZE_DEDUPE,
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                  }}
                >
                  <div>{formatAgo(row.latestAt)}</div>
                  <div
                    style={{
                      marginTop: 4,
                      color: TEXT_FAINT,
                    }}
                  >
                    {row.sourceRows.length} events
                  </div>
                </td>

                <td
                  style={{
                    padding: "10px 10px",
                    borderBottom: ROW_BORDER,
                    color: TEXT_STRONG,
                    fontSize: FONT_SIZE_DEDUPE,
                    verticalAlign: "top",
                    minWidth: 220,
                  }}
                >
                  <div
                    style={{
                      color: TEXT_PRIMARY,
                      fontWeight: 700,
                    }}
                  >
                    {row.recordingTitle ??
                      `session ${ellipsisMiddle(row.playbackId, 10)}`}
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      color: TEXT_FAINT,
                    }}
                  >
                    {ellipsisMiddle(row.playbackId, 10)}
                  </div>
                </td>

                <td
                  style={{
                    padding: "10px 10px",
                    borderBottom: ROW_BORDER,
                    fontSize: FONT_SIZE_DEDUPE,
                    verticalAlign: "top",
                    minWidth: 300,
                  }}
                >
                  <div
                    style={{
                      height: 12,
                      width: "100%",
                      borderRadius: 999,
                      overflow: "hidden",
                      background: BG_ACCENT,
                      border: "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${row.progressPct}%`,
                        borderRadius: 999,
                        background:
                          row.audience === "member" ? BG_MEMBER : BG_ANON,
                        transition: "width 180ms ease-out",
                      }}
                    />
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                      color: TEXT_MUTED,
                    }}
                  >
                    <span>
                      {formatProgressLabel(row.progressMs, row.hasComplete)}
                    </span>
                    <span>
                      {row.creditedMilestoneCount > 0
                        ? `${formatNumber(row.creditedMilestoneCount)} milestones`
                        : row.hasPlay
                          ? "Play recorded"
                          : "No progress milestones"}
                    </span>
                  </div>
                </td>

                <td
                  style={{
                    padding: "10px 10px",
                    borderBottom: ROW_BORDER,
                    color: TEXT_STRONG,
                    fontSize: FONT_SIZE_DEDUPE,
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                  }}
                >
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 20,
                      padding: "0 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: row.hasComplete
                        ? "rgba(255,255,255,0.12)"
                        : "rgba(255,255,255,0.06)",
                      color: TEXT_PRIMARY,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: "0.02em",
                      textTransform: "uppercase",
                    }}
                  >
                    {row.statusLabel}
                  </span>
                </td>

                <td
                  style={{
                    padding: "10px 10px",
                    borderBottom: ROW_BORDER,
                    color: TEXT_STRONG,
                    fontSize: FONT_SIZE_DEDUPE,
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                  }}
                >
                  <AudienceBadge audience={row.audience} />
                </td>

                <td
                  style={{
                    padding: "10px 10px",
                    borderBottom: ROW_BORDER,
                    color: TEXT_STRONG,
                    fontSize: FONT_SIZE_DEDUPE,
                    maxWidth: 280,
                    verticalAlign: "top",
                    fontFamily: monospaceIdentity
                      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
                      : undefined,
                  }}
                >
                  {identityLabel}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

function MetricPill(props: { label: string; value: string }) {
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

function TrendRangeToggle(props: {
  value: TrendRangeKey;
  onChange: (value: TrendRangeKey) => void;
}) {
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

function QualifiedPlayTrendChart(props: {
  rows: TrendBucket[];
  range: TrendRangeKey;
}) {
  const rows = props.rows;
  const width = 920;
  const height = 240;
  const paddingTop = 12;
  const paddingRight = 14;
  const paddingBottom = 32;
  const paddingLeft = 46;
  const innerWidth = width - paddingLeft - paddingRight;
  const innerHeight = height - paddingTop - paddingBottom;

  const series = [
    {
      key: "anonymous",
      label: "Anonymous plays",
      fill: "rgba(255,255,255,0.18)",
      values: rows.map((row) => row.anonymousPlayCount),
    },
    {
      key: "member",
      label: "Member plays",
      fill: "rgba(255,255,255,0.56)",
      values: rows.map((row) => row.memberPlayCount),
    },
  ] as const;

  const maxTotal = Math.max(1, ...rows.map((row) => row.sitePlayCount));
  const yTickCount = 4;
  const yTicks = Array.from({ length: yTickCount + 1 }, (_, index) => {
    const ratio = index / yTickCount;
    const value = Math.round(maxTotal * (1 - ratio));
    const y = paddingTop + innerHeight * ratio;
    return { value, y };
  });

  const xForIndex = (index: number): number => {
    if (rows.length <= 1) return paddingLeft + innerWidth / 2;
    return paddingLeft + (index / (rows.length - 1)) * innerWidth;
  };

  const yForValue = (value: number): number =>
    paddingTop + innerHeight - (value / maxTotal) * innerHeight;

  const stackedLayers = series.map((layer, layerIndex) => {
    const lowerValues = rows.map((_, rowIndex) =>
      series
        .slice(0, layerIndex)
        .reduce((sum, candidate) => sum + candidate.values[rowIndex], 0),
    );

    const upperValues = lowerValues.map(
      (lower, rowIndex) => lower + layer.values[rowIndex],
    );

    const lowerPoints = lowerValues.map((value, rowIndex) => ({
      x: xForIndex(rowIndex),
      y: yForValue(value),
    }));

    const upperPoints = upperValues.map((value, rowIndex) => ({
      x: xForIndex(rowIndex),
      y: yForValue(value),
    }));

    return {
      key: layer.key,
      label: layer.label,
      fill: layer.fill,
      lowerPoints,
      upperPoints,
      areaPath: buildSmoothAreaPath(upperPoints, lowerPoints),
      linePath: buildSmoothLinePath(upperPoints),
    };
  });

  const tickIndexes = Array.from(
    new Set([
      0,
      Math.floor((rows.length - 1) * 0.33),
      Math.floor((rows.length - 1) * 0.66),
      rows.length - 1,
    ]),
  ).filter((index) => index >= 0 && index < rows.length);

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, max-content))",
          gap: 8,
          alignItems: "center",
        }}
      >
        {stackedLayers.map((layer) => (
          <div
            key={layer.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: TEXT_MUTED,
              fontSize: FONT_SIZE_UI,
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: layer.fill,
                display: "inline-block",
              }}
            />
            {layer.label}
          </div>
        ))}

        <div
          style={{
            color: TEXT_FAINT,
            fontSize: FONT_SIZE_UI,
          }}
        >
          Total qualified plays
        </div>
      </div>

      <div
        style={{
          border: PANEL_BORDER,
          borderRadius: 12,
          background: BG_INSET,
          padding: "10px 12px 6px",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
          role="img"
          aria-label={`Qualified plays over the selected ${props.range} range`}
        >
          {yTicks.map((tick) => (
            <g key={`${tick.value}:${tick.y}`}>
              <line
                x1={paddingLeft}
                y1={tick.y}
                x2={width - paddingRight}
                y2={tick.y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text
                x={paddingLeft - 8}
                y={tick.y + 3}
                textAnchor="end"
                fill={TEXT_FAINT}
                fontSize="10"
              >
                {formatNumber(tick.value)}
              </text>
            </g>
          ))}

          {stackedLayers.map((layer) => (
            <path
              key={`${layer.key}:fill`}
              d={layer.areaPath}
              fill={layer.fill}
              fillOpacity={0.72}
              stroke="none"
            />
          ))}

          {stackedLayers.map((layer) => (
            <path
              key={`${layer.key}:line`}
              d={layer.linePath}
              fill="none"
              stroke="rgba(255,255,255,0.78)"
              strokeWidth="1"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {tickIndexes.map((index) => (
            <text
              key={rows[index]?.bucketStart ?? index}
              x={xForIndex(index)}
              y={height - 8}
              textAnchor="middle"
              fill={TEXT_FAINT}
              fontSize="10"
            >
              {rows[index]
                ? fmtTrendTick(rows[index].bucketStart, props.range)
                : ""}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function AudienceSplitCard(props: { snapshot: PlaybackAdminSnapshot }) {
  const allTimeMember = props.snapshot.audienceSplit.allTimeMemberPlayCount;
  const allTimeAnonymous =
    props.snapshot.audienceSplit.allTimeAnonymousPlayCount;
  const recentMember = props.snapshot.audienceSplit.recent30dMemberPlayCount;
  const recentAnonymous =
    props.snapshot.audienceSplit.recent30dAnonymousPlayCount;

  const allTimeTotal = allTimeMember + allTimeAnonymous;
  const recentTotal = recentMember + recentAnonymous;

  const allTimeMemberPct = percentage(allTimeMember, allTimeTotal);
  const allTimeAnonPct = percentage(allTimeAnonymous, allTimeTotal);
  const recentMemberPct = percentage(recentMember, recentTotal);
  const recentAnonPct = percentage(recentAnonymous, recentTotal);

  const Row = (row: {
    label: string;
    member: number;
    anonymous: number;
    memberPct: number;
    anonymousPct: number;
  }) => (
    <div
      style={{
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          alignItems: "baseline",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            fontSize: FONT_SIZE_UI,
            color: TEXT_PRIMARY,
            fontWeight: 700,
          }}
        >
          {row.label}
        </div>
        <div
          style={{
            fontSize: FONT_SIZE_UI,
            color: TEXT_MUTED,
          }}
        >
          {formatNumber(row.member + row.anonymous)} total plays
        </div>
      </div>

      <div
        style={{
          height: 14,
          width: "100%",
          borderRadius: 999,
          overflow: "hidden",
          background: BG_ACCENT,
          display: "flex",
        }}
      >
        <div
          style={{
            width: `${row.memberPct}%`,
            background: BG_MEMBER,
          }}
        />
        <div
          style={{
            width: `${row.anonymousPct}%`,
            background: BG_ANON,
          }}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 10,
        }}
      >
        <div
          style={{
            border: PANEL_BORDER,
            borderRadius: 12,
            padding: "10px 12px",
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
            Members
          </div>
          <div
            style={{
              fontSize: 16,
              color: TEXT_PRIMARY,
              fontWeight: 800,
            }}
          >
            {formatNumber(row.member)}
          </div>
          <div
            style={{
              fontSize: FONT_SIZE_UI,
              color: TEXT_MUTED,
            }}
          >
            {row.memberPct.toFixed(1)}%
          </div>
        </div>

        <div
          style={{
            border: PANEL_BORDER,
            borderRadius: 12,
            padding: "10px 12px",
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
            Anonymous
          </div>
          <div
            style={{
              fontSize: 16,
              color: TEXT_PRIMARY,
              fontWeight: 800,
            }}
          >
            {formatNumber(row.anonymous)}
          </div>
          <div
            style={{
              fontSize: FONT_SIZE_UI,
              color: TEXT_MUTED,
            }}
          >
            {row.anonymousPct.toFixed(1)}%
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <SectionCard
      title="Qualified play audience split"
      subtitle="Signed-in and anonymous qualified plays shown as a provenance split for all-time activity and the last 30 days."
    >
      <div
        style={{
          display: "grid",
          gap: 14,
        }}
      >
        {Row({
          label: "All time",
          member: allTimeMember,
          anonymous: allTimeAnonymous,
          memberPct: allTimeMemberPct,
          anonymousPct: allTimeAnonPct,
        })}

        {Row({
          label: "Past 30 days",
          member: recentMember,
          anonymous: recentAnonymous,
          memberPct: recentMemberPct,
          anonymousPct: recentAnonPct,
        })}
      </div>
    </SectionCard>
  );
}

export default function PlaybackTelemetryDashboardClient(props: {
  embed: boolean;
  initialSnapshot: PlaybackAdminSnapshot;
}) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [trendRange, setTrendRange] = React.useState<TrendRangeKey>("day");
  const snapshot = props.initialSnapshot;

  React.useEffect(() => {
    if (!autoRefresh) return;

    const id = window.setInterval(() => {
      setRefreshing(true);
      router.refresh();
    }, 20_000);

    return () => window.clearInterval(id);
  }, [autoRefresh, router]);

  React.useEffect(() => {
    setRefreshing(false);
  }, [snapshot.generatedAt]);

  const selectedTrend = snapshot.qualifiedPlayTrends[trendRange];
  const recentPlayTotal = selectedTrend.buckets.reduce(
    (sum, row) => sum + row.sitePlayCount,
    0,
  );

  const headerActions = (
    <>
      <button
        type="button"
        onClick={() => {
          setRefreshing(true);
          router.refresh();
        }}
        style={{
          height: 30,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.04)",
          color: TEXT_PRIMARY,
          cursor: "pointer",
          fontSize: FONT_SIZE_UI,
          fontWeight: 700,
          opacity: refreshing ? 0.72 : 1,
        }}
      >
        {refreshing ? "Refreshing…" : "Refresh now"}
      </button>

      <button
        type="button"
        onClick={() => setAutoRefresh((value) => !value)}
        style={{
          height: 30,
          padding: "0 12px",
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: autoRefresh
            ? "rgba(255,255,255,0.10)"
            : "rgba(255,255,255,0.04)",
          color: TEXT_PRIMARY,
          cursor: "pointer",
          fontSize: FONT_SIZE_UI,
          fontWeight: 700,
          opacity: autoRefresh ? 1 : 0.82,
        }}
      >
        Auto-refresh: {autoRefresh ? "On" : "Off"}
      </button>
    </>
  );

  return (
    <AdminPageFrame
      embed={props.embed}
      maxWidth={1360}
      title="Playback telemetry"
      subtitle="Monitor site-wide listening aggregates, recent recording activity, audience provenance, and telemetry dedupe behaviour."
      headerActions={headerActions}
    >
      <div
        style={{
          display: "grid",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: FONT_SIZE_UI,
              lineHeight: 1.5,
              color: TEXT_MUTED,
            }}
          >
            Generated {formatAgo(snapshot.generatedAt)} · snapshot{" "}
            {fmtSnapshotStamp(snapshot.generatedAt)}
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <MetricPill
              label="Site plays · all time"
              value={formatNumber(snapshot.siteTotals.playCount)}
            />
            <MetricPill
              label="Site plays · 30d"
              value={formatNumber(snapshot.site30d.playCount)}
            />
            <MetricPill
              label={`Trend total · ${selectedTrend.label}`}
              value={formatNumber(recentPlayTotal)}
            />
          </div>
        </div>

        <SectionCard
          title="Qualified plays over time"
          subtitle="Stacked area layers show total qualified plays across the selected horizon, split between signed-in members and anonymous listeners. Each view now uses bucket sizes that match the named duration."
          headerRight={
            <TrendRangeToggle value={trendRange} onChange={setTrendRange} />
          }
        >
          <QualifiedPlayTrendChart
            rows={selectedTrend.buckets}
            range={trendRange}
          />
        </SectionCard>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 0.9fr)",
            alignItems: "start",
          }}
        >
          <SectionCard
            title="Listening aggregates"
            subtitle="All-time totals and past-30-days telemetry shown side by side. Recent listened time is derived from credited 15-second progress milestones."
          >
            <AggregateTable snapshot={snapshot} />
          </SectionCard>

          <AudienceSplitCard snapshot={snapshot} />
        </div>

        <div
          style={{
            display: "grid",
            gap: 16,
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignItems: "start",
          }}
        >
          <SectionCard
            title="Top tracks by listened time"
            subtitle="Ranked by cumulative listened milliseconds."
          >
            <TrackTable rows={snapshot.topTracksByListenedMs} />
          </SectionCard>

          <SectionCard
            title="Most recent track activity"
            subtitle="Latest recording-level activity ordered by most recent listening."
          >
            <TrackTable rows={snapshot.recentTracks} />
          </SectionCard>
        </div>

        <SectionCard
          title="Recent telemetry sessions"
          subtitle="Recent member and anonymous telemetry is rolled up by listener, track, and playback session so progress milestones read as a single session bar rather than many separate rows."
        >
          <DedupeTable rows={snapshot.recentDedupe} />
        </SectionCard>
      </div>
    </AdminPageFrame>
  );
}
