// web/app/home/modules/badges/BadgeCabinetItem.tsx
"use client";

import React from "react";
import type { BadgeCabinetItemModel } from "./badgeCabinetTypes";
import BadgeUnlockVisual from "./BadgeUnlockVisual";

type Props = {
  item: BadgeCabinetItemModel;
  expanded: boolean;
  isNewlyUnlocked: boolean;
  isUnlocking: boolean;
  itemRef?: React.Ref<HTMLDivElement>;
};

export default function BadgeCabinetItem(props: Props) {
  const { item, expanded, isNewlyUnlocked, isUnlocking, itemRef } = props;

  const isMetaRevealing =
    expanded && item.unlocked && (isUnlocking || isNewlyUnlocked);
  const accessibleTitle = item.unlocked ? item.titleText : "Locked badge";
  const shouldRenderMeta = expanded;

  return (
    <div
      ref={itemRef}
      className="portal-badge-unlock-host portal-member-badge-wrap portal-member-badge-shell"
      data-badge-key={item.key}
      data-badge-partition={item.partition}
      data-badge-expanded={expanded ? "true" : "false"}
      data-badge-newly-unlocked={isNewlyUnlocked ? "true" : "false"}
      data-badge-unlocked={item.unlocked ? "true" : "false"}
      data-badge-meta-revealing={isMetaRevealing ? "true" : "false"}
      style={{
        position: "relative",
        minWidth: 0,
      }}
    >
      <div
        tabIndex={0}
        aria-label={accessibleTitle}
        className="portal-member-badge-visual"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: "1 / 1",
          overflow: "visible",
          outline: "none",
          perspective: "900px",
          perspectiveOrigin: "50% 50%",
        }}
      >
        <BadgeUnlockVisual
          imageUrl={item.imageUrl}
          label={item.label}
          unlocked={item.unlocked}
          isUnlocking={isUnlocking}
          isNewlyUnlocked={isNewlyUnlocked}
          variant="cabinet"
        />
      </div>

      {shouldRenderMeta ? (
        <div className="portal-member-badge-meta" aria-hidden="false">
          <div className="portal-member-badge-meta-inner">
            {(!item.unlocked || isMetaRevealing) && (
              <div
                className={
                  isMetaRevealing
                    ? "portal-member-badge-question-mark portal-member-badge-question-mark--dissolving"
                    : "portal-member-badge-question-mark"
                }
                aria-hidden="true"
                style={{
                  fontSize: 10,
                  lineHeight: 1.1,
                  letterSpacing: 0.12,
                  opacity: 0.3,
                  fontWeight: 400,
                  textAlign: "center",
                }}
              >
                —
              </div>
            )}

            {item.unlocked ? (
              <div
                className={
                  isMetaRevealing
                    ? "portal-member-badge-meta-revealed portal-member-badge-meta-revealed--revealing"
                    : "portal-member-badge-meta-revealed"
                }
              >
                <div
                  className={
                    isMetaRevealing
                      ? "portal-member-badge-title portal-member-badge-title--revealing"
                      : "portal-member-badge-title"
                  }
                  style={{
                    fontSize: 10,
                    letterSpacing: 0.7,
                    textTransform: "uppercase",
                    lineHeight: 1.2,
                    fontWeight: 950,
                    opacity: 0.7,
                    overflowWrap: "anywhere",
                  }}
                >
                  {item.label}
                </div>

                {item.description ? (
                  <div
                    className={
                      isMetaRevealing
                        ? "portal-member-badge-description portal-member-badge-description--revealing"
                        : "portal-member-badge-description"
                    }
                    style={{
                      marginTop: 4,
                      fontSize: 9,
                      lineHeight: 1.2,
                      opacity: 0.58,
                      overflowWrap: "anywhere",
                    }}
                  >
                    {item.description}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
