// web/app/home/modules/badges/BadgeCabinet.tsx
"use client";

import React from "react";
import type { MemberDashboardBadge } from "@/lib/memberDashboard";
import BadgeCabinetGrid from "./BadgeCabinetGrid";
import BadgeCabinetItem from "./BadgeCabinetItem";
import BadgeCabinetStyles from "./BadgeCabinetStyles";
import BadgeUnlockVisualStyles from "./BadgeUnlockVisualStyles";
import { buildBadgeCabinetItems } from "./badgeCabinetViewModel";
import { useBadgeCabinetUnlockSequence } from "./useBadgeCabinetUnlockSequence";
import { useFlipGridAnimation } from "./useFlipGridAnimation";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

type Props = {
  badges: MemberDashboardBadge[];
};

const DEBUG_REPLAY_RESET_MS = 72;

function pickRandomItem<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] ?? null;
}

export default function BadgeCabinet(props: Props) {
  const { badges } = props;

  const [expanded, setExpanded] = React.useState(false);
  const [isAdminDebug, setIsAdminDebug] = React.useState(false);
  const [debugUnlockedKey, setDebugUnlockedKey] = React.useState<string | null>(
    null,
  );
  const [debugSelectedKey, setDebugSelectedKey] = React.useState<string | null>(
    null,
  );

  const prefersReducedMotion = usePrefersReducedMotion();
  const debugReplayTimeoutRef = React.useRef<number | null>(null);

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
  } = useBadgeCabinetUnlockSequence({
    items,
  });

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
    };
  }, []);

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

    setDebugUnlockedKey(null);
    resetUnlockSequence();
  }, [resetUnlockSequence]);

  if (items.length === 0) return null;

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