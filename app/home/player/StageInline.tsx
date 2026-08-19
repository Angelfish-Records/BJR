// web/app/home/player/StageInline.tsx
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "./PlayerState";
import StageCore from "./StageCore";
import StageTransportBar from "./StageTransportBar";
import StageNowPlayingBadge from "./stage/StageNowPlayingBadge";
import StagePerfHud from "./stage/StagePerfHud";
import { ensureLyricsForTrack } from "./lyrics/ensureLyricsForTrack";

function lockBodyScroll(lock: boolean) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const body = document.body;
  if (lock) {
    el.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.touchAction = "none";
  } else {
    el.style.overflow = "";
    body.style.overflow = "";
    body.style.touchAction = "";
  }
}

type WebkitFullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
};

type WebkitFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => void;
};

function getDeviceFullscreenElement(doc: Document): Element | null {
  const webkitDoc = doc as WebkitFullscreenDocument;
  return doc.fullscreenElement ?? webkitDoc.webkitFullscreenElement ?? null;
}

async function exitDeviceFullscreen(doc: Document): Promise<void> {
  if (!getDeviceFullscreenElement(doc)) return;

  if (typeof doc.exitFullscreen === "function") {
    await doc.exitFullscreen();
    return;
  }

  const webkitDoc = doc as WebkitFullscreenDocument;
  if (typeof webkitDoc.webkitExitFullscreen === "function") {
    webkitDoc.webkitExitFullscreen();
  }
}

async function requestDeviceFullscreen(element: HTMLElement): Promise<void> {
  if (typeof element.requestFullscreen === "function") {
    await element.requestFullscreen();
    return;
  }

  const webkitElement = element as WebkitFullscreenElement;
  if (typeof webkitElement.webkitRequestFullscreen === "function") {
    webkitElement.webkitRequestFullscreen();
    return;
  }

  throw new Error("Fullscreen API unavailable");
}

