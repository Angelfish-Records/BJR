// web/app/admin/playback/dashboard/QualifiedPlayTrendChart.tsx
"use client";

import React from "react";
import type { ChartPoint, TrendBucket, TrendRangeKey } from "./types";
import {
  BG_INSET,
  FONT_SIZE_UI,
  PANEL_BORDER,
  TEXT_FAINT,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "./playbackTelemetryDashboardStyles";
import {
  fmtTrendTick,
  formatNumber,
} from "./playbackTelemetryDashboardFormatters";

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

type HoverZone = {
  index: number;
  x: number;
  left: number;
  width: number;
};

type LayerDescriptor = {
  key: string;
  label: string;
  fill: string;
  values: number[];
};

type StackedLayer = {
  key: string;
  label: string;
  fill: string;
  lowerPoints: ChartPoint[];
  upperPoints: ChartPoint[];
  areaPath: string;
  linePath: string;
};

export function QualifiedPlayTrendChart(props: {
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

  const [activeIndex, setActiveIndex] = React.useState<number | null>(null);

  const series: LayerDescriptor[] = [
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
  ];

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

  const stackedLayers: StackedLayer[] = series.map((layer, layerIndex) => {
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

  const hoverZones: HoverZone[] = rows.map((_, index) => {
    const x = xForIndex(index);
    const prevX = index > 0 ? xForIndex(index - 1) : x;
    const nextX = index < rows.length - 1 ? xForIndex(index + 1) : x;

    const left = index === 0 ? paddingLeft : x - (x - prevX) / 2;

    const right =
      index === rows.length - 1 ? width - paddingRight : x + (nextX - x) / 2;

    return {
      index,
      x,
      left,
      width: Math.max(1, right - left),
    };
  });

  const activeRow =
    activeIndex !== null && activeIndex >= 0 && activeIndex < rows.length
      ? rows[activeIndex]
      : null;

  const activeZone =
    activeIndex !== null && activeIndex >= 0 && activeIndex < hoverZones.length
      ? hoverZones[activeIndex]
      : null;

  const tooltipItems =
    activeRow === null
      ? []
      : [
          {
            key: "total",
            label: "Total plays",
            value: activeRow.sitePlayCount,
            swatch: "rgba(255,255,255,0.9)",
          },
          ...series.map((layer) => ({
            key: layer.key,
            label: layer.label,
            value: layer.values[activeIndex ?? 0] ?? 0,
            swatch: layer.fill,
          })),
        ];

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
      }}
    >
      <div
        style={{
          position: "relative",
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

          {activeZone ? (
            <rect
              x={activeZone.left}
              y={paddingTop}
              width={activeZone.width}
              height={innerHeight}
              fill="rgba(255,255,255,0.035)"
            />
          ) : null}

          {stackedLayers.map((layer) => (
            <path
              key={`${layer.key}:fill`}
              d={layer.areaPath}
              fill={layer.fill}
              fillOpacity={activeIndex === null ? 0.72 : 0.56}
              stroke="none"
            />
          ))}

          {stackedLayers.map((layer) => (
            <path
              key={`${layer.key}:line`}
              d={layer.linePath}
              fill="none"
              stroke="rgba(255,255,255,0.78)"
              strokeWidth={activeIndex === null ? "1" : "1.15"}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={activeIndex === null ? 1 : 0.88}
            />
          ))}

          {activeZone ? (
            <line
              x1={activeZone.x}
              y1={paddingTop}
              x2={activeZone.x}
              y2={paddingTop + innerHeight}
              stroke="rgba(255,255,255,0.22)"
              strokeWidth="1"
              strokeDasharray="3 4"
            />
          ) : null}

          {activeIndex !== null
            ? stackedLayers.map((layer) => {
                const point = layer.upperPoints[activeIndex];
                if (!point) return null;

                return (
                  <g key={`${layer.key}:marker`}>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="4"
                      fill="rgba(10,10,14,0.96)"
                    />
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r="2.5"
                      fill="rgba(255,255,255,0.92)"
                    />
                  </g>
                );
              })
            : null}

          {tickIndexes.map((index) => (
            <text
              key={rows[index]?.bucketStart ?? index}
              x={xForIndex(index)}
              y={height - 8}
              textAnchor="middle"
              fill={TEXT_FAINT}
              fontSize="8"
            >
              {rows[index]
                ? fmtTrendTick(rows[index].bucketStart, props.range)
                : ""}
            </text>
          ))}

          {hoverZones.map((zone) => {
            const row = rows[zone.index];
            const label = row
              ? fmtTrendTick(row.bucketStart, props.range)
              : "Trend bucket";

            return (
              <rect
                key={`hover:${zone.index}`}
                x={zone.left}
                y={paddingTop}
                width={zone.width}
                height={innerHeight}
                fill="transparent"
                tabIndex={0}
                aria-label={`${label}. ${row ? formatNumber(row.sitePlayCount) : 0} total plays.`}
                onMouseEnter={() => setActiveIndex(zone.index)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(zone.index)}
                onBlur={() => setActiveIndex(null)}
              />
            );
          })}
        </svg>

        {activeRow && activeZone ? (
          <div
            style={{
              position: "absolute",
              left: `${(activeZone.x / width) * 100}%`,
              top: 14,
              transform:
                activeZone.x > width * 0.72
                  ? "translateX(calc(-100% - 10px))"
                  : "translateX(10px)",
              pointerEvents: "none",
              zIndex: 2,
              minWidth: 170,
              maxWidth: 220,
              border: PANEL_BORDER,
              borderRadius: 12,
              background: "rgba(12,12,16,0.94)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.28)",
              padding: "10px 12px",
              display: "grid",
              gap: 8,
              backdropFilter: "blur(10px)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: TEXT_PRIMARY,
                lineHeight: 1.3,
              }}
            >
              {fmtTrendTick(activeRow.bucketStart, props.range)}
            </div>

            <div
              style={{
                display: "grid",
                gap: 6,
              }}
            >
              {tooltipItems.map((item) => (
                <div
                  key={item.key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto",
                    alignItems: "center",
                    gap: 8,
                    fontSize: FONT_SIZE_UI,
                    color: TEXT_MUTED,
                  }}
                >
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 999,
                      background: item.swatch,
                      display: "inline-block",
                    }}
                  />
                  <span>{item.label}</span>
                  <span
                    style={{
                      color: TEXT_PRIMARY,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {formatNumber(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, max-content))",
          gap: 8,
          alignItems: "center",
        }}
      >
        {[
          {
            key: "total",
            label: "Total plays",
            fill: "rgba(255,255,255,0.9)",
          },
          ...stackedLayers.map((layer) => ({
            key: layer.key,
            label: layer.label,
            fill: layer.fill,
          })),
        ].map((layer) => (
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
      </div>
    </div>
  );
}
