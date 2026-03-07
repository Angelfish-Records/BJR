// web/app/(site)/exegesis/[recordingId]/components/ExegesisLyricsRail.tsx
"use client";

import React from "react";
import { isParaBreakCue } from "@/app/home/player/lyrics/lyricBreaks";
import type { LyricsApiOk } from "../exegesisTypes";
import {
  cueCanonicalGroupKey,
  isSameGroup,
} from "../exegesisUi";

type ExegesisLyricsRailProps = {
  lyrics: LyricsApiOk;
  selectedLineKey: string;
  selectedGroupKey: string;
  hoverGroupKey: string;
  hoverLineKey: string;
  lyricsWrapRef: React.RefObject<HTMLDivElement | null>;
  lineBtnByKeyRef: React.MutableRefObject<
    Record<string, HTMLButtonElement | null>
  >;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerLeave: () => void;
  onLineFocus: (next: { gk: string; lk: string }) => void;
  onLineBlur: () => void;
  onSelectLine: (payload: {
    lineKey: string;
    lineText: string;
    tMs: number;
    groupKey?: string;
  }) => void;
};

export default function ExegesisLyricsRail({
  lyrics,
  selectedLineKey,
  selectedGroupKey,
  hoverGroupKey,
  hoverLineKey,
  lyricsWrapRef,
  lineBtnByKeyRef,
  onPointerMove,
  onPointerLeave,
  onLineFocus,
  onLineBlur,
  onSelectLine,
}: ExegesisLyricsRailProps) {
  return (
    <div ref={lyricsWrapRef} className="rounded-xl bg-white/5 p-4">
      <div
        className="mt-3 flex flex-col"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {(lyrics.cues ?? []).map((cue) => {
          if (isParaBreakCue(cue)) {
            return (
              <div
                key={`br-${cue.lineKey}`}
                aria-hidden="true"
                className="h-3"
              />
            );
          }

          const isSelected = selectedLineKey === cue.lineKey;
          const groupKey = cueCanonicalGroupKey(lyrics, cue);

          const isGrouped = !!groupKey;
          const inSelectedGroup =
            isGrouped && isSameGroup(groupKey, selectedGroupKey);
          const inHoverGroup =
            isGrouped && isSameGroup(groupKey, hoverGroupKey);
          const inHoverLine = !isGrouped && hoverLineKey === cue.lineKey;

          const inPreview =
            isSelected || inSelectedGroup || inHoverGroup || inHoverLine;

          return (
            <button
              key={cue.lineKey}
              ref={(el) => {
                lineBtnByKeyRef.current[cue.lineKey] = el;
              }}
              type="button"
              className="block w-full py-0.5 text-left"
              data-linekey={cue.lineKey}
              data-groupkey={groupKey}
              onFocus={() => onLineFocus({ gk: groupKey, lk: cue.lineKey })}
              onBlur={onLineBlur}
              onClick={() => {
                const nextGroupKey = cueCanonicalGroupKey(lyrics, cue);
                onSelectLine({
                  lineKey: cue.lineKey,
                  lineText: cue.text,
                  tMs: cue.tMs,
                  groupKey: nextGroupKey || undefined,
                });
              }}
            >
              <span
                className="inline-block rounded px-1.5 py-0.5 text-sm leading-snug transition-colors duration-75"
                style={{
                  backgroundColor: isSelected
                    ? "var(--lxSelected)"
                    : inPreview
                      ? "var(--lxHover)"
                      : "var(--lxRow)",
                }}
              >
                <span className="opacity-90">{cue.text}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}