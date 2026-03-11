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

type TrackRow = PlaybackAdminSnapshot["topTracksByListenedMs"][number];
type DedupeRowBase = PlaybackAdminSnapshot["recentDedupe"][number];

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
const FONT_SIZE_UI = 12;
const FONT_SIZE_DEDUPE = 11;

function SectionCard(props: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: PANEL_BORDER,
        borderRadius: 14,
        padding: 14,
        background: "rgba(255,255,255,0.04)",
        display: "grid",
        gap: 12,
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
            }}
          >
            {props.subtitle}
          </div>
        ) : null}
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
        background: "rgba(255,255,255,0.02)",
      }}
    >
      {props.children}
    </div>
  );
}

function AggregateTable(props: { snapshot: PlaybackAdminSnapshot }) {
  const rows = [
    {
      label: "Active",
      members: formatNumber(props.snapshot.memberTotals.activeCount),
      site: formatNumber(props.snapshot.siteTotals.activeCount),
    },
    {
      label: "Hours listened",
      members: formatHoursFromMs(props.snapshot.memberTotals.listenedMs),
      site: formatHoursFromMs(props.snapshot.siteTotals.listenedMs),
    },
    {
      label: "Minutes listened",
      members: formatMinutesFromMs(props.snapshot.memberTotals.listenedMs),
      site: formatMinutesFromMs(props.snapshot.siteTotals.listenedMs),
    },
    {
      label: "Qualified plays",
      members: formatNumber(props.snapshot.memberTotals.playCount),
      site: formatNumber(props.snapshot.siteTotals.playCount),
    },
    {
      label: "90% completes",
      members: formatNumber(props.snapshot.memberTotals.completedCount),
      site: formatNumber(props.snapshot.siteTotals.completedCount),
    },
  ];

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
            {["Category", "Members only", "Site-wide"].map((label) => (
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
          {rows.map((row) => (
            <tr key={row.label}>
              <td
                style={{
                  padding: "10px 14px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_PRIMARY,
                  fontSize: FONT_SIZE_UI,
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                {row.label}
              </td>
              <td
                style={{
                  padding: "10px 14px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_UI,
                  whiteSpace: "nowrap",
                }}
              >
                {row.members}
              </td>
              <td
                style={{
                  padding: "10px 14px",
                  borderBottom: ROW_BORDER,
                  color: TEXT_STRONG,
                  fontSize: FONT_SIZE_UI,
                  whiteSpace: "nowrap",
                }}
              >
                {row.site}
              </td>
            </tr>
          ))}
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
    row.recordingTitle ?? row.trackTitle ?? ellipsisMiddle(row.playbackId, 10)
  );
}

function resolveDedupeMemberLabel(row: DedupeRow): string {
  if (row.memberEmail) return row.memberEmail;
  if (row.memberId) return ellipsisMiddle(row.memberId, 8);
  return "Anonymous";
}

function DedupeTable(props: { rows: PlaybackAdminSnapshot["recentDedupe"] }) {
  const rows = props.rows as DedupeRow[];

  return (
    <TableShell>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: 900,
        }}
      >
        <thead>
          <tr>
            {["When", "Event", "Milestone", "Playback", "Audience"].map(
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
                colSpan={5}
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
                  maxWidth: 280,
                  fontFamily:
                    row.memberEmail == null && row.memberId != null
                      ? 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
                      : undefined,
                }}
              >
                {resolveDedupeMemberLabel(row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableShell>
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
      maxWidth={1320}
      title="Playback telemetry"
      subtitle="Monitor site-wide listening aggregates, recent recording activity, and telemetry dedupe behaviour."
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
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
            color: TEXT_MUTED,
          }}
        >
          Generated {formatAgo(snapshot.generatedAt)} · snapshot{" "}
          {fmtSnapshotStamp(snapshot.generatedAt)}
        </div>

        <SectionCard
          title="Listening aggregates"
          subtitle="Members-only and site-wide roll-up totals shown side by side."
        >
          <AggregateTable snapshot={snapshot} />
        </SectionCard>

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
          subtitle="Recent dedupe decisions recorded for playback milestone events."
        >
          <DedupeTable rows={snapshot.recentDedupe} />
        </SectionCard>
      </div>
    </AdminPageFrame>
  );
}
