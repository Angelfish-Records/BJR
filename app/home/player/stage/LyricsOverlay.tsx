// web/app/home/player/stage/LyricsOverlay.tsx
"use client";

import React from "react";
import { mediaSurface } from "../mediaSurface";
import { useRouter } from "next/navigation";
import { appendPersistentSecondaryQueryToHref } from "@/app/home/urlState";
import type { LyricCue } from "@/lib/types";
import { isParaBreakCue } from "@/app/home/player/lyrics/lyricBreaks";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function findActiveIndex(cues: LyricCue[], tMs: number) {
  let lo = 0;
  let hi = cues.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = cues[mid]?.tMs ?? 0;
    if (v <= tMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

const EXEGESIS_HASH_NAV_EVENT = "af:exegesis-hash-navigation";
const EXEGESIS_PENDING_LINE_KEY = "af:exegesis-pending-line";

function writePendingExegesisLine(lineKey: string) {
  globalThis.window.sessionStorage.setItem(
    EXEGESIS_PENDING_LINE_KEY,
    JSON.stringify({ lineKey }),
  );
}

type LyricsOverlayProps = Readonly<{
  recordingId?: string | null;
  displayId?: string | null;
  cues: LyricCue[] | null;
  offsetMs?: number;
  onSeek?: (tMs: number) => void;
  variant?: "inline" | "stage";
  /** Reserve a footer zone (e.g. StageTransportBar height, excluding safe-area inset). */
  reservedBottomPx?: number;
}>;

type OverlayVariantLayout = Readonly<{
  padTop: number;
  padBottomBase: number;
  lineFontSize: string;
  fadeTopPx: number;
  fadeBottomPx: number;
  kneePx: number;
  spotlightW: number;
  spotlightH: number;
  spotlightAlpha: number;
  sidePadPx: number;
  lineMaxPx: number;
  discourseYOffsetPx: number;
  rootPadding: number;
  fadeAnimation: string;
  scrollerGap: number;
  scrollerWillChange: string;
}>;

const INLINE_LAYOUT: OverlayVariantLayout = {
  padTop: 16,
  padBottomBase: 20,
  lineFontSize: "clamp(11px, 1.15vw, 13px)",
  fadeTopPx: 22,
  fadeBottomPx: 26,
  kneePx: 10,
  spotlightW: 78,
  spotlightH: 40,
  spotlightAlpha: 0.4,
  sidePadPx: 10,
  lineMaxPx: 820,
  discourseYOffsetPx: 1,
  rootPadding: 8,
  fadeAnimation: "afLyricsFadeIn 380ms ease-out forwards",
  scrollerGap: 5,
  scrollerWillChange: "transform",
};

const STAGE_LAYOUT: OverlayVariantLayout = {
  padTop: 24,
  padBottomBase: 28,
  lineFontSize: "clamp(18px, 2.2vw, 26px)",
  fadeTopPx: 72,
  fadeBottomPx: 86,
  kneePx: 22,
  spotlightW: 74,
  spotlightH: 44,
  spotlightAlpha: 0.52,
  sidePadPx: 18,
  lineMaxPx: 980,
  discourseYOffsetPx: 0,
  rootPadding: 14,
  fadeAnimation: "afLyricsFadeIn 520ms ease-out forwards",
  scrollerGap: 9,
  scrollerWillChange: "transform, -webkit-mask-image, mask-image",
};

function overlayVariantLayout(isInline: boolean): OverlayVariantLayout {
  return isInline ? INLINE_LAYOUT : STAGE_LAYOUT;
}

type OverlayRenderLayout = Readonly<{
  styleVars: React.CSSProperties & Record<`--af-${string}`, string>;
  padBottom: string;
  mask: string | undefined;
}>;

function buildOverlayRenderLayout(
  layout: OverlayVariantLayout,
  reservedBottomPx: number,
): OverlayRenderLayout {
  const reservedBottom = Math.max(0, Math.floor(reservedBottomPx));
  const lineMax = `${layout.lineMaxPx}px`;

  const styleVars: React.CSSProperties & Record<`--af-${string}`, string> = {
    "--af-lyrics-side-pad": `${layout.sidePadPx}px`,
    "--af-lyrics-line-max": lineMax,
    "--af-discourse-y": `${layout.discourseYOffsetPx}px`,
    "--af-lyrics-reserved-bottom": `${reservedBottom}px`,
    "--af-lyrics-fade-top": `${layout.fadeTopPx}px`,
    "--af-lyrics-fade-bottom": `${layout.fadeBottomPx}px`,
    "--af-lyrics-knee": `${layout.kneePx}px`,
  };

  const padBottom = `calc(${layout.padBottomBase}px + var(--af-lyrics-reserved-bottom) + env(safe-area-inset-bottom, 0px))`;

  if (layout === INLINE_LAYOUT) {
    return { styleVars, padBottom, mask: undefined };
  }

  const bottomClip = `calc(100% - (var(--af-lyrics-reserved-bottom) + env(safe-area-inset-bottom, 0px)))`;
  const mask = `linear-gradient(
        to bottom,
        rgba(255,255,255,0) 0px,
        rgba(255,255,255,0.60) calc(var(--af-lyrics-fade-top) - var(--af-lyrics-knee)),
        rgba(255,255,255,0.92) calc(var(--af-lyrics-fade-top) - 8px),
        rgba(255,255,255,1) var(--af-lyrics-fade-top),

        rgba(255,255,255,1) calc(${bottomClip} - var(--af-lyrics-fade-bottom)),
        rgba(255,255,255,0.92) calc(${bottomClip} - calc(var(--af-lyrics-fade-bottom) - 8px)),
        rgba(255,255,255,0.60) calc(${bottomClip} - calc(var(--af-lyrics-fade-bottom) - var(--af-lyrics-knee))),
        rgba(255,255,255,0) ${bottomClip}
      )`;

  return { styleVars, padBottom, mask };
}

type LyricRowVariantLayout = Readonly<{
  paragraphBreakHeight: number;
  textShadow: string;
  lineHeight: number;
  scrimInset: string;
  iconGutter: number;
  discourseRight: number;
  seekWidth: string;
  seekMarginLeft: number;
  seekMarginRight: number;
  activeTransform: string;
  idleTranslateY: number;
  idleScale: number;
  textFilter: string;
}>;

const INLINE_ROW_LAYOUT: LyricRowVariantLayout = {
  paragraphBreakHeight: 10,
  textShadow:
    "0 1px 14px rgba(0,0,0,0.70), 0 0 24px rgba(0,0,0,0.35)",
  lineHeight: 1.25,
  scrimInset: "-6px -10px",
  iconGutter: 34,
  discourseRight: -10,
  seekWidth: "calc(100% - 34px)",
  seekMarginLeft: 17,
  seekMarginRight: -17,
  activeTransform: "scale(1.006)",
  idleTranslateY: 0.25,
  idleScale: 0.012,
  textFilter: "none",
};

const STAGE_ROW_LAYOUT: LyricRowVariantLayout = {
  paragraphBreakHeight: 14,
  textShadow:
    "0 2px 22px rgba(0,0,0,0.78), 0 0 34px rgba(0,0,0,0.35)",
  lineHeight: 1.22,
  scrimInset: "-10px -16px",
  iconGutter: 0,
  discourseRight: 0,
  seekWidth: "100%",
  seekMarginLeft: 0,
  seekMarginRight: 0,
  activeTransform: "translateZ(0) scale(1.02)",
  idleTranslateY: 0.55,
  idleScale: 0.02,
  textFilter: "blur(calc((1 - var(--af-focus, 0)) * 0.12px))",
};

function lyricRowVariantLayout(isInline: boolean): LyricRowVariantLayout {
  return isInline ? INLINE_ROW_LAYOUT : STAGE_ROW_LAYOUT;
}

function lyricOpacity(
  activeIdx: number,
  isActive: boolean,
  isInline: boolean,
): number | string {
  if (activeIdx < 0) {
    return isInline ? 0.6 : 0.5;
  }
  if (isActive) return 1;
  return "calc(0.18 + var(--af-focus, 0) * 0.82)";
}

function lyricTransform(
  isActive: boolean,
  layout: LyricRowVariantLayout,
): string {
  if (isActive) return layout.activeTransform;

  return `translateZ(0)
                         translateY(calc((1 - var(--af-focus, 0)) * ${layout.idleTranslateY}px))
                         scale(calc(1 + var(--af-focus, 0) * ${layout.idleScale}))`;
}

function dataFlag(value: boolean): "1" | "0" {
  return value ? "1" : "0";
}

function lyricRowKey(cue: LyricCue, idx: number): string {
  if (isParaBreakCue(cue)) return `br-${cue.tMs}-${idx}`;
  return `${cue.tMs}-${idx}`;
}

type LyricScrimProps = Readonly<{
  isInline: boolean;
  isActive: boolean;
  scrimInset: string;
}>;

function LyricScrim({
  isInline,
  isActive,
  scrimInset,
}: LyricScrimProps) {
  if (isInline) {
    return (
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: scrimInset,
          borderRadius: 999,
          pointerEvents: "none",
          background:
            "rgba(0,0,0, calc(0.08 + var(--af-focus, 0) * 0.26))",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          WebkitMaskImage:
            "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
          maskImage:
            "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
          opacity: "calc(var(--af-focus, 0) * 0.98)",
        }}
      />
    );
  }

  if (!isActive) return null;

  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset: scrimInset,
        borderRadius: 999,
        pointerEvents: "none",
        background: "rgba(0,0,0,0.18)",
        WebkitMaskImage:
          "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
        maskImage:
          "radial-gradient(closest-side at 50% 50%, rgba(0,0,0,1) 62%, rgba(0,0,0,0) 100%)",
        opacity: 0.95,
      }}
    />
  );
}

