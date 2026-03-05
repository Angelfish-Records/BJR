// web/app/home/player/PlayerState.tsx
"use client";

import React from "react";
import type { PlayerTrack } from "@/lib/types";
import { ensureLyricsForTrack } from "@/app/home/player/lyrics/ensureLyricsForTrack";

type PlayerStatus = "idle" | "loading" | "playing" | "paused";
type RepeatMode = "off" | "one" | "all";
type Intent = "play" | "pause" | null;
type LoadingReason = "token" | "attach" | "buffering" | undefined;

export type QueueContext = {
  contextId?: string;
  contextSlug?: string;
  contextTitle?: string;
  contextArtist?: string;
  artworkUrl?: string | null;
};

export type PlayerState = {
  status: PlayerStatus;
  current?: PlayerTrack;
  queue: PlayerTrack[];
  lastError?: string;
  lastPlayAttemptAtMs?: number;

  queueContextId?: string;
  queueContextSlug?: string;
  queueContextTitle?: string;
  queueContextArtist?: string;
  queueContextArtworkUrl?: string | null;

  intent: Intent;
  intentAtMs?: number;
  selectedRecordingId?: string;
  pendingRecordingId?: string;

  pendingSeekMs?: number;
  seeking: boolean;

  loadingReason?: LoadingReason;
  reloadNonce: number;

  positionMs: number;
  seekNonce: number;

  volume: number;
  muted: boolean;
  repeat: RepeatMode;

  durationByRecordingId: Record<string, number>;
};

type PlayerActions = {
  play: (track?: PlayerTrack) => void;
  pause: () => void;
  next: () => void;
  prev: () => void;

  setQueue: (tracks: PlayerTrack[], opts?: QueueContext) => void;
  enqueue: (track: PlayerTrack) => void;
  clearQueue: () => void;

  setPositionMs: (ms: number) => void;
  setDurationMs: (ms: number) => void;

  setStatusExternal: (s: PlayerStatus) => void;
  setLoadingReasonExternal: (r?: LoadingReason) => void;

  setIntent: (i: Intent) => void;
  clearIntent: () => void;
  selectTrack: (id?: string) => void;
  setPendingRecordingId: (id?: string) => void;
  resolvePendingTrack: (id: string) => void;

  seek: (ms: number) => void;
  clearPendingSeek: () => void;

  setVolume: (v: number) => void;
  toggleMute: () => void;

  cycleRepeat: () => void;
  tick: (deltaMs: number) => void;

  clearError: () => void;
  bumpReload: () => void;
};

const PlayerCtx = React.createContext<(PlayerState & PlayerActions) | null>(null);

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

function nextRepeat(r: RepeatMode): RepeatMode {
  if (r === "off") return "all";
  if (r === "all") return "one";
  return "off";
}

function hydrateTrack(
  t: PlayerTrack,
  durationByRecordingId: Record<string, number>,
): PlayerTrack {
  const cached = durationByRecordingId[t.recordingId];
  if (!cached || cached <= 0) return t;
  if (t.durationMs === cached) return t;
  return { ...t, durationMs: cached };
}

function hydrateTracks(ts: PlayerTrack[], durationByRecordingId: Record<string, number>) {
  let changed = false;
  const next = ts.map((t) => {
    const ht = hydrateTrack(t, durationByRecordingId);
    if (ht !== t) changed = true;
    return ht;
  });
  return changed ? next : ts;
}

function primeDurationByRecordingId(
  prev: Record<string, number>,
  tracks: PlayerTrack[],
): Record<string, number> {
  let next = prev;
  for (const t of tracks) {
    if (!t?.recordingId) continue;
    const ms = t.durationMs;
    if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) continue;
    if (typeof next[t.recordingId] === "number" && next[t.recordingId] > 0) continue;
    if (next === prev) next = { ...prev };
    next[t.recordingId] = ms;
  }
  return next;
}

