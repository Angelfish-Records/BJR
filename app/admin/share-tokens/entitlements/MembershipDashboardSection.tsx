"use client";

import React from "react";

import {
  buildJoinChart,
  buildTierCountMap,
  DASHBOARD_RANGE_OPTIONS,
  formatDateTime,
  getDashboardRangeDescription,
} from "./model";
import { cardStyle, subtleButtonStyle } from "./styles";
import type { DashboardStats, MemberRow } from "./types";

type Props = Readonly<{
  dashboard: DashboardStats | null;
  periodDays: number;
  selectedId: string | null;
  busy: boolean;
  onPeriodChange: (periodDays: number) => void;
  onSelectMember: (member: MemberRow) => Promise<void>;
}>;

function MembershipMetricCard(
  props: Readonly<{
    label: string;
    value: number | string;
  }>,
) {
  return (
    <div
      style={{
        padding: "12px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.58 }}>{props.label}</div>
      <div style={{ marginTop: 6, fontSize: 22, fontWeight: 800 }}>
        {props.value}
      </div>
    </div>
  );
}

function JoinSummary(
  props: Readonly<{
    joinedInPeriod: number | string;
    peakDay: number;
  }>,
) {
  const items = [
    { label: "New in range", value: props.joinedInPeriod },
    { label: "Peak day", value: props.peakDay },
  ];

  return (
    <div
      style={{
        display: "flex",
        gap: 28,
        flexWrap: "wrap",
        marginBottom: 12,
      }}
    >
      {items.map((item) => (
        <div key={item.label}>
          <div style={{ fontSize: 11, opacity: 0.56 }}>{item.label}</div>
          <div style={{ marginTop: 4, fontSize: 20, fontWeight: 800 }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function LatestMembers(
  props: Readonly<{
    members: MemberRow[];
    selectedId: string | null;
    onSelectMember: (member: MemberRow) => Promise<void>;
  }>,
) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.72 }}>
        Latest members
      </div>
      <div style={{ marginTop: 4, fontSize: 11, opacity: 0.5 }}>
        Newest first
      </div>

      <div
        style={{
          marginTop: 10,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {props.members.length > 0 ? (
          props.members.map((member) => {
            const isSelected = props.selectedId === member.id;

            return (
              <button
                key={member.id}
                type="button"
                onClick={() => {
                  void props.onSelectMember(member);
                }}
                title="Open member access details"
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto",
                  gap: 14,
                  alignItems: "center",
                  padding: "10px 0",
                  border: 0,
                  borderBottom: "1px solid rgba(255,255,255,0.08)",
                  background: isSelected
                    ? "rgba(255,255,255,0.07)"
                    : "transparent",
                  color: "rgba(255,255,255,0.92)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {member.email}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    opacity: 0.5,
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDateTime(member.created_at)}
                </span>
              </button>
            );
          })
        ) : (
          <div style={{ padding: "12px 0", fontSize: 12, opacity: 0.58 }}>
            No members yet.
          </div>
        )}
      </div>
    </div>
  );
}

export function MembershipDashboardSection(props: Props) {
  const tierCountMap = React.useMemo(
    () => buildTierCountMap(props.dashboard?.tiers),
    [props.dashboard?.tiers],
  );
  const joinsChart = React.useMemo(
    () => buildJoinChart(props.dashboard?.recentJoins),
    [props.dashboard?.recentJoins],
  );

  const metrics = [
    {
      label: "Friend",
      value: tierCountMap.get("tier_friend") ?? 0,
    },
    {
      label: "Patron",
      value: tierCountMap.get("tier_patron") ?? 0,
    },
    {
      label: "Partner",
      value: tierCountMap.get("tier_partner") ?? 0,
    },
    {
      label: "Linked Clerk",
      value: props.dashboard?.totals.linkedClerk ?? "—",
    },
    {
      label: "Linked Stripe",
      value: props.dashboard?.totals.linkedStripe ?? "—",
    },
  ];

  const firstDate = joinsChart.points[0]?.date ?? "—";
  const lastDate = joinsChart.points[joinsChart.points.length - 1]?.date ?? "—";

  return (
    <div style={cardStyle}>
      <div
        style={{
          fontSize: 12,
          letterSpacing: "0.04em",
          opacity: 0.56,
        }}
      >
        MEMBERSHIP DASHBOARD
      </div>

      <div
        style={{
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
          alignItems: "flex-start",
          marginTop: 16,
        }}
      >
        <div style={{ flex: "0.9 1 360px", minWidth: 0 }}>
          <LatestMembers
            members={props.dashboard?.latestMembers ?? []}
            selectedId={props.selectedId}
            onSelectMember={props.onSelectMember}
          />
        </div>

        <div style={{ flex: "2.1 1 760px", minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>
            Membership overview
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 10,
              marginTop: 14,
            }}
          >
            <div
              style={{
                padding: "14px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.16)",
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.12), rgba(255,255,255,0.05))",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            >
              <div style={{ fontSize: 11, opacity: 0.66 }}>Total members</div>
              <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
                {props.dashboard?.totals.members ?? "—"}
              </div>
            </div>

            {metrics.map((item) => (
              <MembershipMetricCard
                key={item.label}
                label={item.label}
                value={item.value}
              />
            ))}
          </div>

          <div
            style={{
              marginTop: 20,
              paddingTop: 16,
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    opacity: 0.72,
                  }}
                >
                  Membership joins
                </div>
                <div style={{ marginTop: 4, fontSize: 11, opacity: 0.56 }}>
                  {getDashboardRangeDescription(props.periodDays)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DASHBOARD_RANGE_OPTIONS.map((option) => {
                  const active = props.periodDays === option.value;
                  const inactiveBusy = props.busy && !active;

                  return (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => props.onPeriodChange(option.value)}
                      disabled={props.busy}
                      style={{
                        ...subtleButtonStyle,
                        background: active
                          ? "rgba(255,255,255,0.12)"
                          : "rgba(255,255,255,0.04)",
                        opacity: inactiveBusy ? 0.7 : 1,
                        cursor: props.busy ? "default" : "pointer",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              {joinsChart.points.length > 0 ? (
                <>
                  <JoinSummary
                    joinedInPeriod={
                      props.dashboard?.totals.joinedInPeriod ?? "—"
                    }
                    peakDay={joinsChart.maxCount}
                  />

                  <div style={{ width: "100%", height: 220 }}>
                    <svg
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "block",
                      }}
                      role="img"
                      aria-labelledby="membership-joins-chart-title"
                    >
                      <title id="membership-joins-chart-title">
                        Membership joins chart
                      </title>
                      <path
                        d={joinsChart.areaPath}
                        fill="rgba(255,255,255,0.10)"
                      />
                      <path
                        d={joinsChart.path}
                        fill="none"
                        stroke="rgba(255,255,255,0.88)"
                        strokeWidth="1.8"
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      marginTop: 8,
                      fontSize: 11,
                      opacity: 0.56,
                    }}
                  >
                    <span>{firstDate}</span>
                    <span>{lastDate}</span>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 12, opacity: 0.58 }}>
                  No membership join data available for this range.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
