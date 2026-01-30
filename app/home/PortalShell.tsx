// web/app/home/PortalShell.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { replaceQuery, useClientSearchParams } from "./urlState";

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
  /** If true, mirrors selected panel into the URL query param */
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
};

const PANEL_QS_KEY = "p"; // canonical (but you can disable syncToQueryParam)
const LEGACY_PANEL_QS_KEY = "panel"; // deprecated

export default function PortalShell(props: Props) {
  const {
    panels,
    defaultPanelId,
    syncToQueryParam = true,
    onPanelChange,
    activePanelId: controlledActive,
    header,
    headerPortalId = "af-portal-topbar-slot",
  } = props;

  const sp = useClientSearchParams();
  const panelIds = React.useMemo(
    () => new Set(panels.map((p) => p.id)),
    [panels],
  );
  const isControlled =
    typeof controlledActive === "string" && controlledActive.length > 0;

  const readPanelFromQuery = React.useCallback(() => {
    if (!syncToQueryParam) return null;
    return sp.get(PANEL_QS_KEY) ?? sp.get(LEGACY_PANEL_QS_KEY);
  }, [sp, syncToQueryParam]);

  const writePanelToQuery = React.useCallback(
    (id: string) => {
      if (!syncToQueryParam) return;
      replaceQuery({ [PANEL_QS_KEY]: id, [LEGACY_PANEL_QS_KEY]: null });
    },
    [syncToQueryParam],
  );

  const [uncontrolledActive, setUncontrolledActive] = React.useState<string>(
    () => {
      const fromQuery = readPanelFromQuery();
      const initial = fromQuery ?? defaultPanelId ?? panels[0]?.id ?? "portal";
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
      writePanelToQuery(id);
    },
    [isControlled, onPanelChange, panelIds, writePanelToQuery],
  );

  // Uncontrolled: respond to back/forward (query changes) without loops.
  React.useEffect(() => {
    if (!syncToQueryParam) return;
    if (isControlled) return;

    const q = readPanelFromQuery();
    if (!q) return;
    if (!panelIds.has(q)) return;
    if (q === active) return;

    setUncontrolledActive(q);
    onPanelChange?.(q);
  }, [
    active,
    isControlled,
    onPanelChange,
    panelIds,
    readPanelFromQuery,
    syncToQueryParam,
  ]);

  // Controlled: mirror active into URL (single direction).
  React.useEffect(() => {
    if (!syncToQueryParam) return;
    if (!isControlled) return;

    const current = readPanelFromQuery();
    if (current === active) return;

    writePanelToQuery(active);
  }, [
    active,
    isControlled,
    readPanelFromQuery,
    syncToQueryParam,
    writePanelToQuery,
  ]);

  const headerNode =
    typeof header === "function"
      ? header({ activePanelId: active, setPanel, panels })
      : (header ?? null);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  const headerPortalEl =
    mounted && headerPortalId ? document.getElementById(headerPortalId) : null;

  // const DOCK_H = 84

  const activePanel = panels.find((p) => p.id === active) ?? panels[0] ?? null;

  return (
    <div
      className="portalShell"
      style={{
        display: "grid",
        gap: 14,
        minWidth: 0,
        alignContent: "start",
        // paddingBottom: `calc(${DOCK_H}px + env(safe-area-inset-bottom, 0px))`,
      }}
    >
      {headerNode
        ? headerPortalEl
          ? createPortal(headerNode, headerPortalEl)
          : headerNode
        : null}

      {/* CRITICAL: render ONLY the active panel so inactive UI can't mutate query params */}
      <div
        style={{
          display: "grid",
          minWidth: 0,
          justifyItems: "center", // 🔑 establish symmetric rail
        }}
      >
        {activePanel ? (
          <div
            style={{
              width: "100%",
              maxWidth: "min(100%, 720px)", // or whatever your intended portal width is
              minWidth: 0,
              overflowX: "clip",
            }}
          >
            {activePanel.content}
          </div>
        ) : null}
      </div>
    </div>
  );
}