type ParaBreakRowProps = Readonly<{
  cue: LyricCue;
  idx: number;
  isInline: boolean;
  setLineNode: (idx: number, element: HTMLElement | null) => void;
}>;

function ParaBreakRow({
  cue,
  idx,
  isInline,
  setLineNode,
}: ParaBreakRowProps) {
  const layout = lyricRowVariantLayout(isInline);

  return (
    <div
      key={`br-${cue.tMs}-${idx}`}
      ref={(element: HTMLDivElement | null) => setLineNode(idx, element)}
      aria-hidden="true"
      data-lyric-idx={idx}
      className="af-lyric-row"
      data-af-inline={dataFlag(isInline)}
      style={{
        width: "100%",
        minWidth: 0,
        display: "block",
        height: layout.paragraphBreakHeight,
      }}
    />
  );
}

type DiscourseButtonProps = Readonly<{
  cue: LyricCue;
  isInline: boolean;
  showDiscourse: boolean;
  hasExegesisPath: boolean;
  layout: LyricRowVariantLayout;
  onOpenExegesis: (cue: LyricCue) => void;
}>;

function DiscourseButton({
  cue,
  isInline,
  showDiscourse,
  hasExegesisPath,
  layout,
  onOpenExegesis,
}: DiscourseButtonProps) {
  const transformScale = showDiscourse ? "scale(1)" : "scale(0.98)";
  const cursor = hasExegesisPath ? "pointer" : "default";
  const pointerEvents = hasExegesisPath ? "auto" : "none";
  const opacity = showDiscourse && hasExegesisPath ? 1 : 0;

  return (
    <button
      className="af-discourse-btn"
      type="button"
      aria-label="Open exegesis"
      title="Discuss this line"
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenExegesis(cue);
      }}
      style={{
        position: "absolute",
        right: layout.discourseRight,
        top: "50%",
        transform: `translateY(calc(-50% + var(--af-discourse-y, 0px))) ${transformScale}`,
        width: 26,
        height: 26,
        borderRadius: 0,
        border: 0,
        background: "transparent",
        color: "rgba(255,255,255,0.86)",
        display: isInline ? "grid" : "none",
        placeItems: "center",
        lineHeight: 0,
        cursor,
        pointerEvents,
        zIndex: 3,
        opacity,
        overflow: "visible",
        transition:
          "opacity 140ms ease, transform 160ms ease, filter 160ms ease",
      }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 512 512"
        width={isInline ? 16 : 18}
        height={isInline ? 16 : 18}
        style={{ display: "block" }}
      >
        <g>
          <path
            fill="currentColor"
            d="M443.245,152.171h-87.072v-42.546c-0.008-37.98-30.774-68.746-68.754-68.754H68.755
      C30.774,40.879,0.008,71.644,0,109.625v163.01c0.008,37.581,30.146,68.053,67.581,68.697L55.98,399.333
      c-1.353,6.774,1.565,13.63,7.378,17.348c5.821,3.717,13.264,3.481,18.84-0.587l102.227-74.706h27.236
      c1.842,36.342,31.776,65.241,68.575,65.249h75.318l83.844,61.271c5.576,4.068,13.019,4.305,18.839,0.587
      c5.812-3.717,8.731-10.573,7.378-17.348l-9.163-45.806c31.662-6.171,55.54-34.002,55.548-67.458V220.925
      C511.992,182.953,481.234,152.179,443.245,152.171z M178.97,307.998c-3.57,0-6.97,1.108-9.847,3.212l-71.992,52.613l7.166-35.852
      c0.987-4.916-0.286-9.986-3.456-13.859c-3.18-3.88-7.9-6.114-12.913-6.114H68.755c-9.816-0.008-18.554-3.93-25.011-10.361
      c-6.424-6.449-10.345-15.188-10.353-25.002v-163.01c0.008-9.815,3.93-18.554,10.353-25.011
      c6.457-6.424,15.195-10.344,25.011-10.353h218.664c9.814,0.008,18.554,3.929,25.002,10.353
      c6.432,6.457,10.353,15.196,10.361,25.011v42.546h-42.546c-37.98,0.008-68.747,30.774-68.754,68.754v87.073H178.97z
      M478.609,337.883c-0.008,9.823-3.929,18.554-10.354,25.011c-6.456,6.424-15.187,10.344-25.01,10.353h-6.896
      c-5.014,0-9.734,2.234-12.913,6.114c-3.18,3.873-4.443,8.943-3.457,13.859l4.484,22.418l-53.608-39.178
      c-2.878-2.104-6.278-3.212-9.848-3.212h-80.771c-9.815-0.008-18.554-3.929-25.011-10.361c-6.424-6.449-10.345-15.188-10.353-25.002
      v-13.19V220.925c0.008-9.823,3.929-18.554,10.353-25.002c6.456-6.432,15.196-10.353,25.011-10.361h59.241h103.768
      c9.824,0.008,18.554,3.929,25.01,10.353c6.425,6.457,10.346,15.188,10.354,25.011V337.883z"
          />
        </g>
      </svg>
    </button>
  );
}

