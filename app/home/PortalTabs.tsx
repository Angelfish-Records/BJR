"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { setLastPortalTab } from "./portalLastTab";

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

  return decodeURIComponent(head);
}

function pathForTab(tabId: string) {
  const t = (tabId || "").trim().toLowerCase();
  if (!t || t === "player") return "/extras";
  if (t === "exegesis") return "/exegesis";
  return `/${encodeURIComponent(t)}`;
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

  // Keep router only if you still want prefetch warming.
  const router = useRouter();

  // You can keep usePathname for initial server->client consistency,
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

    const defaultValid =
      defaultTabId && tabs.some((t) => t.id === defaultTabId)
        ? defaultTabId
        : null;

    return validPath ?? defaultValid ?? firstId;
  }, [hasTabs, defaultTabId, tabs, stablePathname, resolveValid, firstId]);

  const [activeId, setActiveId] = React.useState<string | null>(initial);

  const [mountedIds, setMountedIds] = React.useState<Set<string>>(() => {
    const s = new Set<string>();
    if (initial) s.add(initial);
    return s;
  });

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

  // ✅ Initial hydrate alignment (keep)
  React.useEffect(() => {
    if (!initial) return;

    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      setActiveId(initial);
      return;
    }

    if (activeId !== initial) setActiveId(initial);
  }, [initial, activeId]);

  // ✅ NEW: listen to real URL changes (back/forward + our PATH_EVENT)
  React.useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromLocation = () => {
      const t = tabFromPathname(window.location.pathname);
      const v = resolveValid(t) ?? initial;
      if (v && v !== activeId) {
        setActiveId(v);
        setMountedIds((prev) => {
          const next = new Set(prev);
          next.add(v);
          return next;
        });
      }
      if (v) setLastPortalTab(v);
    };

    const onPop = () => syncFromLocation();
    const onCustom = () => syncFromLocation();

    window.addEventListener("popstate", onPop);
    window.addEventListener(PATH_EVENT, onCustom as EventListener);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener(PATH_EVENT, onCustom as EventListener);
    };
  }, [activeId, initial, resolveValid]);

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
      <div
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
      >
        {tabs.map((t) => {
          const isActive = t.id === active?.id;

          return (
            <button
              key={t.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              aria-label={t.title}
              onClick={() => {
                if (isActive) return;

                setLastPortalTab(t.id);

                const targetPath = pathForTab(t.id);
                const currentSearch =
                  typeof window !== "undefined" ? window.location.search : "";

                setActiveId(t.id);
                setMountedIds((prev) => {
                  const next = new Set(prev);
                  next.add(t.id);
                  return next;
                });

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
