// web/app/home/modules/badges/BadgeCabinet.tsx
"use client";

import React from "react";
import type { MemberDashboardBadge } from "@/lib/memberDashboard";
import BadgeCabinetGrid from "./BadgeCabinetGrid";
import BadgeCabinetItem from "./BadgeCabinetItem";
import { buildBadgeCabinetItems } from "./badgeCabinetViewModel";
import { useFlipGridAnimation } from "./useFlipGridAnimation";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type Props = {
  badges: MemberDashboardBadge[];
};

const DEBUG_REPLAY_RESET_MS = 72;
const UNLOCK_REVEAL_MS = 1680;
const DEFAULT_FLIP_DURATION_MS = 420;
const UNLOCK_FLIP_DURATION_MS = 1320;
const UNLOCK_SETTLE_MS = 640;

function pickRandomItem<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

function buildStagedUnlockItems(
  items: ReturnType<typeof buildBadgeCabinetItems>,
  previousStableItems: ReturnType<typeof buildBadgeCabinetItems>,
  unlockKeys: Set<string>,
): ReturnType<typeof buildBadgeCabinetItems> {
  if (unlockKeys.size === 0) return items;

  const previousByKey = new Map(
    previousStableItems.map((item) => [item.key, item]),
  );

  const stagedItems = items.map((item) => {
    if (!unlockKeys.has(item.key)) return item;

    const previousItem = previousByKey.get(item.key);
    if (!previousItem) return item;

    return {
      ...item,
      partition: previousItem.partition,
    };
  });

  stagedItems.sort((a, b) => {
    if (a.partition !== b.partition) {
      return a.partition === "unlocked" ? -1 : 1;
    }

    if (a.editorialOrder !== b.editorialOrder) {
      return a.editorialOrder - b.editorialOrder;
    }

    return a.label.localeCompare(b.label);
  });

  return stagedItems;
}

