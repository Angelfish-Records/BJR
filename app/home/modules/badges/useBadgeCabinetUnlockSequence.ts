// web/app/home/modules/badges/useBadgeCabinetUnlockSequence.ts
"use client";

import React from "react";
import { flushSync } from "react-dom";
import type { BadgeCabinetItemModel } from "./badgeCabinetTypes";

const UNLOCK_REVEAL_MS = 1680;
const DEFAULT_FLIP_DURATION_MS = 420;
const UNLOCK_FLIP_DURATION_MS = 1320;
const UNLOCK_SETTLE_MS = 640;

function sortBadgeCabinetItems(
  items: BadgeCabinetItemModel[],
): BadgeCabinetItemModel[] {
  const nextItems = [...items];

  nextItems.sort((a, b) => {
    if (a.partition !== b.partition) {
      return a.partition === "unlocked" ? -1 : 1;
    }

    if (a.editorialOrder !== b.editorialOrder) {
      return a.editorialOrder - b.editorialOrder;
    }

    return a.label.localeCompare(b.label);
  });

  return nextItems;
}

function buildStagedUnlockItems(
  items: BadgeCabinetItemModel[],
  previousStableItems: BadgeCabinetItemModel[],
  unlockKeys: Set<string>,
): BadgeCabinetItemModel[] {
  if (unlockKeys.size === 0) return items;

  const previousByKey = new Map(previousStableItems.map((item) => [item.key, item]));

  const stagedItems = items.map((item) => {
    if (!unlockKeys.has(item.key)) return item;

    const previousItem = previousByKey.get(item.key);
    if (!previousItem) return item;

    return {
      ...item,
      partition: previousItem.partition,
    };
  });

  return sortBadgeCabinetItems(stagedItems);
}

type Options = {
  items: BadgeCabinetItemModel[];
};

type Result = {
  displayItems: BadgeCabinetItemModel[];
  newlyUnlockedKeys: Set<string>;
  pendingUnlockKeys: Set<string>;
  unlockPhase: "idle" | "reveal" | "move";
  liveAnnouncement: string;
  isFlipSuspended: boolean;
  flipDurationMs: number;
  flipBaselineToken: number;
  resetUnlockSequence: () => void;
};

