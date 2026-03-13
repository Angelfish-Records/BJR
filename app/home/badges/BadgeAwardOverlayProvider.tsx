"use client";

import React from "react";
import BadgeAwardOverlay from "./BadgeAwardOverlay";
import type { BadgeAwardNotice } from "./badgeAwardTypes";

type BadgeAwardOverlayContextValue = {
  announceBadges: (badges: BadgeAwardNotice[]) => void;
};

const BadgeAwardOverlayContext =
  React.createContext<BadgeAwardOverlayContextValue | null>(null);

const DISPLAY_MS = 2800;
const EXIT_MS = 220;
const RECENT_DEDUPE_WINDOW_MS = 10_000;

type ProviderProps = {
  children: React.ReactNode;
};

function dedupeIncomingBadges(
  badges: BadgeAwardNotice[],
  recentSeenRef: React.MutableRefObject<Map<string, number>>,
): BadgeAwardNotice[] {
  const now = Date.now();

  for (const [key, expiresAt] of recentSeenRef.current.entries()) {
    if (expiresAt <= now) {
      recentSeenRef.current.delete(key);
    }
  }

  const unique: BadgeAwardNotice[] = [];
  const seenThisBatch = new Set<string>();

  for (const badge of badges) {
    const key = badge.entitlementKey.trim();
    if (!key) continue;
    if (seenThisBatch.has(key)) continue;
    if (recentSeenRef.current.has(key)) continue;

    seenThisBatch.add(key);
    unique.push(badge);
  }

  return unique;
}

export function BadgeAwardOverlayProvider(props: ProviderProps) {
  const { children } = props;

  const [queue, setQueue] = React.useState<BadgeAwardNotice[]>([]);
  const [activeBadge, setActiveBadge] = React.useState<BadgeAwardNotice | null>(
    null,
  );
  const [visible, setVisible] = React.useState(false);

  const recentSeenRef = React.useRef(new Map<string, number>());
  const dismissTimeoutRef = React.useRef<number | null>(null);
  const clearActiveTimeoutRef = React.useRef<number | null>(null);

  const clearTimers = React.useCallback(() => {
    if (dismissTimeoutRef.current !== null) {
      window.clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    if (clearActiveTimeoutRef.current !== null) {
      window.clearTimeout(clearActiveTimeoutRef.current);
      clearActiveTimeoutRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const dismissActive = React.useCallback(() => {
    clearTimers();
    setVisible(false);

    clearActiveTimeoutRef.current = window.setTimeout(() => {
      setActiveBadge(null);
      clearActiveTimeoutRef.current = null;
    }, EXIT_MS);
  }, [clearTimers]);

  const announceBadges = React.useCallback((badges: BadgeAwardNotice[]) => {
    if (!Array.isArray(badges) || badges.length === 0) return;

    setQueue((current) => {
      const next = dedupeIncomingBadges(badges, recentSeenRef);
      if (next.length === 0) return current;
      return current.concat(next);
    });
  }, []);

  React.useEffect(() => {
    if (activeBadge !== null) return;
    if (queue.length === 0) return;

    const [nextBadge, ...rest] = queue;
    setQueue(rest);
    setActiveBadge(nextBadge);
    setVisible(true);

    recentSeenRef.current.set(
      nextBadge.entitlementKey,
      Date.now() + RECENT_DEDUPE_WINDOW_MS,
    );

    dismissTimeoutRef.current = window.setTimeout(() => {
      setVisible(false);

      clearActiveTimeoutRef.current = window.setTimeout(() => {
        setActiveBadge(null);
        clearActiveTimeoutRef.current = null;
      }, EXIT_MS);

      dismissTimeoutRef.current = null;
    }, DISPLAY_MS);
  }, [activeBadge, queue]);

  const contextValue = React.useMemo<BadgeAwardOverlayContextValue>(
    () => ({
      announceBadges,
    }),
    [announceBadges],
  );

  return (
    <BadgeAwardOverlayContext.Provider value={contextValue}>
      {children}

      <BadgeAwardOverlay
        active={activeBadge !== null}
        visible={visible}
        badge={activeBadge}
        onDismiss={dismissActive}
      />
    </BadgeAwardOverlayContext.Provider>
  );
}

export function useBadgeAwardOverlay(): BadgeAwardOverlayContextValue {
  const value = React.useContext(BadgeAwardOverlayContext);

  if (!value) {
    throw new Error(
      "useBadgeAwardOverlay must be used within BadgeAwardOverlayProvider.",
    );
  }

  return value;
}