export default function BadgeCabinet(props: Props) {
  const { badges } = props;
  const [expanded, setExpanded] = React.useState(false);
  const [newlyUnlockedKeys, setNewlyUnlockedKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [liveAnnouncement, setLiveAnnouncement] = React.useState("");
  const [isAdminDebug, setIsAdminDebug] = React.useState(false);
  const [debugUnlockedKey, setDebugUnlockedKey] = React.useState<string | null>(
    null,
  );
  const [debugSelectedKey, setDebugSelectedKey] = React.useState<string | null>(
    null,
  );
  const prefersReducedMotion = usePrefersReducedMotion();

  const debugReplayTimeoutRef = React.useRef<number | null>(null);
  const unlockReleaseTimeoutRef = React.useRef<number | null>(null);
  const unlockCleanupTimeoutRef = React.useRef<number | null>(null);
  const [previousStableItems, setPreviousStableItems] = React.useState<
    ReturnType<typeof buildBadgeCabinetItems>
  >([]);
  const [pendingUnlockKeys, setPendingUnlockKeys] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [unlockPhase, setUnlockPhase] = React.useState<
    "idle" | "reveal" | "move"
  >("idle");
  const [displayItemsOverride, setDisplayItemsOverride] =
    React.useState<ReturnType<typeof buildBadgeCabinetItems> | null>(null);
  const [isFlipSuspended, setIsFlipSuspended] = React.useState(false);
  const [flipDurationMs, setFlipDurationMs] = React.useState(
    DEFAULT_FLIP_DURATION_MS,
  );
  const [flipLayoutNonce, setFlipLayoutNonce] = React.useState(0);

  const sourceItems = React.useMemo(
    () => buildBadgeCabinetItems(badges),
    [badges],
  );

  const debugCandidateItems = React.useMemo(
    () => sourceItems.filter((item) => !item.unlocked),
    [sourceItems],
  );

  const effectiveBadges = React.useMemo(() => {
    if (!debugUnlockedKey) return badges;

    return badges.map((badge) => {
      if (badge.key !== debugUnlockedKey) return badge;

      return {
        ...badge,
        unlocked: true,
        unlockedAt: new Date().toISOString(),
      };
    });
  }, [badges, debugUnlockedKey]);

  const items = React.useMemo(
    () => buildBadgeCabinetItems(effectiveBadges),
    [effectiveBadges],
  );

  const previousUnlockedKeysRef = React.useRef<Set<string> | null>(null);

  const displayItems = React.useMemo(() => {
    return displayItemsOverride ?? items;
  }, [displayItemsOverride, items]);

  const itemKeys = React.useMemo(
    () => displayItems.map((item) => item.key),
    [displayItems],
  );

  const displayLayoutToken = React.useMemo(
    () => displayItems.map((item) => item.key).join("|"),
    [displayItems],
  );

  const flipLayoutDependency = React.useMemo(
    () =>
      [
        expanded ? "expanded" : "collapsed",
        displayLayoutToken,
        unlockPhase,
        flipLayoutNonce,
      ].join(":"),
    [displayLayoutToken, expanded, flipLayoutNonce, unlockPhase],
  );

  const { registerItemRef } = useFlipGridAnimation({
    keys: itemKeys,
    disabled: prefersReducedMotion || isFlipSuspended,
    durationMs: flipDurationMs,
    layoutDependency: flipLayoutDependency,
  });

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const syncAdminDebug = () => {
      setIsAdminDebug(document.body.dataset.afIsAdmin === "1");
    };

    syncAdminDebug();

    const observer = new MutationObserver(syncAdminDebug);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-af-is-admin"],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  React.useEffect(() => {
    return () => {
      if (debugReplayTimeoutRef.current !== null) {
        window.clearTimeout(debugReplayTimeoutRef.current);
        debugReplayTimeoutRef.current = null;
      }

      if (unlockReleaseTimeoutRef.current !== null) {
        window.clearTimeout(unlockReleaseTimeoutRef.current);
        unlockReleaseTimeoutRef.current = null;
      }

      if (unlockCleanupTimeoutRef.current !== null) {
        window.clearTimeout(unlockCleanupTimeoutRef.current);
        unlockCleanupTimeoutRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    if (displayItemsOverride !== null) return;
    if (unlockPhase !== "idle") return;
    setPreviousStableItems(items);
  }, [displayItemsOverride, items, unlockPhase]);

  React.useEffect(() => {
    if (debugCandidateItems.length === 0) {
      setDebugSelectedKey(null);
      return;
    }

    setDebugSelectedKey((current) => {
      if (current && debugCandidateItems.some((item) => item.key === current)) {
        return current;
      }

      return debugCandidateItems[0]?.key ?? null;
    });
  }, [debugCandidateItems]);

  const replayDebugUnlock = React.useCallback((badgeKey: string | null) => {
    if (!badgeKey) return;

    if (debugReplayTimeoutRef.current !== null) {
      window.clearTimeout(debugReplayTimeoutRef.current);
      debugReplayTimeoutRef.current = null;
    }

    setDebugUnlockedKey(null);

    debugReplayTimeoutRef.current = window.setTimeout(() => {
      setDebugUnlockedKey(badgeKey);
      debugReplayTimeoutRef.current = null;
    }, DEBUG_REPLAY_RESET_MS);
  }, []);

  const handleReplaySelected = React.useCallback(() => {
    replayDebugUnlock(debugSelectedKey);
  }, [debugSelectedKey, replayDebugUnlock]);

  const handleReplayRandom = React.useCallback(() => {
    const randomItem = pickRandomItem(debugCandidateItems);
    if (!randomItem) return;

    setDebugSelectedKey(randomItem.key);
    replayDebugUnlock(randomItem.key);
  }, [debugCandidateItems, replayDebugUnlock]);

  const handleResetDebug = React.useCallback(() => {
    if (debugReplayTimeoutRef.current !== null) {
      window.clearTimeout(debugReplayTimeoutRef.current);
      debugReplayTimeoutRef.current = null;
    }

    if (unlockReleaseTimeoutRef.current !== null) {
      window.clearTimeout(unlockReleaseTimeoutRef.current);
      unlockReleaseTimeoutRef.current = null;
    }

    if (unlockCleanupTimeoutRef.current !== null) {
      window.clearTimeout(unlockCleanupTimeoutRef.current);
      unlockCleanupTimeoutRef.current = null;
    }

    setDebugUnlockedKey(null);
    setPendingUnlockKeys(new Set());
    setNewlyUnlockedKeys(new Set());
    setUnlockPhase("idle");
    setDisplayItemsOverride(null);
    setIsFlipSuspended(false);
    setFlipDurationMs(DEFAULT_FLIP_DURATION_MS);
    setFlipLayoutNonce((current) => current + 1);
  }, []);

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

    if (unlockReleaseTimeoutRef.current !== null) {
      window.clearTimeout(unlockReleaseTimeoutRef.current);
      unlockReleaseTimeoutRef.current = null;
    }

    if (unlockCleanupTimeoutRef.current !== null) {
      window.clearTimeout(unlockCleanupTimeoutRef.current);
      unlockCleanupTimeoutRef.current = null;
    }

    const freshUnlockKeySet = new Set(freshUnlocks.map((item) => item.key));
    const liveText = freshUnlocks
      .map((item) => `New badge unlocked: ${item.label}`)
      .join(". ");

    setIsFlipSuspended(true);
    setDisplayItemsOverride(
      buildStagedUnlockItems(items, previousStableItems, freshUnlockKeySet),
    );
    setNewlyUnlockedKeys(freshUnlockKeySet);
    setPendingUnlockKeys(freshUnlockKeySet);
    setUnlockPhase("reveal");
    setFlipDurationMs(UNLOCK_FLIP_DURATION_MS);
    setLiveAnnouncement(liveText);

    unlockReleaseTimeoutRef.current = window.setTimeout(() => {
      setUnlockPhase("move");
      setPendingUnlockKeys(new Set());
      setDisplayItemsOverride(null);
      setIsFlipSuspended(false);
      setFlipLayoutNonce((current) => current + 1);
      unlockReleaseTimeoutRef.current = null;
    }, UNLOCK_REVEAL_MS);

    unlockCleanupTimeoutRef.current = window.setTimeout(
      () => {
        setNewlyUnlockedKeys(new Set());
        setUnlockPhase("idle");
        setDisplayItemsOverride(null);
        setIsFlipSuspended(false);
        setFlipDurationMs(DEFAULT_FLIP_DURATION_MS);
        setFlipLayoutNonce((current) => current + 1);
        unlockCleanupTimeoutRef.current = null;
      },
      UNLOCK_REVEAL_MS + UNLOCK_FLIP_DURATION_MS + UNLOCK_SETTLE_MS,
    );

    return () => {
      if (unlockReleaseTimeoutRef.current !== null) {
        window.clearTimeout(unlockReleaseTimeoutRef.current);
        unlockReleaseTimeoutRef.current = null;
      }

      if (unlockCleanupTimeoutRef.current !== null) {
        window.clearTimeout(unlockCleanupTimeoutRef.current);
        unlockCleanupTimeoutRef.current = null;
      }
    };
  }, [items, previousStableItems]);

  if (items.length === 0) return null;

  return (
    <>
      <style jsx global>{`
        :global(:root) {
          --portal-badge-columns-collapsed: 8;
          --portal-badge-columns-expanded: 5;
          --portal-badge-gap-collapsed: 14px;
          --portal-badge-gap-expanded: 18px;
          --portal-badge-art-scale-collapsed: 0.82;
          --portal-badge-art-scale-expanded: 1;
          --portal-badge-caption-offset: -3px;
          --portal-badge-caption-row-gap-collapsed: 10px;
          --portal-badge-caption-row-gap-expanded: 16px;
        }

        @media (max-width: 640px) {
          :global(:root) {
            --portal-badge-gap-collapsed: 10px;
            --portal-badge-gap-expanded: 12px;
            --portal-badge-art-scale-collapsed: 0.84;
            --portal-badge-caption-row-gap-collapsed: 8px;
            --portal-badge-caption-row-gap-expanded: 12px;
          }
        }

        @media (max-width: 420px) {
          :global(:root) {
            --portal-badge-gap-collapsed: 8px;
            --portal-badge-gap-expanded: 10px;
            --portal-badge-art-scale-collapsed: 0.86;
            --portal-badge-caption-row-gap-collapsed: 6px;
            --portal-badge-caption-row-gap-expanded: 10px;
          }
        }

        @keyframes portalBadgeLockedPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.92;
          }
          50% {
            transform: scale(1.035);
            opacity: 1;
          }
        }

        @keyframes portalBadgeUnlockedIdleGlow {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.16;
          }
          50% {
            transform: scale(1.025);
            opacity: 0.24;
          }
        }

        @keyframes portalBadgeEmberRiseA {
          0% {
            transform: translate3d(0, 0, 0) scale(0.72);
            opacity: 0;
          }
          18% {
            transform: translate3d(-1px, -4px, 0) scale(0.82);
            opacity: 0.46;
          }
          42% {
            transform: translate3d(1px, -10px, 0) scale(0.92);
            opacity: 0.34;
          }
          68% {
            transform: translate3d(-2px, -15px, 0) scale(1);
            opacity: 0.2;
          }
          100% {
            transform: translate3d(1px, -20px, 0) scale(1.08);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberRiseB {
          0% {
            transform: translate3d(0, 0, 0) scale(0.68);
            opacity: 0;
          }
          20% {
            transform: translate3d(1px, -5px, 0) scale(0.78);
            opacity: 0.38;
          }
          46% {
            transform: translate3d(-1px, -12px, 0) scale(0.88);
            opacity: 0.28;
          }
          74% {
            transform: translate3d(2px, -18px, 0) scale(0.96);
            opacity: 0.16;
          }
          100% {
            transform: translate3d(-1px, -24px, 0) scale(1);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberRiseC {
          0% {
            transform: translate3d(0, 0, 0) scale(0.75);
            opacity: 0;
          }
          22% {
            transform: translate3d(1px, -4px, 0) scale(0.82);
            opacity: 0.34;
          }
          48% {
            transform: translate3d(-2px, -9px, 0) scale(0.88);
            opacity: 0.24;
          }
          70% {
            transform: translate3d(0px, -14px, 0) scale(0.92);
            opacity: 0.14;
          }
          100% {
            transform: translate3d(2px, -18px, 0) scale(0.96);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberBurstA {
          0% {
            transform: translate3d(0, 0, 0) scale(0.74);
            opacity: 0;
          }
          14% {
            transform: translate3d(-1px, -5px, 0) scale(0.84);
            opacity: 0.65;
          }
          38% {
            transform: translate3d(2px, -14px, 0) scale(0.98);
            opacity: 0.42;
          }
          66% {
            transform: translate3d(-3px, -24px, 0) scale(1.08);
            opacity: 0.2;
          }
          100% {
            transform: translate3d(2px, -32px, 0) scale(1.18);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberBurstB {
          0% {
            transform: translate3d(0, 0, 0) scale(0.66);
            opacity: 0;
          }
          16% {
            transform: translate3d(1px, -6px, 0) scale(0.76);
            opacity: 0.54;
          }
          40% {
            transform: translate3d(-2px, -16px, 0) scale(0.88);
            opacity: 0.36;
          }
          68% {
            transform: translate3d(4px, -27px, 0) scale(0.98);
            opacity: 0.16;
          }
          100% {
            transform: translate3d(-2px, -36px, 0) scale(1.08);
            opacity: 0;
          }
        }

        @keyframes portalBadgeEmberBurstC {
          0% {
            transform: translate3d(0, 0, 0) scale(0.7);
            opacity: 0;
          }
          18% {
            transform: translate3d(-1px, -5px, 0) scale(0.8);
            opacity: 0.48;
          }
          42% {
            transform: translate3d(2px, -13px, 0) scale(0.9);
            opacity: 0.3;
          }
          72% {
            transform: translate3d(-2px, -22px, 0) scale(0.98);
            opacity: 0.14;
          }
          100% {
            transform: translate3d(1px, -30px, 0) scale(1.04);
            opacity: 0;
          }
        }

        @keyframes portalBadgeUnlockReveal {
          0% {
            clip-path: circle(0% at 50% 50%);
            filter: saturate(0.92) brightness(1.08);
          }
          100% {
            clip-path: circle(76% at 50% 50%);
            filter: saturate(1) brightness(1);
          }
        }

        @keyframes portalBadgeUnlockSpin {
          0% {
            transform: rotateY(0deg) scale(0.9);
          }
          38% {
            transform: rotateY(180deg) scale(1.02);
          }
          100% {
            transform: rotateY(360deg) scale(1);
          }
        }

        @keyframes portalBadgeUnlockRingA {
          0% {
            transform: scale(0.74);
            opacity: 0;
          }
          12% {
            opacity: 0.82;
          }
          100% {
            transform: scale(1.22);
            opacity: 0;
          }
        }

        @keyframes portalBadgeUnlockRingB {
          0% {
            transform: scale(0.82);
            opacity: 0;
          }
          14% {
            opacity: 0.56;
          }
          100% {
            transform: scale(1.34);
            opacity: 0;
          }
        }

        .portal-member-badge-grid {
          display: grid;
          width: 100%;
          min-width: 0;
          grid-template-columns: repeat(
            var(--portal-badge-columns-collapsed),
            minmax(0, 1fr)
          );
          column-gap: var(--portal-badge-gap-collapsed);
          row-gap: var(--portal-badge-caption-row-gap-collapsed);
          align-items: start;
        }

        .portal-member-badge-grid.portal-member-badges--expanded {
          grid-template-columns: repeat(
            var(--portal-badge-columns-expanded),
            minmax(0, 1fr)
          );
          column-gap: var(--portal-badge-gap-expanded);
          row-gap: var(--portal-badge-caption-row-gap-expanded);
        }

        .portal-member-badge-shell {
          display: grid;
          justify-items: center;
          align-self: start;
          gap: 0;
          min-width: 0;
          width: 100%;
          transform: translate(0px, 0px);
        }

        .portal-member-badge-visual {
          position: relative;
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: visible;
          outline: none;
          perspective: 900px;
          perspective-origin: 50% 50%;
        }

        .portal-member-badge-visual-inner {
          position: absolute;
          inset: 0;
          transform: scale(var(--portal-badge-art-scale-collapsed));
          transform-origin: center center;
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
          will-change: transform;
        }

        .portal-member-badge-grid.portal-member-badges--expanded
          .portal-member-badge-visual-inner {
          transform: scale(var(--portal-badge-art-scale-expanded));
        }

        .portal-member-badge-art-spin {
          transform-style: preserve-3d;
          backface-visibility: hidden;
          will-change: transform;
        }

        .portal-member-badge-art-spin--unlocking {
          animation: portalBadgeUnlockSpin 860ms cubic-bezier(0.22, 1, 0.36, 1)
            both;
        }

        .portal-member-badge-colour-reveal {
          clip-path: circle(0% at 50% 50%);
          animation: portalBadgeUnlockReveal 760ms
            cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        .portal-member-badge-unlock-ring-a,
        .portal-member-badge-unlock-ring-b {
          opacity: 0;
        }

        .portal-member-badge-unlock-ring-a {
          animation: portalBadgeUnlockRingA 760ms cubic-bezier(0.22, 1, 0.36, 1)
            both;
        }

        .portal-member-badge-unlock-ring-b {
          animation: portalBadgeUnlockRingB 980ms cubic-bezier(0.22, 1, 0.36, 1)
            120ms both;
        }

        .portal-member-badge-core--locked {
          animation: portalBadgeLockedPulse 2400ms ease-in-out infinite;
          transform-origin: center;
          will-change: transform, opacity;
        }

        .portal-member-badge-idle-glow {
          animation: portalBadgeUnlockedIdleGlow 3200ms ease-in-out infinite;
          will-change: transform, opacity;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-idle-glow,
        .portal-member-badge-wrap:focus-within .portal-member-badge-idle-glow {
          opacity: 0.42;
          transform: scale(1.06);
        }

        .portal-member-badge-embers {
          opacity: 0.34;
          transition:
            opacity 180ms ease,
            transform 180ms ease;
          pointer-events: none;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-embers,
        .portal-member-badge-wrap:focus-within .portal-member-badge-embers {
          opacity: 0.92;
          transform: translateY(-1px);
        }

        .portal-member-badge-spark-a {
          opacity: 0;
          animation: portalBadgeEmberRiseA 1300ms
            cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
        }

        .portal-member-badge-spark-b {
          opacity: 0;
          animation: portalBadgeEmberRiseB 1600ms
            cubic-bezier(0.19, 0.72, 0.32, 1) infinite 160ms;
        }

        .portal-member-badge-spark-c {
          opacity: 0;
          animation: portalBadgeEmberRiseC 1450ms
            cubic-bezier(0.25, 0.68, 0.3, 1) infinite 320ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-a,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-a {
          animation: portalBadgeEmberBurstA 950ms
            cubic-bezier(0.2, 0.72, 0.28, 1) infinite;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-b,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-b {
          animation: portalBadgeEmberBurstB 1100ms
            cubic-bezier(0.18, 0.75, 0.3, 1) infinite 120ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-spark-c,
        .portal-member-badge-wrap:focus-within .portal-member-badge-spark-c {
          animation: portalBadgeEmberBurstC 1000ms
            cubic-bezier(0.24, 0.7, 0.3, 1) infinite 220ms;
        }

        .portal-member-badge-burst-a,
        .portal-member-badge-burst-b,
        .portal-member-badge-burst-c {
          opacity: 0;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-burst-a,
        .portal-member-badge-wrap:focus-within .portal-member-badge-burst-a {
          animation: portalBadgeEmberBurstA 820ms
            cubic-bezier(0.2, 0.74, 0.28, 1) infinite 40ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-burst-b,
        .portal-member-badge-wrap:focus-within .portal-member-badge-burst-b {
          animation: portalBadgeEmberBurstB 900ms
            cubic-bezier(0.18, 0.76, 0.3, 1) infinite 180ms;
        }

        .portal-member-badge-wrap:hover .portal-member-badge-burst-c,
        .portal-member-badge-wrap:focus-within .portal-member-badge-burst-c {
          animation: portalBadgeEmberBurstC 860ms
            cubic-bezier(0.22, 0.72, 0.3, 1) infinite 300ms;
        }

        .portal-member-badge-meta {
          width: 100%;
          max-width: 100%;
          display: grid;
          grid-template-rows: 0fr;
          margin-top: 0;
          opacity: 0;
          transform: translateY(-4px);
          pointer-events: none;
          transition:
            grid-template-rows 260ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 180ms ease,
            transform 220ms ease,
            margin-top 220ms ease;
          transition-delay: 0ms, 0ms, 0ms, 0ms;
          text-align: center;
        }

        .portal-member-badge-grid.portal-member-badges--expanded
          .portal-member-badge-meta {
          grid-template-rows: 1fr;
          margin-top: 10px;
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
          transition-delay: 0ms, 110ms, 110ms, 0ms;
        }

        .portal-member-badge-meta-inner {
          overflow: hidden;
          min-height: 0;
          opacity: 0;
          transform: translateY(var(--portal-badge-caption-offset));
          transition:
            opacity 180ms ease,
            transform 220ms ease;
          transition-delay: 0ms, 0ms;
        }

        .portal-member-badge-grid.portal-member-badges--expanded
          .portal-member-badge-meta-inner {
          opacity: 1;
          transform: translateY(0);
          transition-delay: 140ms, 140ms;
        }

        .portal-member-badge-live-region {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .portal-member-badge-core--locked,
          .portal-member-badge-idle-glow,
          .portal-member-badge-spark-a,
          .portal-member-badge-spark-b,
          .portal-member-badge-spark-c,
          .portal-member-badge-burst-a,
          .portal-member-badge-burst-b,
          .portal-member-badge-burst-c,
          .portal-member-badge-art-spin--unlocking,
          .portal-member-badge-colour-reveal,
          .portal-member-badge-unlock-ring-a,
          .portal-member-badge-unlock-ring-b {
            animation: none !important;
          }

          .portal-member-badge-embers {
            opacity: 0 !important;
          }

          .portal-member-badge-grid,
          .portal-member-badge-shell,
          .portal-member-badge-visual-inner,
          .portal-member-badge-meta,
          .portal-member-badge-meta-inner {
            transition: none !important;
            transition-delay: 0ms !important;
          }

          .portal-member-badge-meta {
            grid-template-rows: none !important;
          }
        }
      `}</style>

      <div
        style={{
          display: "grid",
          gap: 10,
          minWidth: 0,
        }}
      >
        <div
          aria-live="polite"
          aria-atomic="true"
          className="portal-member-badge-live-region"
        >
          {liveAnnouncement}
        </div>

        <div
          style={{
            display: "grid",
            gap: 8,
            minWidth: 0,
          }}
        >
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            style={{
              appearance: "none",
              border: "none",
              background: "transparent",
              padding: 0,
              margin: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "flex-start",
              gap: 8,
              minWidth: 0,
              width: "fit-content",
              color: "inherit",
              cursor: "pointer",
            }}
          >
            <span
              style={{
                fontSize: 10,
                letterSpacing: 0.3,
                textTransform: "uppercase",
                lineHeight: 1.2,
                opacity: 0.5,
              }}
            >
              Badges
            </span>

            <span
              aria-hidden="true"
              style={{
                display: "inline-block",
                fontSize: 12,
                lineHeight: 1,
                opacity: 0.5,
                transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
                transformOrigin: "50% 50%",
                transition: prefersReducedMotion
                  ? undefined
                  : "transform 220ms ease, opacity 180ms ease",
              }}
            >
              &gt;
            </span>
          </button>

          {isAdminDebug ? (
            <div
              style={{
                display: "grid",
                gap: 8,
                minWidth: 0,
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(255,255,255,0.035)",
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 0.3,
                  textTransform: "uppercase",
                  lineHeight: 1.2,
                  opacity: 0.5,
                }}
              >
                Cabinet debug
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr)",
                  gap: 8,
                }}
              >
                <select
                  value={debugSelectedKey ?? ""}
                  onChange={(event) => {
                    const nextKey = event.target.value.trim();
                    setDebugSelectedKey(nextKey || null);
                  }}
                  disabled={debugCandidateItems.length === 0}
                  style={{
                    minWidth: 0,
                    width: "100%",
                    borderRadius: 10,
                    border: "1px solid rgba(255,255,255,0.12)",
                    background: "rgba(0,0,0,0.18)",
                    color: "inherit",
                    padding: "8px 10px",
                    fontSize: 12,
                    lineHeight: 1.3,
                    opacity: debugCandidateItems.length === 0 ? 0.55 : 0.92,
                  }}
                >
                  {debugCandidateItems.length === 0 ? (
                    <option value="">No locked badges available</option>
                  ) : null}

                  {debugCandidateItems.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}
                    </option>
                  ))}
                </select>

                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  <button
                    type="button"
                    onClick={handleReplaySelected}
                    disabled={!debugSelectedKey}
                    style={{
                      appearance: "none",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      padding: "7px 10px",
                      fontSize: 12,
                      lineHeight: 1.2,
                      cursor: debugSelectedKey ? "pointer" : "default",
                      opacity: debugSelectedKey ? 0.9 : 0.5,
                    }}
                  >
                    Replay selected
                  </button>

                  <button
                    type="button"
                    onClick={handleReplayRandom}
                    disabled={debugCandidateItems.length === 0}
                    style={{
                      appearance: "none",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "rgba(255,255,255,0.05)",
                      color: "inherit",
                      padding: "7px 10px",
                      fontSize: 12,
                      lineHeight: 1.2,
                      cursor:
                        debugCandidateItems.length > 0 ? "pointer" : "default",
                      opacity: debugCandidateItems.length > 0 ? 0.9 : 0.5,
                    }}
                  >
                    Replay random
                  </button>

                  <button
                    type="button"
                    onClick={handleResetDebug}
                    disabled={!debugUnlockedKey}
                    style={{
                      appearance: "none",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      background: "transparent",
                      color: "inherit",
                      padding: "7px 10px",
                      fontSize: 12,
                      lineHeight: 1.2,
                      cursor: debugUnlockedKey ? "pointer" : "default",
                      opacity: debugUnlockedKey ? 0.78 : 0.45,
                    }}
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <BadgeCabinetGrid expanded={expanded}>
          {displayItems.map((item) => (
            <BadgeCabinetItem
              key={item.key}
              item={item}
              expanded={expanded}
              isNewlyUnlocked={newlyUnlockedKeys.has(item.key)}
              isUnlocking={pendingUnlockKeys.has(item.key)}
              itemRef={registerItemRef(item.key)}
            />
          ))}
        </BadgeCabinetGrid>
      </div>
    </>
  );
}