type LyricSeekButtonProps = Readonly<{
  cue: LyricCue;
  activeIdx: number;
  isActive: boolean;
  isInline: boolean;
  lineFontSize: string;
  layout: LyricRowVariantLayout;
  onPointerDown: () => void;
  onPointerEnd: () => void;
  onSeekClick: (cue: LyricCue) => void;
  canSeek: boolean;
}>;

function LyricSeekButton({
  cue,
  activeIdx,
  isActive,
  isInline,
  lineFontSize,
  layout,
  onPointerDown,
  onPointerEnd,
  onSeekClick,
  canSeek,
}: LyricSeekButtonProps) {
  const opacity = lyricOpacity(activeIdx, isActive, isInline);
  const transform = lyricTransform(isActive, layout);
  const cursor = canSeek ? "pointer" : "default";

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={onPointerEnd}
      onClick={() => onSeekClick(cue)}
      title={isInline ? cue.text : undefined}
      style={{
        border: 0,
        background: "transparent",
        padding: 0,
        width: layout.seekWidth,
        marginLeft: layout.seekMarginLeft,
        marginRight: layout.seekMarginRight,
        minWidth: 0,
        display: "grid",
        justifyItems: "center",
        alignItems: "center",
        position: "relative",
        zIndex: 1,
        color: "rgba(255,255,255,0.94)",
        fontSize: lineFontSize,
        lineHeight: layout.lineHeight,
        letterSpacing: 0.2,
        textAlign: "center",
        opacity,
        fontWeight: isActive
          ? 780
          : "calc(650 + var(--af-focus, 0) * 70)",
        transition:
          "opacity 120ms linear, transform 140ms ease, filter 140ms ease",
        transform,
        willChange: "transform, opacity",
        cursor,
        userSelect: "none",
        WebkitTapHighlightColor: "transparent",
      }}
    >
      <span
        style={{
          position: "relative",
          display: "inline-block",
          maxWidth: "100%",
          minWidth: 0,
          whiteSpace: "normal",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
        }}
      >
        <LyricScrim
          isInline={isInline}
          isActive={isActive}
          scrimInset={layout.scrimInset}
        />

        <span
          className="af-lyric-text"
          style={{
            position: "relative",
            zIndex: 1,
            textShadow: layout.textShadow,
            filter: layout.textFilter,
            WebkitFontSmoothing: "antialiased",
            MozOsxFontSmoothing: "grayscale",
          }}
        >
          {cue.text}
        </span>
      </span>
    </button>
  );
}