function useIsMobile(breakpointPx = 640) {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpointPx}px)`);
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, [breakpointPx]);

  return isMobile;
}

function useIsAdminBodyFlag() {
  const [isAdmin, setIsAdmin] = React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const body = document.body;
    const apply = () => setIsAdmin(body.dataset.afIsAdmin === "1");

    apply();

    const mo = new MutationObserver(() => apply());
    mo.observe(body, {
      attributes: true,
      attributeFilter: ["data-af-is-admin"],
    });

    return () => mo.disconnect();
  }, []);

  return isAdmin;
}

function useIdleCursor(active: boolean, timeoutMs: number) {
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    if (!active) {
      setHidden(false);
      return;
    }

    let timer: number | null = null;

    const reset = () => {
      setHidden(false);
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setHidden(true);
      }, timeoutMs);
    };

    reset();

    const onMove = () => reset();
    const onDown = () => reset();

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mousedown", onDown, { passive: true });

    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mousedown", onDown);
    };
  }, [active, timeoutMs]);

  return hidden;
}

function IconFullscreen(props: Readonly<{ size?: number }>) {
  const { size = 18 } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M8 4H5a1 1 0 0 0-1 1v3m0 8v3a1 1 0 0 0 1 1h3m8-16h3a1 1 0 0 1 1 1v3m0 8v3a1 1 0 0 1-1 1h-3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconClose(props: Readonly<{ size?: number }>) {
  const { size = 18 } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 6l12 12M18 6L6 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const ROUND_ICON_BUTTON_STYLE: React.CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 999,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(0,0,0,0.28)",
  color: "rgba(255,255,255,0.92)",
  display: "grid",
  placeItems: "center",
  boxShadow: "0 14px 30px rgba(0,0,0,0.22)",
};

const RoundIconButton = React.memo(function RoundIconButton(props: {
  label: string;
  title?: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { label, title, onClick, disabled, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        ...ROUND_ICON_BUTTON_STYLE,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
});

const FullscreenStageOverlay = React.memo(
  function FullscreenStageOverlay(props: {
    cursorHidden: boolean;
    isMobile: boolean;
    showPerfHud: boolean;
    stageMountRef: React.RefObject<HTMLDivElement | null>;
    deviceFullscreenRootRef: React.RefObject<HTMLDivElement | null>;
    deviceFullscreenActive: boolean;
    onToggleDeviceFullscreen: () => void;
    onClose: () => void;
  }) {
    const {
      cursorHidden,
      isMobile,
      showPerfHud,
      stageMountRef,
      deviceFullscreenRootRef,
      deviceFullscreenActive,
      onToggleDeviceFullscreen,
      onClose,
    } = props;

    return (
      <dialog
        open
        id="af-stage-overlay"
        aria-modal="true"
        aria-label="Stage"
        style={{
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100dvh",
          maxWidth: "none",
          maxHeight: "none",
          margin: 0,
          border: 0,
          zIndex: 200000,
          cursor: cursorHidden ? "none" : "default",
          background: "rgba(0,0,0,0.80)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          padding: 0,
          display: "grid",
          color: "inherit",
        }}
      >
        <div
          ref={deviceFullscreenRootRef}
          data-af-device-fullscreen-root="1"
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            minHeight: 0,
            background: "#000",
          }}
        >
          <div
            ref={stageMountRef}
            data-af-stage-presentation="fullscreen"
            style={{ position: "absolute", inset: 0 }}
          />

          {!isMobile && (
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 9,
                pointerEvents: "none",
              }}
            >
              <StageNowPlayingBadge />
            </div>
          )}

          {showPerfHud ? <StagePerfHud /> : null}

          <div
            aria-hidden
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              height: 64,
              background:
                "linear-gradient(180deg, rgba(0,0,0,0.55), rgba(0,0,0,0.22) 55%, rgba(0,0,0,0.00))",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "absolute",
              top: `calc(10px + env(safe-area-inset-top, 0px))`,
              right: `calc(10px + env(safe-area-inset-right, 0px))`,
              display: "flex",
              alignItems: "center",
              gap: 10,
              pointerEvents: "auto",
              zIndex: 50,
            }}
          >
            <RoundIconButton
              label={
                deviceFullscreenActive
                  ? "Exit device fullscreen"
                  : "Enter device fullscreen"
              }
              title={
                deviceFullscreenActive
                  ? "Exit device fullscreen"
                  : "Enter device fullscreen"
              }
              onClick={onToggleDeviceFullscreen}
            >
              <IconFullscreen />
            </RoundIconButton>

            <RoundIconButton label="Close" title="Close" onClick={onClose}>
              <IconClose />
            </RoundIconButton>
          </div>

          <StageTransportBar />
        </div>
      </dialog>
    );
  },
);

export default function StageInline(
  props: Readonly<{ height?: number }>,
) {
  const { height = 300 } = props;
  const p = usePlayer();

  // Lazy-load lyrics for the currently playing track when missing.
  const currentRecordingId = p.current?.recordingId ?? null;

  React.useEffect(() => {
    if (!currentRecordingId) return;

    const recordingId = currentRecordingId; // stable capture
    const ac = new AbortController();

    void ensureLyricsForTrack(recordingId, { signal: ac.signal });

    return () => ac.abort();
  }, [currentRecordingId]);

  const isMobile = useIsMobile(640);
  const isAdmin = useIsAdminBodyFlag();
  const inlineHeight = isMobile
    ? Math.max(140, Math.round(height * 0.5))
    : height;

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  // Keep one StageCore / VisualizerCanvas / WebGL engine alive for the entire
  // StageInline lifetime. The plain DOM host moves between presentation slots;
  // the React portal container never changes, so stateful theme history survives.
  const [stageHost, setStageHost] = React.useState<HTMLDivElement | null>(null);
  const inlineStageMountRef = React.useRef<HTMLDivElement | null>(null);
  const fullscreenStageMountRef = React.useRef<HTMLDivElement | null>(null);
  const deviceFullscreenRootRef = React.useRef<HTMLDivElement | null>(null);
  const [deviceFullscreenActive, setDeviceFullscreenActive] =
    React.useState(false);

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const host = document.createElement("div");
    host.dataset.afPersistentStageHost = "1";
    host.style.position = "absolute";
    host.style.inset = "0";
    host.style.width = "100%";
    host.style.height = "100%";
    host.style.minWidth = "0";
    host.style.minHeight = "0";

    setStageHost(host);

    return () => {
      host.remove();
    };
  }, []);

  const [open, setOpen] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!stageHost) return;

    const target = open
      ? fullscreenStageMountRef.current
      : inlineStageMountRef.current;

    if (!target || stageHost.parentElement === target) return;
    target.appendChild(stageHost);
  }, [open, stageHost]);
  const enableIdleCursor = open && !isMobile;
  const cursorHidden = useIdleCursor(enableIdleCursor, 3000);

  React.useEffect(() => {
    lockBodyScroll(open);
    return () => lockBodyScroll(false);
  }, [open]);

  React.useEffect(() => {
    if (!open) {
      setDeviceFullscreenActive(false);
      return;
    }
    if (typeof document === "undefined") return;

    const syncDeviceFullscreenState = () => {
      const fullscreenElement = getDeviceFullscreenElement(document);
      setDeviceFullscreenActive(
        fullscreenElement === deviceFullscreenRootRef.current,
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;

      // Genuine device fullscreen owns the first Escape. When the browser exits
      // that mode, fullscreenchange updates this state and the soft fullscreen
      // overlay remains open. A subsequent Escape closes the soft overlay.
      if (getDeviceFullscreenElement(document)) return;

      e.preventDefault();
      setOpen(false);
    };

    syncDeviceFullscreenState();

    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", syncDeviceFullscreenState);
    document.addEventListener(
      "webkitfullscreenchange",
      syncDeviceFullscreenState,
    );

    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener(
        "fullscreenchange",
        syncDeviceFullscreenState,
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        syncDeviceFullscreenState,
      );
    };
  }, [open]);

  const nothingPlaying = p.queue.length === 0 && !p.current?.recordingId;

  const handleOverlayClose = React.useCallback(() => {
    if (typeof document === "undefined") {
      setOpen(false);
      return;
    }

    void exitDeviceFullscreen(document).finally(() => setOpen(false));
  }, []);

  const handleOverlayToggleDeviceFullscreen = React.useCallback(() => {
    if (typeof document === "undefined") return;

    const fullscreenElement = getDeviceFullscreenElement(document);
    if (fullscreenElement) {
      void exitDeviceFullscreen(document);
      return;
    }

    const root = deviceFullscreenRootRef.current;
    if (!root) return;

    // Keep this call in the click's user-activation stack. The old code targeted
    // the <dialog> itself, which the Fullscreen API does not permit.
    void requestDeviceFullscreen(root).catch((error: unknown) => {
      console.warn("[StageInline] device fullscreen request failed", error);
    });
  }, []);

  const overlay =
    mounted && open
      ? createPortal(
          <FullscreenStageOverlay
            cursorHidden={cursorHidden}
            isMobile={isMobile}
            showPerfHud={isAdmin}
            stageMountRef={fullscreenStageMountRef}
            deviceFullscreenRootRef={deviceFullscreenRootRef}
            deviceFullscreenActive={deviceFullscreenActive}
            onToggleDeviceFullscreen={handleOverlayToggleDeviceFullscreen}
            onClose={handleOverlayClose}
          />,
          document.body,
        )
      : null;

  const stagePortal = stageHost
    ? createPortal(
        <StageCore
          variant={open ? "fullscreen" : "inline"}
          lyricsMode="embedded"
        />,
        stageHost,
      )
    : null;

  return (
    <>
      {stagePortal}

      <div
        style={{
          borderRadius: 18,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.05)",
          overflow: "hidden",
          height: inlineHeight,
          position: "relative",
        }}
      >
        <div
          ref={inlineStageMountRef}
          data-af-stage-presentation="inline"
          style={{ position: "absolute", inset: 0 }}
        />

        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 56,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.45), rgba(0,0,0,0.18) 55%, rgba(0,0,0,0.00))",
            pointerEvents: "none",
          }}
        />

        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            pointerEvents: "auto",
            zIndex: 50,
          }}
        >
          <RoundIconButton
            label="Open stage fullscreen"
            title={nothingPlaying ? "Nothing playing" : "Open fullscreen stage"}
            disabled={nothingPlaying}
            onClick={() => setOpen(true)}
          >
            <IconFullscreen />
          </RoundIconButton>
        </div>
      </div>

      {overlay}
    </>
  );
}