export function useBadgeCabinetUnlockSequence(options: Options): Result {
  const { items } = options;

  const previousUnlockedKeysRef = React.useRef<Set<string> | null>(null);
  const previousStableItemsRef = React.useRef<BadgeCabinetItemModel[]>(items);

  const unlockReleaseTimeoutRef = React.useRef<number | null>(null);
  const unlockCleanupTimeoutRef = React.useRef<number | null>(null);
  const unlockReleaseRafRef = React.useRef<number | null>(null);
  const unlockReleasePaintRafRef = React.useRef<number | null>(null);

  const [newlyUnlockedKeys, setNewlyUnlockedKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [pendingUnlockKeys, setPendingUnlockKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [unlockPhase, setUnlockPhase] = React.useState<"idle" | "reveal" | "move">(
    "idle",
  );
  const [displayItemsOverride, setDisplayItemsOverride] =
    React.useState<BadgeCabinetItemModel[] | null>(null);
  const [isFlipSuspended, setIsFlipSuspended] = React.useState(false);
  const [flipDurationMs, setFlipDurationMs] = React.useState(
    DEFAULT_FLIP_DURATION_MS,
  );
  const [flipBaselineToken, setFlipBaselineToken] = React.useState(0);
  const [liveAnnouncement, setLiveAnnouncement] = React.useState("");

  const clearSequenceTimers = React.useCallback(() => {
    if (unlockReleaseTimeoutRef.current !== null) {
      window.clearTimeout(unlockReleaseTimeoutRef.current);
      unlockReleaseTimeoutRef.current = null;
    }

    if (unlockCleanupTimeoutRef.current !== null) {
      window.clearTimeout(unlockCleanupTimeoutRef.current);
      unlockCleanupTimeoutRef.current = null;
    }

    if (unlockReleaseRafRef.current !== null) {
      window.cancelAnimationFrame(unlockReleaseRafRef.current);
      unlockReleaseRafRef.current = null;
    }

    if (unlockReleasePaintRafRef.current !== null) {
      window.cancelAnimationFrame(unlockReleasePaintRafRef.current);
      unlockReleasePaintRafRef.current = null;
    }
  }, []);

  const resetUnlockSequence = React.useCallback(() => {
    clearSequenceTimers();
    setNewlyUnlockedKeys(new Set());
    setPendingUnlockKeys(new Set());
    setUnlockPhase("idle");
    setDisplayItemsOverride(null);
    setIsFlipSuspended(false);
    setFlipDurationMs(DEFAULT_FLIP_DURATION_MS);
    setLiveAnnouncement("");
  }, [clearSequenceTimers]);

  React.useEffect(() => {
    return () => {
      clearSequenceTimers();
    };
  }, [clearSequenceTimers]);

  React.useEffect(() => {
    if (displayItemsOverride !== null) return;
    if (unlockPhase !== "idle") return;
    previousStableItemsRef.current = items;
  }, [displayItemsOverride, items, unlockPhase]);

  React.useLayoutEffect(() => {
    const nextUnlockedKeys = new Set(
      items.filter((item) => item.unlocked).map((item) => item.key),
    );

    const previousUnlockedKeys = previousUnlockedKeysRef.current;
    const freshUnlocks = previousUnlockedKeys
      ? items.filter(
          (item) => item.unlocked && !previousUnlockedKeys.has(item.key),
        )
      : [];

    previousUnlockedKeysRef.current = nextUnlockedKeys;

    if (freshUnlocks.length === 0) {
      return;
    }

    clearSequenceTimers();

    const freshUnlockKeySet = new Set(freshUnlocks.map((item) => item.key));
    const stagedItems = buildStagedUnlockItems(
      items,
      previousStableItemsRef.current,
      freshUnlockKeySet,
    );

    setIsFlipSuspended(true);
    setDisplayItemsOverride(stagedItems);
    setNewlyUnlockedKeys(freshUnlockKeySet);
    setPendingUnlockKeys(freshUnlockKeySet);
    setUnlockPhase("reveal");
    setFlipDurationMs(UNLOCK_FLIP_DURATION_MS);
    setLiveAnnouncement(
      freshUnlocks.map((item) => `New badge unlocked: ${item.label}`).join(". "),
    );

    unlockReleaseTimeoutRef.current = window.setTimeout(() => {
      unlockReleaseTimeoutRef.current = null;

      flushSync(() => {
        setUnlockPhase("move");
        setPendingUnlockKeys(new Set());
        setIsFlipSuspended(false);
        setFlipBaselineToken((current) => current + 1);
      });

      unlockReleaseRafRef.current = window.requestAnimationFrame(() => {
        unlockReleaseRafRef.current = null;

        unlockReleasePaintRafRef.current = window.requestAnimationFrame(() => {
          unlockReleasePaintRafRef.current = null;
          setDisplayItemsOverride(null);
        });
      });
    }, UNLOCK_REVEAL_MS);

    unlockCleanupTimeoutRef.current = window.setTimeout(() => {
      setNewlyUnlockedKeys(new Set());
      setUnlockPhase("idle");
      setDisplayItemsOverride(null);
      setIsFlipSuspended(false);
      setFlipDurationMs(DEFAULT_FLIP_DURATION_MS);
      setLiveAnnouncement("");
      unlockCleanupTimeoutRef.current = null;
    }, UNLOCK_REVEAL_MS + UNLOCK_FLIP_DURATION_MS + UNLOCK_SETTLE_MS);
  }, [clearSequenceTimers, items]);

  const displayItems = React.useMemo(() => {
    return displayItemsOverride ?? items;
  }, [displayItemsOverride, items]);

  return {
    displayItems,
    newlyUnlockedKeys,
    pendingUnlockKeys,
    unlockPhase,
    liveAnnouncement,
    isFlipSuspended,
    flipDurationMs,
    flipBaselineToken,
    resetUnlockSequence,
  };
}