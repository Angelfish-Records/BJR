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

  return (
    <div
      ref={itemRef}
      className="portal-badge-unlock-host portal-member-badge-wrap portal-member-badge-shell"
      data-badge-key={item.key}
      data-badge-partition={item.partition}
      data-badge-expanded={expanded ? "true" : "false"}
      data-badge-newly-unlocked={isNewlyUnlocked ? "true" : "false"}
      style={{
        position: "relative",
        minWidth: 0,
      }}
    >
      <div tabIndex={0} title={item.titleText} aria-label={item.titleText}>
        <BadgeUnlockVisual
          imageUrl={item.imageUrl}
          label={item.label}
          unlocked={item.unlocked}
          isUnlocking={isUnlocking}
          isNewlyUnlocked={isNewlyUnlocked}
          variant="cabinet"
        />
      </div>

      <div className="portal-member-badge-meta" aria-hidden={!expanded}>
        <div className="portal-member-badge-meta-inner">
          <div
            style={{
              fontSize: expanded ? 13 : 12,
              lineHeight: 1.3,
              opacity: item.unlocked ? 0.92 : 0.7,
              overflowWrap: "anywhere",
            }}
          >
            {item.label}
          </div>

          {item.description ? (
            <div
              style={{
                marginTop: 4,
                fontSize: 11,
                lineHeight: 1.35,
                opacity: 0.58,
                overflowWrap: "anywhere",
              }}
            >
              {item.description}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}