type LyricRowProps = Readonly<{
  cue: LyricCue;
  idx: number;
  activeIdx: number;
  hoverIdx: number;
  revealIdx: number;
  isInline: boolean;
  exegesisPathToken: string | null;
  lineFontSize: string;
  setLineNode: (idx: number, element: HTMLElement | null) => void;
  onMouseEnter: (idx: number) => void;
  onMouseLeave: (idx: number) => void;
  onOpenExegesis: (cue: LyricCue) => void;
  onPointerDown: (idx: number) => void;
  onPointerEnd: () => void;
  onSeekClick: (cue: LyricCue) => void;
  canSeek: boolean;
}>;

function LyricRow({
  cue,
  idx,
  activeIdx,
  hoverIdx,
  revealIdx,
  isInline,
  exegesisPathToken,
  lineFontSize,
  setLineNode,
  onMouseEnter,
  onMouseLeave,
  onOpenExegesis,
  onPointerDown,
  onPointerEnd,
  onSeekClick,
  canSeek,
}: LyricRowProps) {
  if (isParaBreakCue(cue)) {
    return (
      <ParaBreakRow
        cue={cue}
        idx={idx}
        isInline={isInline}
        setLineNode={setLineNode}
      />
    );
  }

  const isActive = idx === activeIdx;
  const showDiscourse =
    isInline && (idx === hoverIdx || idx === revealIdx);
  const hasExegesisPath = Boolean(exegesisPathToken);
  const layout = lyricRowVariantLayout(isInline);

  return (
    <div
      key={`${cue.tMs}-${idx}`}
      ref={(element: HTMLDivElement | null) => setLineNode(idx, element)}
      data-lyric-idx={idx}
      className="af-lyric-row"
      data-af-inline={dataFlag(isInline)}
      data-af-has-track={dataFlag(hasExegesisPath)}
      data-af-reveal={dataFlag(idx === revealIdx)}
      data-af-lyric-real="1"
      onMouseEnter={() => onMouseEnter(idx)}
      onMouseLeave={() => onMouseLeave(idx)}
      style={{
        position: "relative",
        width: "100%",
        minWidth: 0,
        display: "grid",
        justifyItems: "center",
        alignItems: "center",
        paddingTop: isInline ? 2 : 4,
        paddingBottom: isInline ? 2 : 4,
        paddingRight: layout.iconGutter,
      }}
    >
      <DiscourseButton
        cue={cue}
        isInline={isInline}
        showDiscourse={showDiscourse}
        hasExegesisPath={hasExegesisPath}
        layout={layout}
        onOpenExegesis={onOpenExegesis}
      />

      <LyricSeekButton
        cue={cue}
        activeIdx={activeIdx}
        isActive={isActive}
        isInline={isInline}
        lineFontSize={lineFontSize}
        layout={layout}
        onPointerDown={() => onPointerDown(idx)}
        onPointerEnd={onPointerEnd}
        onSeekClick={onSeekClick}
        canSeek={canSeek}
      />
    </div>
  );
}

