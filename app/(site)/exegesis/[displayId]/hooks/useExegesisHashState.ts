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

const EXEGESIS_HASH_NAV_EVENT = "af:exegesis-hash-navigation";
const EXEGESIS_PENDING_LINE_KEY = "af:exegesis-pending-line";

type ExegesisHashNavigationDetail = Readonly<{
  lineKey?: string;
  commentId?: string;
  rootId?: string;
}>;

function readPendingLineKey(): string {
  const raw = globalThis.window.sessionStorage.getItem(
    EXEGESIS_PENDING_LINE_KEY,
  );

  if (!raw) return "";

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return "";

    const record = parsed as Record<string, unknown>;
    return typeof record.lineKey === "string" ? record.lineKey.trim() : "";
  } catch {
    return "";
  }
}

function clearPendingLineKey() {
  globalThis.window.sessionStorage.removeItem(EXEGESIS_PENDING_LINE_KEY);
}

function isHashNavigationDetail(
  value: unknown,
): value is ExegesisHashNavigationDetail {
  if (!value || typeof value !== "object") return false;

  const record = value as Record<string, unknown>;

  return (
    (record.lineKey == null || typeof record.lineKey === "string") &&
    (record.commentId == null || typeof record.commentId === "string") &&
    (record.rootId == null || typeof record.rootId === "string")
  );
}

export default function useExegesisHashState(props: {
  lyrics: LyricsApiOk;
  setSelected: React.Dispatch<
    React.SetStateAction<ExegesisSelectedLine | null>
  >;
  setFocusedRootId: React.Dispatch<React.SetStateAction<string>>;
  isMobile: boolean;
  selectedLineKey: string;
  setDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const {
    lyrics,
    setSelected,
    setFocusedRootId,
    isMobile,
    selectedLineKey,
    setDrawerOpen,
  } = props;

  const pendingScrollCommentIdRef = React.useRef<string>("");
  const openFromHashRef = React.useRef<boolean>(false);

  const { recordingId: lyricsRecordingId, cues, groupMap } = lyrics;

  React.useEffect(() => {
    if (!cues || cues.length === 0) return;

    function applyHashState(detail?: ExegesisHashNavigationDetail) {
      const h = parseHash();
      const pendingLineKey = readPendingLineKey();

      const lineKey = (
        detail?.lineKey ??
        pendingLineKey ??
        h.lineKey ??
        ""
      ).trim();
      const commentId = (detail?.commentId ?? h.commentId ?? "").trim();
      const rootId = (detail?.rootId ?? h.rootId ?? "").trim();

      setFocusedRootId(rootId);

      if (!lineKey) {
        setSelected(null);
        return;
      }

      const pick = cues.find((c) => c.lineKey === lineKey);
      if (!pick) {
        setSelected(null);
        return;
      }

      if (pendingLineKey === lineKey) {
        clearPendingLineKey();
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

      pendingScrollCommentIdRef.current = commentId;
      openFromHashRef.current = true;
    }

    function onNativeHashNavigation() {
      applyHashState();
    }

    function onAppHashNavigation(event: Event) {
      const detail =
        event instanceof CustomEvent && isHashNavigationDetail(event.detail)
          ? event.detail
          : undefined;

      applyHashState(detail);
    }

    applyHashState();

    globalThis.window.addEventListener("hashchange", onNativeHashNavigation);
    globalThis.window.addEventListener("popstate", onNativeHashNavigation);
    globalThis.window.addEventListener(
      EXEGESIS_HASH_NAV_EVENT,
      onAppHashNavigation,
    );

    return () => {
      globalThis.window.removeEventListener(
        "hashchange",
        onNativeHashNavigation,
      );
      globalThis.window.removeEventListener("popstate", onNativeHashNavigation);
      globalThis.window.removeEventListener(
        EXEGESIS_HASH_NAV_EVENT,
        onAppHashNavigation,
      );
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
