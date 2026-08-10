// web/app/home/modules/badges/BadgeCabinetItem.tsx
"use client";

import React from "react";
import type { BadgeCabinetItemModel } from "./badgeCabinetTypes";
import BadgeUnlockVisual from "./BadgeUnlockVisual";

type Props = Readonly<{
  item: BadgeCabinetItemModel;
  expanded: boolean;
  isNewlyUnlocked: boolean;
  isUnlocking: boolean;
  itemRef?: React.Ref<HTMLDivElement>;
}>;

function revealingClassName(
  baseClassName: string,
  revealingClassName: string,
  isMetaRevealing: boolean,
): string {
  return isMetaRevealing
    ? `${baseClassName} ${revealingClassName}`
    : baseClassName;
}

function BadgeVisual(
  props: Readonly<{
    item: BadgeCabinetItemModel;
    isNewlyUnlocked: boolean;
    isUnlocking: boolean;
  }>,
) {
  const { item, isNewlyUnlocked, isUnlocking } = props;
  const accessibleTitle = item.unlocked ? item.titleText : "Locked badge";

  return (
    <div
      role="img"
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
  );
}

function BadgeMetaQuestionMark(
  props: Readonly<{
    isMetaRevealing: boolean;
  }>,
) {
  const { isMetaRevealing } = props;

  return (
    <div
      className={revealingClassName(
        "portal-member-badge-question-mark",
        "portal-member-badge-question-mark--dissolving",
        isMetaRevealing,
      )}
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
  );
}

function UnlockedBadgeMeta(
  props: Readonly<{
    item: BadgeCabinetItemModel;
    isMetaRevealing: boolean;
  }>,
) {
  const { item, isMetaRevealing } = props;

  return (
    <div
      className={revealingClassName(
        "portal-member-badge-meta-revealed",
        "portal-member-badge-meta-revealed--revealing",
        isMetaRevealing,
      )}
    >
      <div
        className={revealingClassName(
          "portal-member-badge-title",
          "portal-member-badge-title--revealing",
          isMetaRevealing,
        )}
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
          className={revealingClassName(
            "portal-member-badge-description",
            "portal-member-badge-description--revealing",
            isMetaRevealing,
          )}
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
  );
}

function BadgeMeta(
  props: Readonly<{
    item: BadgeCabinetItemModel;
    isMetaRevealing: boolean;
  }>,
) {
  const { item, isMetaRevealing } = props;
  const showQuestionMark = !item.unlocked || isMetaRevealing;

  return (
    <div className="portal-member-badge-meta" aria-hidden="false">
      <div className="portal-member-badge-meta-inner">
        {showQuestionMark ? (
          <BadgeMetaQuestionMark isMetaRevealing={isMetaRevealing} />
        ) : null}

        {item.unlocked ? (
          <UnlockedBadgeMeta
            item={item}
            isMetaRevealing={isMetaRevealing}
          />
        ) : null}
      </div>
    </div>
  );
}

export default function BadgeCabinetItem(props: Props) {
  const { item, expanded, isNewlyUnlocked, isUnlocking, itemRef } = props;

  const isMetaRevealing =
    expanded && item.unlocked && (isUnlocking || isNewlyUnlocked);

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
      <BadgeVisual
        item={item}
        isNewlyUnlocked={isNewlyUnlocked}
        isUnlocking={isUnlocking}
      />

      {expanded ? (
        <BadgeMeta item={item} isMetaRevealing={isMetaRevealing} />
      ) : null}
    </div>
  );
}