export default function LyricsOverlay(props: LyricsOverlayProps) {
  const {
    recordingId: recordingIdRaw = null,
    displayId: displayIdRaw = null,
    cues,
    offsetMs = 0,
    onSeek,
    variant = "stage",
    reservedBottomPx = 0,
  } = props;

  const router = useRouter();

  const recordingId = (recordingIdRaw ?? "").trim() || null;
  const displayId = (displayIdRaw ?? "").trim() || null;
  const exegesisPathToken = displayId || recordingId;
  const isInline = variant === "inline";

  const viewportRef = React.useRef<HTMLDivElement | null>(null);
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);
  const lineNodeRefs = React.useRef<Array<HTMLElement | null>>([]);
  const rafTimeRef = React.useRef<number | null>(null);

  // Focus is DOM-driven (CSS vars) to avoid React re-renders during scroll.
  const focusRafRef = React.useRef<number | null>(null);
  const lastFocusCenterRef = React.useRef<number>(-1);

  const [activeIdx, setActiveIdx] = React.useState(-1);
  const activeIdxRef = React.useRef(-1);

  const [edgeSpacers, setEdgeSpacers] = React.useState({
    topPx: 0,
    bottomPx: 0,
  });

  // Padding: keep breathing room so lines “emerge” into focus.
  // Edge spacers are measured after render so the first/last lyric can reach
  // the same reading hotspot as every middle lyric.
  const variantLayout = overlayVariantLayout(isInline);
  const { padTop, padBottomBase } = variantLayout;
  const readingCenterRatio = 0.44;

  // When user scrolls manually, pause auto-follow briefly.
  const userScrollUntilRef = React.useRef<number>(0);

  // Prevent auto-follow from disabling itself: smooth scroll triggers onScroll too.
  const isAutoScrollingRef = React.useRef(false);
  const autoScrollClearRef = React.useRef<number | null>(null);

  const [hoverIdx, setHoverIdx] = React.useState<number>(-1);
  const [revealIdx, setRevealIdx] = React.useState<number>(-1);

  const pressTimerRef = React.useRef<number | null>(null);
  const pressFiredRef = React.useRef(false);
  const revealClearRef = React.useRef<number | null>(null);

  function clearPressTimer() {
    if (pressTimerRef.current != null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }

  function clearRevealTimer() {
    if (revealClearRef.current != null) {
      window.clearTimeout(revealClearRef.current);
      revealClearRef.current = null;
    }
  }

  function revealForTouch(idx: number) {
    setRevealIdx(idx);
    clearRevealTimer();
    // Auto-hide after a short window so it doesn’t linger forever on mobile.
    revealClearRef.current = window.setTimeout(() => {
      setRevealIdx((cur) => (cur === idx ? -1 : cur));
    }, 2200);
  }

  function setLineNode(idx: number, element: HTMLElement | null) {
    lineNodeRefs.current[idx] = element;
  }

  function handleLyricMouseEnter(idx: number) {
    if (!isInline) return;
    setHoverIdx(idx);
  }

  function handleLyricMouseLeave(idx: number) {
    if (!isInline) return;
    setHoverIdx((cur) => (cur === idx ? -1 : cur));
  }

  function handleLyricPointerDown(idx: number) {
    pressFiredRef.current = false;
    clearPressTimer();

    if (!isInline || !exegesisPathToken) return;

    pressTimerRef.current = window.setTimeout(() => {
      pressFiredRef.current = true;
      revealForTouch(idx);
    }, 360);
  }

  function handleLyricPointerEnd() {
    clearPressTimer();
  }

  function handleLyricSeek(cue: LyricCue) {
    // If long-press fired, swallow click so it doesn’t seek.
    if (pressFiredRef.current) return;
    if (!onSeek) return;

    userScrollUntilRef.current = Date.now() + 900;
    onSeek(cue.tMs);
  }

  React.useEffect(() => {
    return () => {
      clearPressTimer();
      clearRevealTimer();
    };
  }, []);

  function openExegesis(cue: LyricCue) {
    if (!exegesisPathToken) return;

    const lineKey = cue.lineKey;

    const path = appendPersistentSecondaryQueryToHref(
      `/exegesis/${encodeURIComponent(exegesisPathToken)}` +
        `#l=${encodeURIComponent(lineKey)}`,
    );

    writePendingExegesisLine(lineKey);

    router.push(path, { scroll: false });

    const detail = {
      lineKey,
      rootId: "",
      commentId: "",
    };

    globalThis.window.dispatchEvent(
      new CustomEvent(EXEGESIS_HASH_NAV_EVENT, { detail }),
    );

    globalThis.window.setTimeout(() => {
      globalThis.window.dispatchEvent(
        new CustomEvent(EXEGESIS_HASH_NAV_EVENT, { detail }),
      );
    }, 0);
  }

  function handleOpenExegesis(cue: LyricCue) {
    clearPressTimer();
    clearRevealTimer();
    setRevealIdx(-1);
    openExegesis(cue);
  }

  // Fade-in whenever a new lyrics set becomes available.
  const [fadeInKey, setFadeInKey] = React.useState(0);

  React.useEffect(() => {
    if (!cues || cues.length === 0) return;
    // bump key so CSS animation restarts on new cues
    setFadeInKey((k) => k + 1);
  }, [cues]);

  React.useEffect(() => {
    activeIdxRef.current = activeIdx;
  }, [activeIdx]);

  // Reset on cue change.
  React.useEffect(() => {
    setActiveIdx(-1);
    setHoverIdx(-1);
    setRevealIdx(-1);
    activeIdxRef.current = -1;
    userScrollUntilRef.current = 0;
    lastFocusCenterRef.current = -1;
    isAutoScrollingRef.current = false;

    if (autoScrollClearRef.current)
      window.clearTimeout(autoScrollClearRef.current);
    autoScrollClearRef.current = null;

    const sc = scrollerRef.current;
    if (sc) {
      requestAnimationFrame(() => {
        const firstLine = sc.querySelector<HTMLElement>('[data-lyric-idx="0"]');
        const viewport = viewportRef.current;
        if (!firstLine || !viewport) {
          sc.scrollTop = 0;
          return;
        }

        const targetY =
          firstLine.offsetTop +
          firstLine.offsetHeight / 2 -
          viewport.clientHeight * 0.44;

        sc.scrollTop = Math.max(0, Math.round(targetY));
      });
    }

    lineNodeRefs.current.forEach((el) => {
      el?.style.removeProperty("--af-focus");
    });
    lineNodeRefs.current.length = cues?.length ?? 0;
  }, [cues]);

  // RAF: compute active index from mediaSurface time
  React.useEffect(() => {
    if (!cues || cues.length === 0) return;

    const step = () => {
      const tMs = mediaSurface.getTimeMs() + offsetMs;
      const idx = findActiveIndex(cues, tMs);

      if (idx !== activeIdxRef.current) {
        activeIdxRef.current = idx;
        setActiveIdx(idx);
      }

      rafTimeRef.current = window.requestAnimationFrame(step);
    };

    rafTimeRef.current = window.requestAnimationFrame(step);
    return () => {
      if (rafTimeRef.current) window.cancelAnimationFrame(rafTimeRef.current);
      rafTimeRef.current = null;
    };
  }, [cues, offsetMs]);

  // Auto-follow: scroll active line into a nice reading position, unless user recently scrolled.
  React.useLayoutEffect(() => {
    if (!cues || cues.length === 0) return;
    if (activeIdx < 0) return;

    const now = Date.now();
    if (now < userScrollUntilRef.current) return;

    const sc = scrollerRef.current;
    const viewport = viewportRef.current;
    if (!sc || !viewport) return;

    const activeEl = sc.querySelector<HTMLElement>(
      `[data-lyric-idx="${activeIdx}"]`,
    );
    if (!activeEl) return;

    const vh = viewport.clientHeight;
    if (!vh || vh < 10) return;

    // Keep the reading line slightly above center so upcoming lines “arrive” into the hotspot.
    const targetY = activeEl.offsetTop + activeEl.offsetHeight / 2 - vh * 0.44;
    const nextTop = clamp(
      Math.round(targetY),
      0,
      Math.max(0, sc.scrollHeight - sc.clientHeight),
    );

    isAutoScrollingRef.current = true;
    sc.scrollTo({ top: nextTop, behavior: "smooth" });

    if (autoScrollClearRef.current)
      window.clearTimeout(autoScrollClearRef.current);
    autoScrollClearRef.current = window.setTimeout(() => {
      isAutoScrollingRef.current = false;
    }, 220);

    return () => {
      if (autoScrollClearRef.current)
        window.clearTimeout(autoScrollClearRef.current);
      autoScrollClearRef.current = null;
    };
  }, [cues, activeIdx]);

  // DOM focus compute: uses scrollTop/offsetTop (no getBoundingClientRect spam).
  const scheduleFocusCompute = React.useCallback(() => {
    if (focusRafRef.current != null) return;
    focusRafRef.current = window.requestAnimationFrame(() => {
      focusRafRef.current = null;
      const sc = scrollerRef.current;
      if (!sc) return;

      const center = sc.scrollTop + sc.clientHeight * 0.46;
      const falloff = Math.max(80, sc.clientHeight * (isInline ? 0.32 : 0.38));

      if (Math.abs(center - lastFocusCenterRef.current) < 0.5) return;
      lastFocusCenterRef.current = center;

      for (const el of lineNodeRefs.current) {
        if (!el) continue;
        const mid = el.offsetTop + el.offsetHeight / 2;
        const raw = 1 - Math.abs(mid - center) / falloff;
        const f = clamp(raw, 0, 1);
        el.style.setProperty("--af-focus", String(f));
      }
    });
  }, [isInline]);

  // Recompute focus on mount + resize + active changes (auto-follow moves).
  React.useLayoutEffect(() => {
    scheduleFocusCompute();
    const onResize = () => scheduleFocusCompute();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [scheduleFocusCompute]);

  React.useLayoutEffect(() => {
    scheduleFocusCompute();
  }, [activeIdx, scheduleFocusCompute]);

  React.useLayoutEffect(() => {
    const sc = scrollerRef.current;
    if (!sc || !cues || cues.length === 0) return;

    const measure = () => {
      const lyricRows = Array.from(
        sc.querySelectorAll<HTMLElement>('[data-af-lyric-real="1"]'),
      );

      const first = lyricRows[0] ?? null;
      const last = lyricRows.at(-1) ?? null;

      if (!first || !last) {
        setEdgeSpacers({ topPx: 0, bottomPx: 0 });
        return;
      }

      const vh = sc.clientHeight;
      if (!vh || vh < 10) return;

      const topPx = Math.max(
        0,
        Math.round(vh * readingCenterRatio - padTop - first.offsetHeight / 2),
      );

      const bottomPx = Math.max(
        0,
        Math.round(
          vh * (1 - readingCenterRatio) -
            padBottomBase -
            Math.max(0, Math.floor(reservedBottomPx)) -
            last.offsetHeight / 2,
        ),
      );

      setEdgeSpacers((cur) =>
        cur.topPx === topPx && cur.bottomPx === bottomPx
          ? cur
          : { topPx, bottomPx },
      );
    };

    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [cues, isInline, padTop, padBottomBase, reservedBottomPx]);
  if (!cues || cues.length === 0) {
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          padding: 18,
          color: "rgba(255,255,255,0.82)",
          textAlign: "center",
          pointerEvents: "none",
        }}
      >
        <div style={{ maxWidth: 520 }}>
          <div style={{ fontSize: 14, fontWeight: 650, opacity: 0.95 }}>
            PLAY A TRACK
          </div>
        </div>
      </div>
    );
  }

  const spotlightCenterY = 46; // %
  const { styleVars, padBottom, mask } = buildOverlayRenderLayout(
    variantLayout,
    reservedBottomPx,
  );

  return (
    <div
      key={fadeInKey}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        alignItems: "stretch",
        justifyItems: "stretch",
        padding: variantLayout.rootPadding,
        pointerEvents: "auto",
        ...styleVars,

        // fade-in when lyrics become available / change
        opacity: 0,
        animation: variantLayout.fadeAnimation,
      }}
    >
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          overflow: "hidden",
          background: "transparent",
          borderRadius: 0,
          border: 0,
          boxShadow: "none",
        }}
      >
        {/* Center spotlight scrim (global): dark in reading zone, transparent at edges. */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            background: `radial-gradient(${variantLayout.spotlightW}% ${variantLayout.spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,${variantLayout.spotlightAlpha}) 0%, rgba(0,0,0,0.20) 35%, rgba(0,0,0,0.00) 72%)`,
            WebkitMaskImage: `radial-gradient(${variantLayout.spotlightW}% ${variantLayout.spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)`,
            maskImage: `radial-gradient(${variantLayout.spotlightW}% ${variantLayout.spotlightH}% at 50% ${spotlightCenterY}%, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 85%)`,
            opacity: 0.95,
          }}
        />

        <div
          ref={scrollerRef}
          className="af-lyrics-scroll"
          onScroll={() => {
            if (!isAutoScrollingRef.current)
              userScrollUntilRef.current = Date.now() + 1400;
            scheduleFocusCompute();
          }}
          style={{
            position: "absolute",
            inset: 0,
            overflowY: "auto",
            overflowX: "hidden",
            WebkitOverflowScrolling: "touch",
            padding: `${padTop}px var(--af-lyrics-side-pad) ${padBottom} var(--af-lyrics-side-pad)`,
            display: "grid",
            gap: variantLayout.scrollerGap,
            zIndex: 1,

            // Hide scrollbars (FF/old Edge)
            scrollbarWidth: "none",
            msOverflowStyle: "none",

            // Apply the edge fade here (not in Stage wrappers)
            WebkitMaskImage: mask,
            maskImage: mask,
            WebkitMaskRepeat: "no-repeat",
            maskRepeat: "no-repeat",
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",

            // Encourage compositing to reduce banding/lines on Android
            transform: "translateZ(0)",
            willChange: variantLayout.scrollerWillChange,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              height: edgeSpacers.topPx,
              minHeight: 0,
              pointerEvents: "none",
            }}
          />
          {cues.map((cue, idx) => (
            <LyricRow
              key={lyricRowKey(cue, idx)}
              cue={cue}
              idx={idx}
              activeIdx={activeIdx}
              hoverIdx={hoverIdx}
              revealIdx={revealIdx}
              isInline={isInline}
              exegesisPathToken={exegesisPathToken}
              lineFontSize={variantLayout.lineFontSize}
              setLineNode={setLineNode}
              onMouseEnter={handleLyricMouseEnter}
              onMouseLeave={handleLyricMouseLeave}
              onOpenExegesis={handleOpenExegesis}
              onPointerDown={handleLyricPointerDown}
              onPointerEnd={handleLyricPointerEnd}
              onSeekClick={handleLyricSeek}
              canSeek={Boolean(onSeek)}
            />
          ))}
          <div
            aria-hidden="true"
            style={{
              height: edgeSpacers.bottomPx,
              minHeight: 0,
              pointerEvents: "none",
            }}
          />
        </div>

        <style>{`
          @keyframes afLyricsFadeIn {
            from { opacity: 0; transform: translate3d(0, 6px, 0); filter: blur(1.5px); }
            to   { opacity: 1; transform: translate3d(0, 0, 0); filter: blur(0px); }
          }

          @media (prefers-reduced-motion: reduce) {
            @keyframes afLyricsFadeIn {
              from { opacity: 1; transform: none; filter: none; }
              to   { opacity: 1; transform: none; filter: none; }
            }
          }

          .af-lyrics-scroll::-webkit-scrollbar { width: 0px; height: 0px; }
.af-lyrics-scroll::-webkit-scrollbar-thumb { background: transparent; }

.af-lyric-text {
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

/* iOS Safari is very prone to rasterising transformed/masked text layers softly. */
@supports (-webkit-touch-callout: none) {
  .af-lyrics-scroll {
    transform: none !important;
    will-change: auto !important;
  }

  .af-lyric-text {
    filter: none !important;
    transform: none !important;
    text-rendering: optimizeLegibility;
  }
}

                    /* Inline-only: reveal discourse affordance on hover even if React hover state misses. */
          .af-lyric-row[data-af-inline="1"][data-af-has-track="1"]:hover .af-discourse-btn {
  opacity: 1 !important;
  transform: translateY(calc(-50% + var(--af-discourse-y, 0px))) scale(1) !important;
}

.af-discourse-btn:hover {
  transform: translateY(calc(-50% + var(--af-discourse-y, 0px))) scale(1.12) !important;
  filter: brightness(1.15);
}

/* Subtle radial glow behind discourse icon */
.af-discourse-btn {
  position: absolute; /* matches the inline style model */
}

.af-discourse-btn::before {
  content: "";
  position: absolute;
  inset: -10px; /* halo size */
  border-radius: 999px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 180ms ease, transform 180ms ease;

  background: radial-gradient(
    circle at center,
    rgba(255,255,255,0.18) 0%,
    rgba(255,255,255,0.10) 35%,
    rgba(255,255,255,0.05) 55%,
    rgba(255,255,255,0.0) 75%
  );
  transform: scale(0.9);
}

.af-discourse-btn:hover::before {
  opacity: 1;
  transform: scale(1);
}

          /* Touch reveal path: when we set revealIdx, make sure it shows regardless of hover. */
          .af-lyric-row[data-af-inline="1"][data-af-has-track="1"][data-af-reveal="1"] .af-discourse-btn {
  opacity: 1 !important;
  transform: translateY(calc(-50% + var(--af-discourse-y, 0px))) scale(1) !important;
}
        `}</style>
      </div>
    </div>
  );
}