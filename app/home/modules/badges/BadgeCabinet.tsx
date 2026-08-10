// web/app/home/modules/badges/BadgeCabinet.tsx
"use client";

import React from "react";
import type { MemberDashboardBadge } from "@/lib/memberDashboard";
import type { BadgeAwardNotice } from "@/app/home/badges/badgeAwardTypes";
import { useBadgeAwardOverlay } from "@/app/home/badges/BadgeAwardOverlayProvider";
import BadgeCabinetGrid from "./BadgeCabinetGrid";
import BadgeCabinetItem from "./BadgeCabinetItem";
import BadgeCabinetStyles from "./BadgeCabinetStyles";
import BadgeUnlockVisualStyles from "./BadgeUnlockVisualStyles";
import { buildBadgeCabinetItems } from "./badgeCabinetViewModel";
import type { BadgeCabinetItemModel } from "./badgeCabinetTypes";
import { useBadgeCabinetUnlockSequence } from "./useBadgeCabinetUnlockSequence";
import { useFlipGridAnimation } from "./useFlipGridAnimation";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type Props = Readonly<{
  badges: MemberDashboardBadge[];
}>;

type DebugPanelProps = Readonly<{
  candidateItems: BadgeCabinetItemModel[];
  selectedKey: string | null;
  unlockedKey: string | null;
  onSelectKey: (key: string | null) => void;
  onReplaySelected: () => void;
  onReplayRandom: () => void;
  onCelebrateSelected: () => void;
  onCelebrateRandom: () => void;
  onReset: () => void;
}>;

const SHOW_DEBUG_PANEL = false;
const DEBUG_REPLAY_RESET_MS = 72;

function pickRandomItem<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

function toBadgeAwardNotice(item: BadgeCabinetItemModel): BadgeAwardNotice {
  return {
    entitlementKey: item.key,
    title: item.label,
    description: item.description ?? null,
    imageUrl: item.imageUrl ?? null,
    shareable: item.shareable,
    unlockedAt: item.unlockedAt ?? "",
  };
}

function buildEffectiveBadges(
  badges: MemberDashboardBadge[],
  debugUnlockedKey: string | null,
): MemberDashboardBadge[] {
  if (!debugUnlockedKey) return badges;

  return badges.map((badge) => {
    if (badge.key !== debugUnlockedKey) return badge;

    return {
      ...badge,
      unlocked: true,
      unlockedAt: new Date().toISOString(),
    };
  });
}

function useAdminDebugFlag(): boolean {
  const [isAdminDebug, setIsAdminDebug] = React.useState(false);

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

  return isAdminDebug;
}

function useDebugSelection(
  candidateItems: BadgeCabinetItemModel[],
): readonly [
  string | null,
  React.Dispatch<React.SetStateAction<string | null>>,
] {
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (candidateItems.length === 0) {
      setSelectedKey(null);
      return;
    }

    setSelectedKey((current) => {
      const currentStillAvailable =
        current !== null && candidateItems.some((item) => item.key === current);

      return currentStillAvailable ? current : (candidateItems[0]?.key ?? null);
    });
  }, [candidateItems]);

  return [selectedKey, setSelectedKey] as const;
}

function useDebugReplay(): Readonly<{
  debugUnlockedKey: string | null;
  replayDebugUnlock: (badgeKey: string | null) => void;
  clearDebugUnlock: () => void;
}> {
  const [debugUnlockedKey, setDebugUnlockedKey] = React.useState<string | null>(
    null,
  );
  const debugReplayTimeoutRef = React.useRef<number | null>(null);

  const clearReplayTimer = React.useCallback(() => {
    if (debugReplayTimeoutRef.current === null) return;

    window.clearTimeout(debugReplayTimeoutRef.current);
    debugReplayTimeoutRef.current = null;
  }, []);

  React.useEffect(() => {
    return clearReplayTimer;
  }, [clearReplayTimer]);

  const replayDebugUnlock = React.useCallback(
    (badgeKey: string | null) => {
      if (!badgeKey) return;

      clearReplayTimer();
      setDebugUnlockedKey(null);

      debugReplayTimeoutRef.current = window.setTimeout(() => {
        setDebugUnlockedKey(badgeKey);
        debugReplayTimeoutRef.current = null;
      }, DEBUG_REPLAY_RESET_MS);
    },
    [clearReplayTimer],
  );

  const clearDebugUnlock = React.useCallback(() => {
    clearReplayTimer();
    setDebugUnlockedKey(null);
  }, [clearReplayTimer]);

  return {
    debugUnlockedKey,
    replayDebugUnlock,
    clearDebugUnlock,
  };
}

function BadgeCabinetToggle(
  props: Readonly<{
    expanded: boolean;
    prefersReducedMotion: boolean;
    onToggle: () => void;
  }>,
) {
  const { expanded, prefersReducedMotion, onToggle } = props;

  return (
    <button
      type="button"
      onClick={onToggle}
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
  );
}

function DebugActionButton(
  props: Readonly<{
    label: string;
    disabled: boolean;
    onClick: () => void;
    transparent?: boolean;
    enabledOpacity?: number;
    disabledOpacity?: number;
  }>,
) {
  const {
    label,
    disabled,
    onClick,
    transparent = false,
    enabledOpacity = 0.9,
    disabledOpacity = 0.5,
  } = props;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: "none",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: transparent ? "transparent" : "rgba(255,255,255,0.05)",
        color: "inherit",
        padding: "7px 10px",
        fontSize: 12,
        lineHeight: 1.2,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? disabledOpacity : enabledOpacity,
      }}
    >
      {label}
    </button>
  );
}

