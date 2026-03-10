"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { getLastPortalTab, setLastPortalTab } from "./portalLastTab";

// Optional: unify with urlState’s QS event pattern
const PATH_EVENT = "af:path-change";

function getStablePathname(nextPathname: string | null): string | null {
  if (nextPathname) return nextPathname;
  if (typeof window === "undefined") return null;
  return window.location.pathname || null;
}

export type PortalTabSpec = {
  id: string;
  title: string;
  locked?: boolean;
  lockedHint?: string | null;
  content: React.ReactNode;
};

function tabFromPathname(pathname: string | null): string | null {
  const p = (pathname ?? "").split("?")[0] ?? "";
  const parts = p.split("/").filter(Boolean);

  const head = (parts[0] ?? "").trim().toLowerCase();
  if (!head) return null;

  if (head === "player") return null;
  if (head === "album") return null;
  if (head === "portal") return null;

  return decodeURIComponent(head);
}

function pathForTab(tabId: string) {
  const t = (tabId || "").trim().toLowerCase();
  // Default surface for "no tab" is now /portal (was /extras)
  if (!t || t === "player") return "/portal";
  if (t === "exegesis") return "/exegesis";
  return `/${encodeURIComponent(t)}`;
}

function getRememberedValidTab(
  tabs: PortalTabSpec[],
  resolveValid: (candidate: string | null) => string | null,
): string | null {
  if (typeof window === "undefined") return null;
  const remembered = getLastPortalTab();
  return resolveValid(remembered);
}

function pushPathOnly(href: string) {
  if (typeof window === "undefined") return;
  const cur = window.location.href;
  const next = href.startsWith("http") ? href : new URL(href, cur).toString();
  if (next === cur) return;

  window.history.pushState({}, "", next);
  window.dispatchEvent(new Event(PATH_EVENT));
}

