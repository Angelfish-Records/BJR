// web/app/admin/badges/_components/BadgeCatalogueSection.tsx
"use client";

import Image from "next/image";
import React from "react";
import {
  BG_INSET,
  FONT_SIZE_UI,
  PANEL_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
} from "../../playback/dashboard/playbackTelemetryDashboardStyles";
import type { BadgeDefinitionOption } from "../_lib/badgeDashboardTypes";
import { getBadgeCardBorder } from "../_lib/badgeDashboardUtils";

type Props = {
  badges: BadgeDefinitionOption[];
  selectedEntitlementKey: string;
  onSelectEntitlementKey: (entitlementKey: string) => void;
};

function FlagPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        height: 22,
        padding: "0 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.05)",
        color: TEXT_PRIMARY,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function BadgeCatalogueSection(props: Props) {
  const { badges, selectedEntitlementKey, onSelectEntitlementKey } = props;

  return (
    <section
      style={{
        border: PANEL_BORDER,
        borderRadius: 18,
        background: BG_INSET,
        padding: 16,
        display: "grid",
        gap: 14,
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
            Badge catalogue
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: FONT_SIZE_UI,
              lineHeight: 1.5,
              color: TEXT_MUTED,
              maxWidth: 760,
            }}
          >
            Browse active badge definitions and select one to preview or award.
          </p>
        </div>

        <div
          style={{
            fontSize: FONT_SIZE_UI,
            lineHeight: 1.5,
            color: TEXT_MUTED,
          }}
        >
          {badges.length.toLocaleString()} active badge
          {badges.length === 1 ? "" : "s"}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(auto-fill, minmax(120px, 120px))",
          justifyContent: "flex-start",
        }}
      >
        {badges.length === 0 ? (
          <div
            style={{
              minHeight: 132,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              display: "grid",
              placeItems: "center",
              padding: 16,
              fontSize: FONT_SIZE_UI,
              color: TEXT_MUTED,
            }}
          >
            No active badge definitions found.
          </div>
        ) : (
          badges.map((badge) => {
            const isSelected = badge.entitlementKey === selectedEntitlementKey;

            return (
              <button
                key={badge.entitlementKey}
                type="button"
                onClick={() => onSelectEntitlementKey(badge.entitlementKey)}
                title={badge.description || badge.title}
                style={{
                  appearance: "none",
                  width: 120,
                  minWidth: 120,
                  textAlign: "center",
                  color: "inherit",
                  cursor: "pointer",
                  border: getBadgeCardBorder(isSelected, badge.featured),
                  borderRadius: 16,
                  background: isSelected
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(255,255,255,0.035)",
                  padding: 10,
                  display: "grid",
                  gap: 8,
                  alignContent: "start",
                  justifyItems: "center",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(255,255,255,0.03) inset"
                    : "none",
                  transition:
                    "background 160ms ease, border-color 160ms ease, transform 160ms ease",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    gap: 4,
                    flexWrap: "wrap",
                    justifyContent: "center",
                    minHeight: 22,
                  }}
                >
                  {badge.featured ? <FlagPill>Featured</FlagPill> : null}
                  {badge.shareable ? <FlagPill>Shareable</FlagPill> : null}
                </div>

                {badge.imageUrl ? (
                  <div
                    style={{
                      position: "relative",
                      width: 72,
                      height: 72,
                      borderRadius: 999,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      boxShadow:
                        "inset 0 1px 0 rgba(255,255,255,0.05), 0 6px 18px rgba(0,0,0,0.18)",
                    }}
                  >
                    <Image
                      src={badge.imageUrl}
                      alt={badge.title}
                      fill
                      sizes="72px"
                      style={{
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                ) : (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 999,
                      border: "1px dashed rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.02)",
                      display: "grid",
                      placeItems: "center",
                      fontSize: 18,
                      color: TEXT_MUTED,
                    }}
                  >
                    ✦
                  </div>
                )}

                <div
                  style={{
                    display: "grid",
                    gap: 4,
                    width: "100%",
                    minWidth: 0,
                  }}
                >
                  <strong
                    style={{
                      lineHeight: 1.25,
                      fontSize: 12,
                      color: TEXT_PRIMARY,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {badge.title}
                  </strong>

                  <span
                    style={{
                      fontSize: 10,
                      lineHeight: 1.3,
                      color: TEXT_MUTED,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {badge.entitlementKey}
                  </span>

                  <span
                    style={{
                      fontSize: 10,
                      lineHeight: 1.3,
                      color: TEXT_MUTED,
                    }}
                  >
                    #{badge.displayOrder}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
