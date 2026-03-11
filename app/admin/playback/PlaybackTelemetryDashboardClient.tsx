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

function fmtDayTick(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-NZ", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return iso;
  }
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
type TrendDay = PlaybackAdminSnapshot["qualifiedPlayTrend30d"][number];

type DedupeRow = DedupeRowBase & {
  recordingTitle?: string | null;
  trackTitle?: string | null;
  memberEmail?: string | null;
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

function resolveDedupeTrackLabel(row: DedupeRow): string {
  return (
    row.recordingTitle ??
    row.trackTitle ??
    `session ${ellipsisMiddle(row.playbackId, 10)}`
  );
}

function resolveDedupeIdentityLabel(row: DedupeRow): string {
  if (row.audience === "anonymous") return "Anonymous";
  if (row.memberEmail) return row.memberEmail;
  if (row.memberId) return ellipsisMiddle(row.memberId, 8);
  return "Member";
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
  const rows = props.rows as DedupeRow[];

  return (
    <TableShell>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 980,
        }}
      >
        <thead>
          <tr>
            {["When", "Event", "Milestone", "Track / Session", "Audience"].map(
              (label) => (
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
              ),
            )}
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

          {rows.map((row) => (
            <tr
              key={`${row.memberId ?? "anon"}:${row.playbackId}:${row.eventType}:${row.milestoneKey}:${row.createdAt}`}
            >
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_MUTED,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                {formatAgo(row.createdAt)}
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_PRIMARY,
                  fontSize: FONT_SIZE_DEDUPE,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {row.eventType}
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_MUTED,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                {row.milestoneKey}
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_DEDUPE,
                  maxWidth: 280,
                }}
              >
                {resolveDedupeTrackLabel(row)}
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_DEDUPE,
                  whiteSpace: "nowrap",
                }}
              >
                <AudienceBadge audience={row.audience} />
              </td>
              <td
                style={{
                  padding: "8px 10px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_DEDUPE,
                  maxWidth: 280,
                  fontFamily:
                    row.memberEmail == null && row.memberId != null
                      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
                      : undefined,
                }}
              >
                {resolveDedupeIdentityLabel(row)}
              </td>
            </tr>
          ))}
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

function QualifiedPlayTrendChart(props: { rows: TrendDay[] }) {
  const rows = props.rows;
  const height = 180;
  const width = 920;
  const paddingTop = 12;
  const paddingBottom = 28;
  const chartHeight = height - paddingTop - paddingBottom;
  const barGap = 6;
  const barWidth = Math.max(
    6,
    Math.floor((width - (rows.length - 1) * barGap) / rows.length),
  );
  const maxCount = Math.max(1, ...rows.map((row) => row.sitePlayCount));

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
        <div
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
              background: BG_MEMBER,
              display: "inline-block",
            }}
          />
          Member plays
        </div>
        <div
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
              background: BG_ANON,
              display: "inline-block",
            }}
          />
          Anonymous plays
        </div>
        <div
          style={{
            color: TEXT_FAINT,
            fontSize: FONT_SIZE_UI,
          }}
        >
          Last 30 days
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
          aria-label="Qualified plays over the last 30 days"
        >
          {[0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = paddingTop + chartHeight - chartHeight * ratio;
            return (
              <line
                key={ratio}
                x1={0}
                y1={y}
                x2={width}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
            );
          })}

          {rows.map((row, index) => {
            const x = index * (barWidth + barGap);
            const memberHeight =
              maxCount > 0 ? (row.memberPlayCount / maxCount) * chartHeight : 0;
            const anonymousHeight =
              maxCount > 0
                ? (row.anonymousPlayCount / maxCount) * chartHeight
                : 0;

            const anonY = paddingTop + chartHeight - anonymousHeight;
            const memberY = anonY - memberHeight;

            const isFirst = index === 0;
            const isMiddle = index === Math.floor(rows.length / 2);
            const isLast = index === rows.length - 1;
            const showTick = isFirst || isMiddle || isLast;

            return (
              <g key={row.date}>
                {row.anonymousPlayCount > 0 ? (
                  <rect
                    x={x}
                    y={anonY}
                    width={barWidth}
                    height={anonymousHeight}
                    rx={3}
                    ry={3}
                    fill={BG_ANON}
                  />
                ) : null}

                {row.memberPlayCount > 0 ? (
                  <rect
                    x={x}
                    y={memberY}
                    width={barWidth}
                    height={memberHeight}
                    rx={3}
                    ry={3}
                    fill={BG_MEMBER}
                  />
                ) : null}

                {showTick ? (
                  <text
                    x={x + barWidth / 2}
                    y={height - 8}
                    textAnchor="middle"
                    fill={TEXT_FAINT}
                    fontSize="10"
                  >
                    {fmtDayTick(row.date)}
                  </text>
                ) : null}
              </g>
            );
          })}
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

  const recentPlayTotal = snapshot.qualifiedPlayTrend30d.reduce(
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
              label="Trend total · 30d"
              value={formatNumber(recentPlayTotal)}
            />
          </div>
        </div>

        <SectionCard
          title="Qualified plays over time"
          subtitle="Stacked daily bars show the last 30 days of qualified play activity, split between signed-in members and anonymous listeners."
        >
          <QualifiedPlayTrendChart rows={snapshot.qualifiedPlayTrend30d} />
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
          title="Recent telemetry dedupe rows"
          subtitle="Recent member and anonymous dedupe decisions recorded for playback milestone events."
        >
          <DedupeTable rows={snapshot.recentDedupe} />
        </SectionCard>
      </div>
    </AdminPageFrame>
  );
}
