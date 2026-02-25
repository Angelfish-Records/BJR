// web/app/home/PortalShell.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";

export type PortalPanelSpec = {
  id: string;
  label: string;
  content: React.ReactNode;
};

type HeaderCtx = {
  activePanelId: string;
  setPanel: (id: string) => void;
  panels: PortalPanelSpec[];
};

type HeaderRenderer = React.ReactNode | ((ctx: HeaderCtx) => React.ReactNode);

type Props = {
  panels: PortalPanelSpec[];
  defaultPanelId?: string;

  /**
   * Kept for compatibility with callers, but query-sync has been removed.
   * This prop is ignored.
   */
  syncToQueryParam?: boolean;

  onPanelChange?: (panelId: string) => void;

  /**
   * Optional controlled mode:
   * if provided, PortalShell will render this as the active panel
   * and will not own its own active state.
   */
  activePanelId?: string;

  /** Optional header row UI. */
  header?: HeaderRenderer;

  /**
   * Optional DOM id to portal header into (lets header span main+sidebar layout).
   * If not found, header renders inline at top of PortalShell.
   */
  headerPortalId?: string;

  // ✅ NEW: panels that should remain mounted even when inactive
  keepMountedPanelIds?: string[];
};

export default function PortalShell(props: Props) {
  const {
    panels,
    defaultPanelId,
    onPanelChange,
    activePanelId: controlledActive,
    header,
    headerPortalId = "af-portal-topbar-slot",
  } = props;

  const panelIds = React.useMemo(
    () => new Set(panels.map((p) => p.id)),
    [panels],
  );

  const isControlled =
    typeof controlledActive === "string" && controlledActive.length > 0;

  const [uncontrolledActive, setUncontrolledActive] = React.useState<string>(
    () => {
      const initial = defaultPanelId ?? panels[0]?.id ?? "portal";
      return panelIds.has(initial) ? initial : (panels[0]?.id ?? "portal");
    },
  );

  const active = isControlled
    ? (controlledActive as string)
    : uncontrolledActive;

  // Ensure we never sit on an invalid panel if panels change.
  React.useEffect(() => {
    if (panelIds.has(active)) return;

    const fallback =
      defaultPanelId && panelIds.has(defaultPanelId)
        ? defaultPanelId
        : panels[0]?.id;

    if (!fallback) return;

    if (!isControlled) setUncontrolledActive(fallback);
    onPanelChange?.(fallback);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelIds, panels, defaultPanelId]);

  const setPanel = React.useCallback(
    (id: string) => {
      if (!panelIds.has(id)) return;

      if (isControlled) {
        onPanelChange?.(id);
        return;
      }

      setUncontrolledActive(id);
      onPanelChange?.(id);
    },
    [isControlled, onPanelChange, panelIds],
  );

  const headerNode =
    typeof header === "function"
      ? header({ activePanelId: active, setPanel, panels })
      : (header ?? null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const headerPortalEl =
    mounted && headerPortalId ? document.getElementById(headerPortalId) : null;

  const keepMounted = React.useMemo(() => {
    const ids = props.keepMountedPanelIds ?? [];
    return new Set(ids.map((x) => (x ?? "").trim()).filter(Boolean));
  }, [props.keepMountedPanelIds]);

  return (
    <div
      className="portalShell"
      style={{ display: "grid", gap: 14, minWidth: 0, alignContent: "start" }}
    >
      {headerNode
        ? headerPortalEl
          ? createPortal(headerNode, headerPortalEl)
          : headerNode
        : null}

      <div style={{ display: "grid", minWidth: 0, justifyItems: "center" }}>
        <div
          className="portalShellInner"
          style={{
            width: "100%",
            maxWidth: "min(100%, 720px)",
            minWidth: 0,
            overflowX: "clip",
          }}
        >
          {panels.map((p) => {
            const isActive = p.id === active;
            const shouldKeep = keepMounted.has(p.id);

            // Default behavior: unmount inactive panels.
            if (!isActive && !shouldKeep) return null;

            const inertProps = !isActive
              ? ({
                  "aria-hidden": true,
                  tabIndex: -1,
                  style: {
                    display: "none",
                    pointerEvents: "none",
                    userSelect: "none",
                  },
                } as const)
              : ({ style: { display: "block" } } as const);

            return (
              <div key={p.id} {...inertProps}>
                {p.content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