export function PlayerStateProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<PlayerState>({
    status: "idle",
    current: undefined,
    queue: [],
    lastError: undefined,
    lastPlayAttemptAtMs: undefined,

    queueContextId: undefined,
    queueContextSlug: undefined,
    queueContextTitle: undefined,
    queueContextArtist: undefined,
    queueContextArtworkUrl: null,

    intent: null,
    intentAtMs: undefined,
    selectedRecordingId: undefined,
    pendingRecordingId: undefined,

    pendingSeekMs: undefined,
    seeking: false,

    loadingReason: undefined,
    reloadNonce: 0,

    positionMs: 0,
    seekNonce: 0,

    volume: 0.9,
    muted: false,
    repeat: "off",

    durationByRecordingId: {},
  });

  const api: PlayerState & PlayerActions = React.useMemo(() => {
    return {
      ...state,

      setIntent: (i: Intent) =>
        setState((s) => ({
          ...s,
          intent: i,
          intentAtMs: i ? Date.now() : undefined,
        })),

      clearIntent: () =>
        setState((s) =>
          s.intent ? { ...s, intent: null, intentAtMs: undefined } : s,
        ),

      selectTrack: (id?: string) =>
        setState((s) => ({
          ...s,
          selectedRecordingId: id,
        })),

      setPendingRecordingId: (id?: string) =>
        setState((s) => ({
          ...s,
          pendingRecordingId: id,
        })),

      resolvePendingTrack: (id: string) =>
        setState((s) => {
          if (s.pendingRecordingId !== id) return s;
          return { ...s, pendingRecordingId: undefined };
        }),

      play: (track?: PlayerTrack) => {
        setState((s) => {
          const now = Date.now();

          const rawNext = track ?? s.current ?? s.queue[0];
          if (!rawNext) {
            return {
              ...s,
              status: "idle",
              current: undefined,
              positionMs: 0,
              intent: "play",
              intentAtMs: now,
              lastPlayAttemptAtMs: now,
              lastError: undefined,
              loadingReason: undefined,
              pendingRecordingId: undefined,
            };
          }

          const nextTrack = hydrateTrack(rawNext, s.durationByRecordingId);
          const sameTrack = Boolean(s.current && s.current.recordingId === nextTrack.recordingId);

          const base = {
            ...s,
            intent: "play" as const,
            intentAtMs: now,
            lastPlayAttemptAtMs: now,
            lastError: undefined,
            selectedRecordingId: nextTrack.recordingId,
            pendingRecordingId: nextTrack.recordingId,
          };

          if (sameTrack && s.status === "paused") {
            return {
              ...base,
              current: hydrateTrack(s.current!, s.durationByRecordingId),
              status: "paused",
              loadingReason: undefined,
            };
          }

          if (sameTrack && (s.status === "playing" || s.status === "loading")) {
            return { ...base, loadingReason: s.loadingReason };
          }

          return {
            ...base,
            current: nextTrack,
            status: "loading",
            loadingReason: "token",
            positionMs: 0,
          };
        });
      },

      pause: () =>
        setState((s) => ({
          ...s,
          intent: "pause",
          intentAtMs: Date.now(),
        })),

      next: () => {
        setState((s) => {
          const cur = s.current;
          if (!cur || s.queue.length === 0) return s;

          const idx = s.queue.findIndex((t) => t.recordingId === cur.recordingId);
          const at = idx >= 0 ? idx : 0;

          if (s.repeat === "one") {
            return {
              ...s,
              status: "loading",
              loadingReason: "attach",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: cur.recordingId,
              selectedRecordingId: cur.recordingId,
            };
          }

          const nextIdx = at + 1;
          if (nextIdx < s.queue.length) {
            const t = hydrateTrack(s.queue[nextIdx], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              status: "loading",
              loadingReason: "token",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: t.recordingId,
              selectedRecordingId: t.recordingId,
            };
          }

          if (s.repeat === "all" && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[0], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              status: "loading",
              loadingReason: "token",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: t.recordingId,
              selectedRecordingId: t.recordingId,
            };
          }

          return {
            ...s,
            status: "paused",
            intent: "pause",
            intentAtMs: Date.now(),
            positionMs: 0,
            pendingSeekMs: 0,
            seeking: true,
            seekNonce: s.seekNonce + 1,
            loadingReason: undefined,
            pendingRecordingId: undefined,
          };
        });
      },

      prev: () => {
        setState((s) => {
          const cur = s.current;
          if (!cur || s.queue.length === 0) return s;

          if (s.status === "playing" && s.positionMs > 3000) {
            return {
              ...s,
              positionMs: 0,
              status: "loading",
              loadingReason: "attach",
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: cur.recordingId,
              selectedRecordingId: cur.recordingId,
            };
          }

          const idx = s.queue.findIndex((t) => t.recordingId === cur.recordingId);
          const at = idx >= 0 ? idx : 0;
          const prevIdx = at - 1;

          if (prevIdx >= 0) {
            const t = hydrateTrack(s.queue[prevIdx], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              status: "loading",
              loadingReason: "token",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: t.recordingId,
              selectedRecordingId: t.recordingId,
            };
          }

          if (s.repeat === "all" && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[s.queue.length - 1], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              status: "loading",
              loadingReason: "token",
              positionMs: 0,
              intent: "play",
              intentAtMs: Date.now(),
              pendingRecordingId: t.recordingId,
              selectedRecordingId: t.recordingId,
            };
          }

          return {
            ...s,
            positionMs: 0,
            status: "loading",
            loadingReason: "attach",
            intent: "play",
            intentAtMs: Date.now(),
            pendingRecordingId: cur.recordingId,
            selectedRecordingId: cur.recordingId,
          };
        });
      },

      setQueue: (tracks: PlayerTrack[], opts?: QueueContext) =>
        setState((s) => {
          const nextDurationByRecordingId = primeDurationByRecordingId(s.durationByRecordingId, tracks);
          const hydratedQueue = hydrateTracks(tracks, nextDurationByRecordingId);

          const nextCurrentRaw = s.current ?? hydratedQueue[0];
          const nextCurrent = nextCurrentRaw
            ? hydrateTrack(nextCurrentRaw, nextDurationByRecordingId)
            : undefined;

          const slug =
            typeof opts?.contextSlug === "string" ? opts.contextSlug.trim() : "";
          const title =
            typeof opts?.contextTitle === "string"
              ? opts.contextTitle.trim()
              : "";
          const artist =
            typeof opts?.contextArtist === "string"
              ? opts.contextArtist.trim()
              : "";

          const hasSlug = slug.length > 0;
          const hasTitle = title.length > 0;
          const hasArtist = artist.length > 0;
          const hasArtwork = typeof opts?.artworkUrl !== "undefined";
          const hasId =
            typeof opts?.contextId === "string" && opts.contextId.length > 0;

          return {
            ...s,
            durationByRecordingId: nextDurationByRecordingId,
            queue: hydratedQueue,

            queueContextId: hasId ? opts!.contextId : s.queueContextId,
            queueContextSlug: hasSlug ? slug : s.queueContextSlug,
            queueContextTitle: hasTitle ? title : s.queueContextTitle,
            queueContextArtist: hasArtist ? artist : s.queueContextArtist,
            queueContextArtworkUrl: hasArtwork
              ? (opts!.artworkUrl ?? null)
              : (s.queueContextArtworkUrl ?? null),

            current: nextCurrent,
            positionMs: s.current ? s.positionMs : 0,
            selectedRecordingId: s.selectedRecordingId ?? nextCurrent?.recordingId,
          };
        }),

      enqueue: (track: PlayerTrack) =>
        setState((s) => {
          const nextDurationByRecordingId = primeDurationByRecordingId(s.durationByRecordingId, [track]);
          const t = hydrateTrack(track, nextDurationByRecordingId);
          return {
            ...s,
            durationByRecordingId: nextDurationByRecordingId,
            queue: [...s.queue, t],
            current: s.current ?? t,
            selectedRecordingId: s.selectedRecordingId ?? t.recordingId,
          };
        }),

      clearQueue: () =>
        setState((s) => ({
          ...s,
          queue: [],
          current: undefined,
          selectedRecordingId: undefined,
          pendingRecordingId: undefined,

          positionMs: 0,
          pendingSeekMs: undefined,
          seeking: false,
          seekNonce: s.seekNonce + 1,
          loadingReason: undefined,
        })),

      setPositionMs: (ms: number) =>
        setState((s) => ({
          ...s,
          positionMs: Math.max(0, ms),
        })),

      setDurationMs: (ms: number) =>
        setState((s) => {
          const cur = s.current;
          if (!cur) return s;
          if (!Number.isFinite(ms) || ms <= 0) return s;

          const alreadyCached =
            typeof s.durationByRecordingId[cur.recordingId] === "number" && s.durationByRecordingId[cur.recordingId] > 0;
          const alreadyOnTrack =
            typeof cur.durationMs === "number" && cur.durationMs > 0;
          if (alreadyCached || alreadyOnTrack) return s;

          const nextDurationByRecordingId = { ...s.durationByRecordingId, [cur.recordingId]: ms };

          const nextCurrent = { ...cur, durationMs: ms };
          let changed = false;
          const nextQueue = s.queue.map((t) => {
            if (t.recordingId !== cur.recordingId) return t;
            if (typeof t.durationMs === "number" && t.durationMs > 0) return t;
            changed = true;
            return { ...t, durationMs: ms };
          });

          return {
            ...s,
            durationByRecordingId: nextDurationByRecordingId,
            current: nextCurrent,
            queue: changed ? nextQueue : s.queue,
          };
        }),

      setStatusExternal: (st: PlayerStatus) =>
        setState((s) => (s.status === st ? s : { ...s, status: st })),

      setLoadingReasonExternal: (r?: LoadingReason) =>
        setState((s) => (s.loadingReason === r ? s : { ...s, loadingReason: r })),

      seek: (ms: number) => {
        setState((s) => {
          const curId = s.current?.recordingId ?? "";
          const dur =
            (curId ? s.durationByRecordingId[curId] : 0) || s.current?.durationMs || 0;
          const next = dur > 0 ? clamp(ms, 0, dur) : Math.max(0, ms);
          return {
            ...s,
            positionMs: next,
            pendingSeekMs: next,
            seeking: true,
            seekNonce: s.seekNonce + 1,
          };
        });
      },

      clearPendingSeek: () =>
        setState((s) => {
          if (!s.seeking && s.pendingSeekMs == null) return s;
          return { ...s, seeking: false, pendingSeekMs: undefined };
        }),

      setVolume: (v: number) => setState((s) => ({ ...s, volume: clamp(v, 0, 1) })),
      toggleMute: () => setState((s) => ({ ...s, muted: !s.muted })),

      cycleRepeat: () => setState((s) => ({ ...s, repeat: nextRepeat(s.repeat) })),

      tick: (deltaMs: number) => {
        setState((s) => {
          if (s.status !== "playing") return s;

          const curId = s.current?.recordingId ?? "";
          const dur =
            (curId ? s.durationByRecordingId[curId] : 0) || s.current?.durationMs || 0;
          const nextPos = Math.max(0, s.positionMs + Math.max(0, deltaMs));

          if (dur <= 0) return { ...s, positionMs: nextPos };
          if (nextPos < dur) return { ...s, positionMs: nextPos };

          if (s.repeat === "one") return { ...s, positionMs: 0 };

          const cur = s.current;
          const idx = cur ? s.queue.findIndex((t) => t.recordingId === cur.recordingId) : -1;
          const at = idx >= 0 ? idx : 0;
          const nextIdx = at + 1;

          if (nextIdx < s.queue.length) {
            const t = hydrateTrack(s.queue[nextIdx], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              positionMs: 0,
              selectedRecordingId: t.recordingId,
              pendingRecordingId: t.recordingId,
            };
          }

          if (s.repeat === "all" && s.queue.length > 0) {
            const t = hydrateTrack(s.queue[0], s.durationByRecordingId);
            return {
              ...s,
              current: t,
              positionMs: 0,
              selectedRecordingId: t.recordingId,
              pendingRecordingId: t.recordingId,
            };
          }

          return { ...s, status: "paused", positionMs: dur };
        });
      },

      clearError: () =>
        setState((s) => (s.lastError ? { ...s, lastError: undefined } : s)),

      bumpReload: () =>
        setState((s) => {
          if (!s.current?.muxPlaybackId) {
            return { ...s, reloadNonce: s.reloadNonce + 1 };
          }
          return {
            ...s,
            reloadNonce: s.reloadNonce + 1,
            status: "loading",
            loadingReason: "token",
            lastError: undefined,
            intent: "play",
            intentAtMs: Date.now(),
            pendingRecordingId: s.current.recordingId,
            selectedRecordingId: s.current.recordingId,
          };
        }),
    };
  }, [state]);

  const currentId = state.current?.recordingId ?? null;
  const pendingId = state.pendingRecordingId ?? null;

  React.useEffect(() => {
    const id = (currentId ?? "").trim();
    if (!id) return;
    void ensureLyricsForTrack(id);
  }, [currentId]);

  React.useEffect(() => {
    const id = (pendingId ?? "").trim();
    if (!id) return;
    void ensureLyricsForTrack(id);
  }, [pendingId]);

  return <PlayerCtx.Provider value={api}>{props.children}</PlayerCtx.Provider>;
}

export function usePlayer() {
  const ctx = React.useContext(PlayerCtx);
  if (!ctx) throw new Error("usePlayer must be used within PlayerStateProvider");
  return ctx;
}