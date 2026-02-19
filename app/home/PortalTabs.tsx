// web/app/home/PortalTabs.tsx
"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useClientSearchParams } from "./urlState";

export type PortalTabSpec = {
  id: string;
  title: string;
  locked?: boolean;
  lockedHint?: string | null;
  content: React.ReactNode;
};

function tabFromHomePathname(pathname: string | null): string | null {
  const p = (pathname ?? "").split("?")[0] ?? "";
  const parts = p.split("/").filter(Boolean);
  if (parts[0] !== "home") return null;
  const t = (parts[1] ?? "").trim();
  if (!t) return null;
  return decodeURIComponent(t).toLowerCase();
}

function homePathForTab(tabId: string) {
  const t = (tabId || "").trim().toLowerCase();
  // PortalTabs should never navigate to player; but guard anyway.
  if (!t || t === "player") return "/home/extras";
  return `/home/${encodeURIComponent(t)}`;
}

export default function PortalTabs(props: {
  tabs: PortalTabSpec[];
  defaultTabId?: string | null;
  /** legacy only: interpret ?p=... and ?pt=... */
  legacyQueryParam?: string; // default 'p'
}) {
  const { tabs, defaultTabId = null, legacyQueryParam = "p" } = props;

  // ✅ hooks must come first, always
  const router = useRouter();
  const pathname = usePathname();
  const sp = useClientSearchParams();

  const hasTabs = tabs.length > 0;
  const firstId = (hasTabs ? tabs[0]?.id : null) ?? null;

  const pathTab = tabFromHomePathname(pathname);

  const legacyPt = (sp.get("pt") ?? "").trim().toLowerCase() || null;
  const legacyP = (sp.get(legacyQueryParam) ?? "").trim().toLowerCase() || null;

  const resolveValid = React.useCallback(
    (candidate: string | null): string | null => {
      if (!candidate) return null;
      if (candidate === "player") return null; // reserved surface
      return tabs.some((t) => t.id === candidate) ? candidate : null;
    },
    [tabs],
  );

  const validPath = resolveValid(pathTab);
  const validLegacy = resolveValid(legacyP) ?? resolveValid(legacyPt);

  const initial = React.useMemo(() => {
    if (!hasTabs) return null;

    const defaultValid =
      defaultTabId && tabs.some((t) => t.id === defaultTabId)
        ? defaultTabId
        : null;

    return validPath ?? validLegacy ?? defaultValid ?? firstId;
  }, [hasTabs, defaultTabId, tabs, validPath, validLegacy, firstId]);

  const [activeId, setActiveId] = React.useState<string | null>(initial);

  // keep local state aligned
  React.useEffect(() => {
    if (!initial) return;
    if (activeId !== initial) setActiveId(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  // promote legacy query -> path (replace) when we’re not already path-native
  React.useEffect(() => {
    if (!initial) return;
    if (validPath) return;
    if (!validLegacy) return;
    router.replace(homePathForTab(validLegacy));
  }, [initial, validPath, validLegacy, router]);

  const active = React.useMemo(() => {
    if (!hasTabs) return null;
    return tabs.find((t) => t.id === activeId) ?? tabs[0] ?? null;
  }, [hasTabs, tabs, activeId]);

  const wrap: React.CSSProperties = { display: "grid", gap: 12, minWidth: 0 };

  // indicator/rail measurement refs
  const rowRef = React.useRef<HTMLDivElement | null>(null);
  const btnRefs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  const [indicator, setIndicator] = React.useState<{ x: number; w: number } | null>(
    null,
  );
  const [rail, setRail] = React.useState<{ x: number; w: number } | null>(null);

  const measure = React.useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    if (!hasTabs) return;

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

    const id = active?.id;
    if (!id) return;
    const btn = btnRefs.current.get(id) ?? null;
    if (!btn) return;

    const b = btn.getBoundingClientRect();
    const x = b.left - rowRect.left + row.scrollLeft;
    const w = b.width;

    setIndicator({ x: r(x), w: r(w) });
  }, [hasTabs, tabs, active?.id]);

  React.useLayoutEffect(() => {
    measure();
  }, [measure]);

  React.useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [measure]);

  const tabRow: React.CSSProperties = {
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
  };

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

  // ✅ now it’s safe to return null (hooks already executed)
  if (!hasTabs) return null;

  return (
    <div style={wrap}>
      <style>{`
        .afPortalTabRow::-webkit-scrollbar { display: none; height: 0; }
      `}</style>

      <div
        ref={rowRef}
        className="afPortalTabRow"
        style={tabRow}
        onScroll={() => measure()}
      >
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
            transition: "left 220ms ease, width 220ms ease, opacity 120ms ease",
          }}
        />

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
            transition:
              "transform 220ms ease, width 220ms ease, opacity 120ms ease",
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
                setActiveId(t.id);
                router.push(homePathForTab(t.id));
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

      <div style={{ minWidth: 0 }}>{active?.content}</div>
    </div>
  );
}