export default function PortalTabs(props: {
  tabs: PortalTabSpec[];
  defaultTabId?: string | null;
}) {
  const { tabs, defaultTabId = null } = props;

  // Keep router only if we still want prefetch warming.
  const router = useRouter();

  // We can keep usePathname for initial server->client consistency,
  // but post-patch we will NOT rely on it for updates.
  const pathname = usePathname();
  const stablePathname = getStablePathname(pathname);

  const didHydrateRef = React.useRef(false);

  const hasTabs = tabs.length > 0;
  const firstId = (hasTabs ? tabs[0]?.id : null) ?? null;

  const resolveValid = React.useCallback(
    (candidate: string | null): string | null => {
      if (!candidate) return null;
      if (candidate === "player") return null;
      return tabs.some((t) => t.id === candidate) ? candidate : null;
    },
    [tabs],
  );

  const initial = React.useMemo(() => {
    if (!hasTabs) return null;

    const pathTab = tabFromPathname(stablePathname);
    const validPath = resolveValid(pathTab);
    const rememberedValid = getRememberedValidTab(tabs, resolveValid);

    const defaultValid =
      defaultTabId && tabs.some((t) => t.id === defaultTabId)
        ? defaultTabId
        : null;

    return validPath ?? rememberedValid ?? defaultValid ?? firstId;
  }, [hasTabs, defaultTabId, tabs, stablePathname, resolveValid, firstId]);

  const [activeId, setActiveId] = React.useState<string | null>(initial);

  const [mountedIds, setMountedIds] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    if (initial) s.add(initial);
    return s;
  });

  const activeIdRef = React.useRef<string | null>(initial);
  const mountedIdsRef = React.useRef<Set<string>>(new Set(mountedIds));

  React.useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  React.useEffect(() => {
    mountedIdsRef.current = mountedIds;
  }, [mountedIds]);

  // --- two-signal model for differential Exegesis portal styling ---

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const root = document.documentElement;
    const v = (activeId ?? "").trim();

    if (v) root.dataset.afPortalTab = v;
    else delete root.dataset.afPortalTab;

    return () => {
      delete root.dataset.afPortalTab;
    };
  }, [activeId]);

  // --- underline indicator (rail + sliding pill) ---
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const btnRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  const [indicator, setIndicator] = React.useState<{
    x: number;
    w: number;
  } | null>(null);
  const [rail, setRail] = React.useState<{ x: number; w: number } | null>(null);
  const [indicatorMotionEnabled, setIndicatorMotionEnabled] =
    React.useState(false);
  const indicatorMotionTimeoutRef = React.useRef<number | null>(null);

  const armIndicatorMotion = React.useCallback(() => {
    if (typeof window === "undefined") return;

    if (indicatorMotionTimeoutRef.current != null) {
      window.clearTimeout(indicatorMotionTimeoutRef.current);
    }

    setIndicatorMotionEnabled(true);

    indicatorMotionTimeoutRef.current = window.setTimeout(() => {
      setIndicatorMotionEnabled(false);
      indicatorMotionTimeoutRef.current = null;
    }, 260);
  }, []);

  const ensureMounted = React.useCallback((tabId: string) => {
    if (!tabId) return;

    if (mountedIdsRef.current.has(tabId)) return;

    const next = new Set(mountedIdsRef.current);
    next.add(tabId);
    mountedIdsRef.current = next;
    setMountedIds(next);
  }, []);

  const measure = React.useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    if (!tabs.length) return;

    const rowRect = row.getBoundingClientRect();

    const btns = tabs
      .map((t) => btnRefs.current.get(t.id))
      .filter(Boolean) as HTMLButtonElement[];

    if (!btns.length) return;

    const first = btns[0];
    const last = btns[btns.length - 1];

    const firstRect = first.getBoundingClientRect();
    const lastRect = last.getBoundingClientRect();

    const railX = firstRect.left - rowRect.left + row.scrollLeft;
    const railW = lastRect.right - firstRect.left;

    const r = (n: number) =>
      Math.round(n * (window.devicePixelRatio || 1)) /
      (window.devicePixelRatio || 1);

    setRail({ x: r(railX), w: r(railW) });

    const id = activeId;
    if (!id) return;

    const btn = btnRefs.current.get(id) ?? null;
    if (!btn) return;

    const b = btn.getBoundingClientRect();
    const x = b.left - rowRect.left + row.scrollLeft;
    const w = b.width;

    setIndicator({ x: r(x), w: r(w) });
  }, [tabs, activeId]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  React.useEffect(() => {
    return () => {
      if (indicatorMotionTimeoutRef.current != null) {
        window.clearTimeout(indicatorMotionTimeoutRef.current);
      }
    };
  }, []);

  // ✅ Keep your prewarm-all behavior unchanged
  React.useEffect(() => {
    if (!tabs.length) return;

    const warmAll = () => {
      setMountedIds((prev) => {
        const next = new Set(prev);
        tabs.forEach((tab, i) => {
          window.setTimeout(
            () => {
              setMountedIds((prev) => {
                const next = new Set(prev);
                next.add(tab.id);
                return next;
              });
            },
            100 * (i + 1),
          );
        });
        return next;
      });
    };

    type IdleWin = Window & {
      requestIdleCallback?: (cb: () => void) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    const win = typeof window !== "undefined" ? (window as IdleWin) : null;

    let id: number | null = null;

    if (win?.requestIdleCallback) {
      id = win.requestIdleCallback(warmAll);
      return () => {
        if (win.cancelIdleCallback && id != null) win.cancelIdleCallback(id);
      };
    }

    const t = window.setTimeout(warmAll, 250);
    return () => window.clearTimeout(t);
  }, [tabs]);

  const active = React.useMemo(() => {
    if (!hasTabs) return null;
    return tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;
  }, [hasTabs, tabs, activeId]);

  // ✅ Initial hydrate alignment + validity repair only
  React.useEffect(() => {
    if (!initial) return;

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      activeIdRef.current = initial;
      setActiveId(initial);
      ensureMounted(initial);
      return;
    }

    const current = activeIdRef.current;
    const currentStillValid = current
      ? tabs.some((t) => t.id === current)
      : false;

    if (!currentStillValid) {
      activeIdRef.current = initial;
      setActiveId(initial);
      ensureMounted(initial);
    }
  }, [initial, tabs, ensureMounted]);

  // ✅ Listen to real URL changes (back/forward + our PATH_EVENT)
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromLocation = () => {
      const t = tabFromPathname(window.location.pathname);
      const rememberedValid = getRememberedValidTab(tabs, resolveValid);
      const v = resolveValid(t) ?? rememberedValid ?? initial;

      if (v) setLastPortalTab(v);
      if (!v) return;

      const current = activeIdRef.current;

      if (v !== current) {
        armIndicatorMotion();
        activeIdRef.current = v;
        setActiveId(v);
        ensureMounted(v);
        requestAnimationFrame(() => measure());
        return;
      }

      ensureMounted(v);
    };

    const onPop = () => syncFromLocation();
    const onCustom = () => syncFromLocation();

    window.addEventListener("popstate", onPop);
    window.addEventListener(PATH_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(PATH_EVENT, onCustom as EventListener);
    };
  }, [initial, resolveValid, measure, tabs, armIndicatorMotion, ensureMounted]);

  if (!hasTabs) return null;

  const tabBtn = (isActive: boolean): React.CSSProperties => ({
    appearance: "none",
    border: "none",
    background: "transparent",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    whiteSpace: "nowrap",
    fontSize: 12,
    letterSpacing: 0.2,
    lineHeight: 1.2,
    color: isActive ? "rgba(255,255,255,0.80)" : "rgba(255,255,255,0.46)",
    textDecoration: "none",
  });

  return (
    <div style={{ display: "grid", gap: 12, minWidth: 0 }}>
      <style>{`.afPortalTabRow::-webkit-scrollbar { display:none; height:0; }`}</style>

      <div
        ref={rowRef}
        className="afPortalTabRow"
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: "nowrap",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "2px 2px 12px",
          scrollbarWidth: "none",
          minWidth: 0,
        }}
        onScroll={() => measure()}
      >
        {/* rail */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 3,
            left: rail?.x ?? 0,
            width: rail?.w ?? 0,
            height: 1,
            background: "rgba(255,255,255,0.18)",
            pointerEvents: "none",
            opacity: rail ? 1 : 0,
            transition: indicatorMotionEnabled
              ? "left 220ms ease, width 220ms ease, opacity 120ms ease"
              : "none",
          }}
        />

        {/* indicator */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            bottom: 1,
            height: 2,
            borderRadius: 999,
            background: "rgba(255,255,255,0.90)",
            pointerEvents: "none",
            transform: `translateX(${indicator?.x ?? 0}px)`,
            width: indicator?.w ?? 0,
            transition: indicatorMotionEnabled
              ? "transform 220ms ease, width 220ms ease, opacity 120ms ease"
              : "none",
            opacity: indicator ? 1 : 0,
          }}
        />

        {tabs.map((t) => {
          const isActive = t.id === active?.id;

          return (
            <button
              key={t.id}
              ref={(el) => {
                if (el) btnRefs.current.set(t.id, el);
                else btnRefs.current.delete(t.id);
              }}
              type="button"
              aria-current={isActive ? "page" : undefined}
              aria-label={t.title}
              onClick={() => {
                if (isActive) return;

                setLastPortalTab(t.id);

                const targetPath = pathForTab(t.id);
                const currentSearch =
                  typeof window !== "undefined" ? window.location.search : "";

                armIndicatorMotion();
                activeIdRef.current = t.id;
                setActiveId(t.id);
                ensureMounted(t.id);

                // measure after DOM updates / font layout
                requestAnimationFrame(() => measure());

                // Optional: still warm Next’s cache for refresh/direct entry
                try {
                  router.prefetch(`${targetPath}${currentSearch}`);
                } catch {}

                // URL update without Next navigation
                pushPathOnly(`${targetPath}${currentSearch}`);
              }}
              style={tabBtn(isActive)}
              title={t.locked ? (t.lockedHint ?? "Locked") : t.title}
            >
              {t.title}
              {t.locked ? (
                <span aria-hidden style={{ marginLeft: 6, opacity: 0.65 }}>
                  🔒
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div style={{ minWidth: 0 }}>
        {tabs.map((t) => {
          if (!mountedIds.has(t.id)) return null;
          const isActive = t.id === activeId;

          return (
            <div
              key={t.id}
              style={{ display: isActive ? "block" : "none", minWidth: 0 }}
            >
              {t.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
