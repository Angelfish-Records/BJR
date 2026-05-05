"use client";

import React from "react";
import type { LyricsApiOk } from "../exegesisTypes";
import { parseHash } from "../exegesisUi";

export type ExegesisSelectedLine = {
  lineKey: string;
  lineText: string;
  tMs: number;
  groupKey?: string;
};

export default function useExegesisHashState(props: {
  lyrics: LyricsApiOk;
  setSelected: React.Dispatch<
    React.SetStateAction<ExegesisSelectedLine | null>
  >;
  setFocusedRootId: React.Dispatch<React.SetStateAction<string>>;
  threadKey: string;
  isMobile: boolean;
  selectedLineKey: string;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    lyrics,
    setSelected,
    setFocusedRootId,
    threadKey,
    isMobile,
    selectedLineKey,
    setDrawerOpen,
  } = props;

  const pendingScrollCommentIdRef = React.useRef<string>("");
  const openFromHashRef = React.useRef<boolean>(false);

  const { recordingId: lyricsRecordingId, cues, groupMap } = lyrics;

  React.useEffect(() => {
    if (!cues || cues.length === 0) return;

    function applyHashState() {
      const h = parseHash();

      const rid = (h.rootId ?? "").trim();
      setFocusedRootId(rid);

      if (!h.lineKey) {
        setSelected(null);
        return;
      }

      const pick = cues.find((c) => c.lineKey === h.lineKey);
      if (!pick) {
        setSelected(null);
        return;
      }

      setSelected({
        lineKey: pick.lineKey,
        lineText: pick.text,
        tMs: pick.tMs,
        groupKey:
          (groupMap?.[pick.lineKey]?.canonicalGroupKey ??
            pick.canonicalGroupKey ??
            "") ||
          undefined,
      });

      if (h.commentId) pendingScrollCommentIdRef.current = h.commentId;

      openFromHashRef.current = true;
    }

    applyHashState();

    globalThis.window.addEventListener("hashchange", applyHashState);
    globalThis.window.addEventListener("popstate", applyHashState);

    return () => {
      globalThis.window.removeEventListener("hashchange", applyHashState);
      globalThis.window.removeEventListener("popstate", applyHashState);
    };
  }, [lyricsRecordingId, cues, groupMap, setSelected, setFocusedRootId]);

  React.useEffect(() => {
    if (!isMobile) return;
    if (!selectedLineKey) return;
    if (!openFromHashRef.current) return;

    setDrawerOpen(true);
    openFromHashRef.current = false;
  }, [isMobile, selectedLineKey, setDrawerOpen]);

  return {
    pendingScrollCommentIdRef,
  };
}