function BadgeCabinetDebugPanel(props: DebugPanelProps) {
  const {
    candidateItems,
    selectedKey,
    unlockedKey,
    onSelectKey,
    onReplaySelected,
    onReplayRandom,
    onCelebrateSelected,
    onCelebrateRandom,
    onReset,
  } = props;

  const hasCandidates = candidateItems.length > 0;

  return (
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
          value={selectedKey ?? ""}
          onChange={(event) => {
            const nextKey = event.target.value.trim();
            onSelectKey(nextKey || null);
          }}
          disabled={!hasCandidates}
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
            opacity: hasCandidates ? 0.92 : 0.55,
          }}
        >
          {!hasCandidates ? (
            <option value="">No locked badges available</option>
          ) : null}

          {candidateItems.map((item) => (
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
          <DebugActionButton
            label="Replay selected"
            disabled={!selectedKey}
            onClick={onReplaySelected}
          />
          <DebugActionButton
            label="Replay random"
            disabled={!hasCandidates}
            onClick={onReplayRandom}
          />
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <DebugActionButton
            label="Celebrate selected"
            disabled={!selectedKey}
            onClick={onCelebrateSelected}
          />
          <DebugActionButton
            label="Celebrate random"
            disabled={!hasCandidates}
            onClick={onCelebrateRandom}
          />
          <DebugActionButton
            label="Reset"
            disabled={!unlockedKey}
            onClick={onReset}
            transparent
            enabledOpacity={0.78}
            disabledOpacity={0.45}
          />
        </div>
      </div>
    </div>
  );
}

export default function BadgeCabinet(props: Props) {
  const { badges } = props;

  const [expanded, setExpanded] = React.useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const isAdminDebug = useAdminDebugFlag();
  const { announceBadge, resetOverlayDebugState } = useBadgeAwardOverlay();

  const sourceItems = React.useMemo(
    () => buildBadgeCabinetItems(badges),
    [badges],
  );
  const debugCandidateItems = React.useMemo(
    () => sourceItems.filter((item) => !item.unlocked),
    [sourceItems],
  );
  const debugCandidateByKey = React.useMemo(
    () => new Map(debugCandidateItems.map((item) => [item.key, item])),
    [debugCandidateItems],
  );
  const [debugSelectedKey, setDebugSelectedKey] =
    useDebugSelection(debugCandidateItems);
  const { debugUnlockedKey, replayDebugUnlock, clearDebugUnlock } =
    useDebugReplay();

  const effectiveBadges = React.useMemo(
    () => buildEffectiveBadges(badges, debugUnlockedKey),
    [badges, debugUnlockedKey],
  );
  const items = React.useMemo(
    () => buildBadgeCabinetItems(effectiveBadges),
    [effectiveBadges],
  );

  const {
    displayItems,
    newlyUnlockedKeys,
    pendingUnlockKeys,
    unlockPhase,
    liveAnnouncement,
    isFlipSuspended,
    flipDurationMs,
    flipBaselineToken,
    resetUnlockSequence,
  } = useBadgeCabinetUnlockSequence({ items });

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
      ].join(":"),
    [displayLayoutToken, expanded, unlockPhase],
  );

  const { registerItemRef } = useFlipGridAnimation({
    keys: itemKeys,
    disabled: prefersReducedMotion || isFlipSuspended,
    durationMs: flipDurationMs,
    layoutDependency: flipLayoutDependency,
    captureBaselineToken: flipBaselineToken,
  });

  const announceDebugOverlay = React.useCallback(
    (badgeKey: string | null) => {
      if (!badgeKey) return;

      const item = debugCandidateByKey.get(badgeKey);
      if (item) announceBadge(toBadgeAwardNotice(item));
    },
    [announceBadge, debugCandidateByKey],
  );

  const handleReplayRandom = React.useCallback(() => {
    const randomItem = pickRandomItem(debugCandidateItems);
    if (!randomItem) return;

    setDebugSelectedKey(randomItem.key);
    replayDebugUnlock(randomItem.key);
  }, [debugCandidateItems, replayDebugUnlock, setDebugSelectedKey]);

  const handleCelebrateRandom = React.useCallback(() => {
    const randomItem = pickRandomItem(debugCandidateItems);
    if (!randomItem) return;

    setDebugSelectedKey(randomItem.key);
    announceBadge(toBadgeAwardNotice(randomItem));
  }, [announceBadge, debugCandidateItems, setDebugSelectedKey]);

  const handleResetDebug = React.useCallback(() => {
    clearDebugUnlock();
    resetUnlockSequence();
    resetOverlayDebugState();
  }, [clearDebugUnlock, resetOverlayDebugState, resetUnlockSequence]);

  if (items.length === 0) return null;

  const showDebugPanel = isAdminDebug && SHOW_DEBUG_PANEL;

  return (
    <>
      <BadgeCabinetStyles />
      <BadgeUnlockVisualStyles />

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
          <BadgeCabinetToggle
            expanded={expanded}
            prefersReducedMotion={prefersReducedMotion}
            onToggle={() => setExpanded((current) => !current)}
          />

          {showDebugPanel ? (
            <BadgeCabinetDebugPanel
              candidateItems={debugCandidateItems}
              selectedKey={debugSelectedKey}
              unlockedKey={debugUnlockedKey}
              onSelectKey={setDebugSelectedKey}
              onReplaySelected={() => replayDebugUnlock(debugSelectedKey)}
              onReplayRandom={handleReplayRandom}
              onCelebrateSelected={() => announceDebugOverlay(debugSelectedKey)}
              onCelebrateRandom={handleCelebrateRandom}
              onReset={handleResetDebug}
            />
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
