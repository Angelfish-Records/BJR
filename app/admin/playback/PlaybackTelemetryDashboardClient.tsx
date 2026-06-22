// web/app/admin/playback/PlaybackTelemetryDashboardClient.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { PlaybackAdminSnapshot } from "@/lib/playbackAdmin";
import AdminPageFrame from "../AdminPageFrame";
import { AudienceSplitCard } from "./dashboard/AudienceSplitCard";
import { DedupeTable } from "./dashboard/DedupeTable";
import {
  MetricPill,
  SectionCard,
  TrendRangeToggle,
} from "./dashboard/PlaybackDashboardPrimitives";
import { QualifiedPlayTrendChart } from "./dashboard/QualifiedPlayTrendChart";
import { TrackTable } from "./dashboard/TrackTable";
import { ShareLinkActivityTable } from "./dashboard/ShareLinkActivityTable";
import {
  FONT_SIZE_UI,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "./dashboard/playbackTelemetryDashboardStyles";
import {
  formatAgo,
  formatNumber,
  fmtSnapshotStamp,
} from "./dashboard/playbackTelemetryDashboardFormatters";
import type { TrendRangeKey } from "./dashboard/types";

export default function PlaybackTelemetryDashboardClient(props: {
  embed: boolean;
  initialSnapshot: PlaybackAdminSnapshot;
}) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [trendRange, setTrendRange] = React.useState<TrendRangeKey>("day");

  const snapshot = props.initialSnapshot;
  const selectedTrend = snapshot.qualifiedPlayTrends[trendRange];
  const recentPlayTotal = selectedTrend.buckets.reduce(
    (sum, row) => sum + row.sitePlayCount,
    0,
  );

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
      maxWidth={1360}
      title="Playback telemetry"
      subtitle="Monitor site-wide qualified play trends, audience provenance, top tracks by listened time, and telemetry dedupe behaviour."
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
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <MetricPill
              label="Plays · all time"
              value={formatNumber(snapshot.siteTotals.playCount)}
            />
            <MetricPill
              label="Plays · 30d"
              value={formatNumber(snapshot.site30d.playCount)}
            />
            <MetricPill
              label={`Plays · ${selectedTrend.label}`}
              value={formatNumber(recentPlayTotal)}
            />
          </div>

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
        </div>

        <SectionCard
          title="Qualified plays over time"
          subtitle=""
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
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            alignItems: "stretch",
          }}
        >
          <AudienceSplitCard snapshot={snapshot} />

          <SectionCard title="Top tracks by listened time" subtitle="">
            <TrackTable rows={snapshot.topTracksByListenedMs} />
          </SectionCard>
        </div>

        <SectionCard
          title="Share-link activity"
          subtitle="Playback attributed to currently valid labelled share links. This identifies the link used, not a verified individual listener."
        >
          <ShareLinkActivityTable rows={snapshot.shareLinkActivity} />
        </SectionCard>

        <SectionCard title="Recent telemetry sessions" subtitle="">
          <DedupeTable rows={snapshot.recentDedupe} />
        </SectionCard>
      </div>
    </AdminPageFrame>
  );
}
